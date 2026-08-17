import "dotenv/config";
import http from "http";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import type { ErrorRequestHandler } from "express";
import { PrismaClient } from "@prisma/client";
import { registerRoutes } from "./routes";
import { createRequestAuthenticator } from "./auth/guard";
import { attachStreamServer } from "./ws/stream";
import { ensureDatabasePerformanceArtifacts } from "./lib/dbPerformance";
import { startDiscordMarketStreamScheduler, stopDiscordMarketStreamScheduler } from "./lib/discordMarketStream";
import { recordDbQuery, runWithRequestMetrics, getRequestMetrics } from "./lib/requestMetrics";
import { startSnapshotScheduler } from "./lib/snapshotRegistry";
import { validateApiRuntimeEnv } from "./lib/runtimeConfig";
import { ensureRateLimitStoreReady } from "./security/rateLimit";
import { startMobileNotificationDispatcher, stopMobileNotificationDispatcher } from "./services/mobileNotificationDispatcher";

const SLOW_QUERY_MS = Number(process.env.SLOW_QUERY_MS ?? 250);

validateApiRuntimeEnv();

const prisma = new PrismaClient({
  log: [
    { emit: "event", level: "query" },
    { emit: "stdout", level: "error" },
    { emit: "stdout", level: "warn" }
  ]
});

prisma.$on("query", (event) => {
  recordDbQuery(event.duration);
  if (event.duration < SLOW_QUERY_MS) return;
  // eslint-disable-next-line no-console
  console.warn(JSON.stringify({
    ts: new Date().toISOString(),
    level: "warn",
    event: "slow_db_query",
    durationMs: event.duration,
    target: event.target,
    query: event.query
  }));
});

function parseAllowedOrigins(value: string | undefined): Set<string> {
  if (!value) return new Set();
  return new Set(
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
  );
}

function isLocalDevOrigin(origin: string): boolean {
  try {
    const parsed = new URL(origin);
    if (!["http:", "https:"].includes(parsed.protocol)) return false;
    return parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1" || parsed.hostname === "::1";
  } catch {
    return false;
  }
}

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade"
]);

const REWRITTEN_PROXY_HEADERS = new Set([
  "content-encoding",
  "content-length"
]);

const APP_CONTENT_SECURITY_POLICY = {
  useDefaults: true,
  directives: {
    "default-src": ["'self'"],
    "script-src": [
      "'self'",
      "https://www.googletagmanager.com",
      "https://www.google-analytics.com",
      "https://www.clarity.ms",
      "https://scripts.clarity.ms",
      "https://static.cloudflareinsights.com",
      "https://apis.google.com"
    ],
    "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
    "img-src": ["'self'", "data:", "https:"],
    "font-src": ["'self'", "data:", "https://fonts.gstatic.com"],
    "connect-src": [
      "'self'",
      "ws:",
      "wss:",
      "https://identitytoolkit.googleapis.com",
      "https://securetoken.googleapis.com",
      "https://www.googleapis.com",
      "https://firebase.googleapis.com",
      "https://firebaseinstallations.googleapis.com",
      "https://www.google-analytics.com",
      "https://analytics.google.com",
      "https://www.googletagmanager.com",
      "https://www.clarity.ms",
      "https://scripts.clarity.ms",
      "https://d.clarity.ms",
      "https://h.clarity.ms",
      "https://cloudflareinsights.com",
      "https://c.bing.com",
      "https://dc.services.visualstudio.com",
      "https://stats.g.doubleclick.net"
    ],
    "frame-src": ["'self'", "https://nifty50-2day.firebaseapp.com"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"]
  }
} satisfies NonNullable<Parameters<typeof helmet>[0]>["contentSecurityPolicy"];

function applyProxiedHeaders(res: express.Response, upstreamHeaders: Headers) {
  upstreamHeaders.forEach((value, key) => {
    if (HOP_BY_HOP_HEADERS.has(key.toLowerCase())) return;
    if (REWRITTEN_PROXY_HEADERS.has(key.toLowerCase())) return;
    res.setHeader(key, value);
  });
}

function buildMatomoProxyBody(req: express.Request): string | Buffer | undefined {
  if (req.method === "GET" || req.method === "HEAD") return undefined;

  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === "string") return req.body;
  if (req.body && typeof req.body === "object") {
    const contentType = req.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      return JSON.stringify(req.body);
    }
  }

  return undefined;
}

async function main() {
  const app = express();
  const serveClient = process.env.SERVE_CLIENT === "1" || process.env.NODE_ENV === "production";
  const auth = createRequestAuthenticator();
  await auth.ensureReady();
  await ensureRateLimitStoreReady();
  const allowedOrigins = parseAllowedOrigins(process.env.CORS_ALLOWED_ORIGINS);
  const allowImplicitLocalDevOrigins = allowedOrigins.size === 0 && process.env.NODE_ENV !== "production";

  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(express.json({ limit: "1mb" }));

  app.use(
    cors({
      origin(origin, cb) {
        if (!origin) return cb(null, true);
        if (allowedOrigins.has(origin)) return cb(null, true);
        if (allowImplicitLocalDevOrigins && isLocalDevOrigin(origin)) return cb(null, true);
        return cb(null, false);
      },
      credentials: true,
      methods: ["GET", "HEAD", "OPTIONS", "POST"],
      allowedHeaders: ["Content-Type", "Authorization", "X-CSRF-Token", "Idempotency-Key", "X-Request-Id"]
    })
  );

  app.use(
    helmet({
      contentSecurityPolicy: APP_CONTENT_SECURITY_POLICY,
      crossOriginOpenerPolicy: { policy: "same-origin" },
      crossOriginResourcePolicy: { policy: "same-origin" },
      frameguard: { action: "deny" },
      referrerPolicy: { policy: "strict-origin-when-cross-origin" }
    })
  );

  app.use((req, res, next) => {
    const startedAt = Date.now();
    const requestId = typeof req.headers["x-request-id"] === "string" ? req.headers["x-request-id"] : randomUUID();
    runWithRequestMetrics(requestId, () => {
      res.setHeader("X-Request-Id", requestId);
      res.on("finish", () => {
        const metrics = getRequestMetrics();
        // eslint-disable-next-line no-console
        console.info(JSON.stringify({
          ts: new Date().toISOString(),
          level: "info",
          event: "http_request_completed",
          requestId,
          method: req.method,
          path: req.originalUrl,
          status: res.statusCode,
          durationMs: Date.now() - startedAt,
          dbQueryCount: metrics?.dbQueryCount ?? 0,
          dbQueryDurationMs: Number((metrics?.dbQueryDurationMs ?? 0).toFixed(1)),
          snapshotKey: metrics?.snapshotKey ?? null,
          snapshotStatus: metrics?.snapshotStatus ?? null,
          snapshotSource: metrics?.snapshotSource ?? null,
          snapshotAgeMs: metrics?.snapshotAgeMs ?? null
        }));
      });
      next();
    });
  });

  // Support deployments where a reverse proxy forwards a prefixed API path.
  app.use((req, _res, next) => {
    if (req.url.startsWith("/api/n50/")) {
      req.url = req.url.slice("/api/n50".length);
    } else if (req.url.startsWith("/api/n50-stage/")) {
      req.url = req.url.slice("/api/n50-stage".length);
    }
    next();
  });

  const exportApiBaseUrl = (process.env.EXPORT_API_BASE_URL ?? "http://nse-export-api:8091").replace(/\/+$/, "");
  const intradayApiBaseUrl = (process.env.INTRADAY_API_BASE_URL ?? "http://nse-intraday-api:8092").replace(/\/+$/, "");
  const matomoProxyBaseUrl = (process.env.MATOMO_PROXY_BASE_URL ?? "http://matomo:80").replace(/\/+$/, "");

  app.use(async (req, res, next) => {
    const isSupportedMethod = req.method === "GET" || req.method === "HEAD" || req.method === "POST";
    if (!isSupportedMethod || !req.path.startsWith("/matomo/")) return next();

    try {
      const upstreamPath = req.url.replace(/^\/matomo/, "");
      const upstreamUrl = `${matomoProxyBaseUrl}${upstreamPath}`;
      const proxyHeaders: Record<string, string> = {
        Accept: req.get("accept") ?? "*/*",
        "User-Agent": req.get("user-agent") ?? "n50-dashboard-matomo-proxy"
      };
      const contentType = req.get("content-type");
      if (contentType) {
        proxyHeaders["Content-Type"] = contentType;
      }
      const body = buildMatomoProxyBody(req);
      const upstreamResponse = await fetch(upstreamUrl, {
        method: req.method,
        headers: proxyHeaders,
        body
      });
      applyProxiedHeaders(res, upstreamResponse.headers);
      res.status(upstreamResponse.status);

      if (req.method === "HEAD") {
        res.end();
        return;
      }

      const buffer = Buffer.from(await upstreamResponse.arrayBuffer());
      res.send(buffer);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Failed to proxy Matomo asset request", {
        path: req.originalUrl,
        targetBaseUrl: matomoProxyBaseUrl,
        error
      });
      next(error);
    }
  });

  app.use(async (req, res, next) => {
    const isGetLike = req.method === "GET" || req.method === "HEAD";
    if (!isGetLike) return next();

    const targetBaseUrl = req.path.startsWith("/api/v1/intraday/")
      ? intradayApiBaseUrl
      : (
          req.path.startsWith("/api/v1/dashboard/") ||
          req.path.startsWith("/api/v1/watchlists") ||
          req.path.startsWith("/api/v1/ops/") ||
          req.path.startsWith("/api/v1/exports/")
        )
        ? exportApiBaseUrl
        : null;

    if (!targetBaseUrl) return next();

    try {
      const upstreamUrl = `${targetBaseUrl}${req.originalUrl}`;
      const upstreamResponse = await fetch(upstreamUrl, {
        method: req.method,
        headers: {
          Accept: req.get("accept") ?? "application/json",
          "User-Agent": req.get("user-agent") ?? "n50-dashboard-proxy"
        }
      });
      applyProxiedHeaders(res, upstreamResponse.headers);
      res.status(upstreamResponse.status);

      if (req.method === "HEAD") {
        res.end();
        return;
      }

      const buffer = Buffer.from(await upstreamResponse.arrayBuffer());
      res.send(buffer);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Failed to proxy dashboard data request", {
        path: req.originalUrl,
        targetBaseUrl,
        error
      });
      next(error);
    }
  });

  await ensureDatabasePerformanceArtifacts(prisma);
  registerRoutes(app, prisma, auth.middleware, auth);

  const snapshotSchedulerEnabled = (process.env.DASHBOARD_SNAPSHOT_SCHEDULER_ENABLED ?? "1").trim() !== "0";
  if (snapshotSchedulerEnabled) {
    startSnapshotScheduler(prisma);
  } else {
    console.info(JSON.stringify({
      ts: new Date().toISOString(),
      level: "info",
      event: "dashboard_snapshot_scheduler_disabled"
    }));
  }

  startDiscordMarketStreamScheduler(prisma);
  startMobileNotificationDispatcher(prisma);

  const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
    if (res.headersSent) return;

    const rawStatus = Number((err as { status?: unknown })?.status);
    const status = Number.isFinite(rawStatus) && rawStatus >= 400 && rawStatus < 600 ? rawStatus : 500;
    const rawCode = (err as { code?: unknown })?.code;
    const defaultCode = status >= 500 ? "INTERNAL_ERROR" : "REQUEST_ERROR";
    const code = typeof rawCode === "string" && rawCode.trim().length > 0 ? rawCode.trim() : defaultCode;

    let message = status >= 500 ? "Internal server error." : "Request failed.";
    if (err instanceof SyntaxError && "body" in err) {
      message = "Invalid JSON payload.";
    } else if (status < 500) {
      const errMessage = (err as { message?: unknown })?.message;
      if (typeof errMessage === "string" && errMessage.trim().length > 0) {
        message = errMessage.trim();
      }
    }

    if (status >= 500) {
      // eslint-disable-next-line no-console
      console.error("Unhandled API error", {
        path: req.originalUrl,
        method: req.method,
        error: err
      });
    }

    res.status(status).json({ error: { code, message } });
  };
  app.use(errorHandler);

  if (serveClient) {
    const cwd = process.cwd();
    const candidates = [
      path.resolve(cwd, "web-dist"),
      path.resolve(cwd, "../web/dist"),
      path.resolve(cwd, "../../apps/web/dist"),
      path.resolve(cwd, "apps/api/web-dist"),
      path.resolve(cwd, "apps/web/dist")
    ];
    const clientDist = candidates.find((p) => existsSync(path.join(p, "index.html")));
    if (clientDist) {
      const indexFile = path.join(clientDist, "index.html");
      app.use(express.static(clientDist));
      app.get("*", (req, res, next) => {
        if (req.path.startsWith("/v1") || req.path === "/health") return next();
        return res.sendFile(indexFile);
      });
    }
  }

  const port = Number(process.env.PORT ?? 8080);

  const server = http.createServer(app);
  attachStreamServer(server, prisma, auth.authenticateUpgrade);

  server.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`API listening on http://localhost:${port}`);
  });

  // Graceful shutdown
  const shutdown = async () => {
    server.close();
    stopDiscordMarketStreamScheduler();
    stopMobileNotificationDispatcher();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch(async (e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
