import type { IncomingMessage } from "http";
import type { Request, RequestHandler, Response } from "express";
import { SessionStore, type SessionRecord, type SessionStoreHealth, type SessionUser } from "./session";
import { getFirebaseWebApiKey, isDevLocalAuthEnabled } from "../lib/runtimeConfig";

type FirebaseLookupResponse = {
  users?: Array<{
    localId?: string;
    email?: string;
    emailVerified?: boolean;
    displayName?: string;
  }>;
  error?: { message?: string };
};

type CachedAuth = {
  user: SessionUser;
  expiresAt: number;
};

type RequestLikeForLog = {
  headers: IncomingMessage["headers"];
  ip?: string;
};

const tokenCache = new Map<string, CachedAuth>();

export class RequestAuthError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function parseJwtExpiryMs(token: string): number {
  const parts = token.split(".");
  if (parts.length !== 3) return Date.now() + 60_000;
  try {
    const payloadRaw = parts[1]!.replace(/-/g, "+").replace(/_/g, "/");
    const padded = payloadRaw.padEnd(payloadRaw.length + ((4 - (payloadRaw.length % 4)) % 4), "=");
    const payload = JSON.parse(Buffer.from(padded, "base64").toString("utf8")) as { exp?: number };
    if (!payload.exp || !Number.isFinite(payload.exp)) return Date.now() + 60_000;
    return payload.exp * 1000;
  } catch {
    return Date.now() + 60_000;
  }
}

function getAuthError(err: unknown): RequestAuthError {
  if (err instanceof RequestAuthError) return err;
  if (err instanceof Error) {
    return new RequestAuthError(401, "AUTH_FAILED", err.message || "Authentication failed.");
  }
  return new RequestAuthError(401, "AUTH_FAILED", "Authentication failed.");
}

function firstNonEmpty(...values: Array<string | undefined | null>): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

async function verifyFirebaseToken(apiKey: string, token: string): Promise<SessionUser> {
  const now = Date.now();
  const cached = tokenCache.get(token);
  if (cached && cached.expiresAt > now + 10_000) {
    return cached.user;
  }

  const resp = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: token })
    }
  );

  if (!resp.ok) {
    throw new RequestAuthError(401, "INVALID_TOKEN", "Authentication token is invalid.");
  }

  const data = (await resp.json()) as FirebaseLookupResponse;
  const user = data.users?.[0];
  if (!user?.localId) {
    throw new RequestAuthError(401, "INVALID_TOKEN", "Authentication token is invalid.");
  }

  const authUser: SessionUser = {
    uid: user.localId,
    email: user.email ?? null,
    emailVerified: Boolean(user.emailVerified),
    displayName: user.displayName ?? null
  };

  const jwtExpiry = parseJwtExpiryMs(token);
  const cacheUntil = Math.max(now + 5_000, Math.min(jwtExpiry, now + 5 * 60_000));
  tokenCache.set(token, { user: authUser, expiresAt: cacheUntil });
  return authUser;
}

function extractOrigin(req: Pick<Request, "headers">) {
  const value = req.headers.origin as string | string[] | undefined;
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value) && value.length > 0) return value[0]!.trim();
  return "";
}

function firstForwardedValue(value: string | string[] | undefined): string {
  if (typeof value === "string") {
    return value.split(",")[0]!.trim();
  }
  if (Array.isArray(value) && value.length > 0) {
    return value[0]!.split(",")[0]!.trim();
  }
  return "";
}

function normalizeOrigin(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    return new URL(trimmed).origin;
  } catch {
    return trimmed.replace(/\/+$/, "");
  }
}

function parseAllowedOrigins(value: string | undefined): Set<string> {
  if (!value) return new Set();
  return new Set(
    value
      .split(",")
      .map((item) => normalizeOrigin(item))
      .filter(Boolean)
  );
}

function requestClientIp(req: RequestLikeForLog): string {
  if (typeof req.ip === "string" && req.ip.trim().length > 0) {
    return req.ip.trim();
  }
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim().length > 0) {
    return forwarded.split(",")[0]!.trim();
  }
  if (Array.isArray(forwarded) && forwarded.length > 0 && forwarded[0]!.trim().length > 0) {
    return forwarded[0]!.trim();
  }
  return "unknown";
}

function authLog(req: RequestLikeForLog, event: string, details?: string) {
  const ip = requestClientIp(req);
  const origin = extractOrigin(req);
  const host = typeof req.headers.host === "string" ? req.headers.host : "-";
  const userAgentRaw = req.headers["user-agent"];
  const userAgent = typeof userAgentRaw === "string" && userAgentRaw.length > 0 ? userAgentRaw.slice(0, 140) : "-";
  // eslint-disable-next-line no-console
  console.info(
    `[auth] event=${event} ip=${ip} host=${host} origin=${origin || "-"} ua="${userAgent}"${
      details ? ` ${details}` : ""
    }`
  );
}

function currentRequestOrigin(req: Pick<Request, "headers" | "secure">): string {
  const host = firstForwardedValue(req.headers["x-forwarded-host"]) || req.headers.host;
  if (!host) return "";

  const proto = firstForwardedValue(req.headers["x-forwarded-proto"]) || (req.secure ? "https" : "http");

  return normalizeOrigin(`${proto}://${host}`);
}

function assertOriginMatches(req: Pick<Request, "headers" | "secure">, allowedOrigins: Set<string>) {
  const origin = normalizeOrigin(extractOrigin(req));
  if (!origin) return;
  if (allowedOrigins.has(origin)) return;
  const expected = currentRequestOrigin(req);
  if (!expected) return;
  if (origin !== expected) {
    throw new RequestAuthError(403, "ORIGIN_MISMATCH", "Origin validation failed.");
  }
}

function isGuestReadablePath(req: Pick<Request, "method" | "path" | "originalUrl" | "url">) {
  if (req.method !== "GET") return false;
  const path =
    (typeof req.path === "string" && req.path) ||
    (typeof req.originalUrl === "string" && req.originalUrl.split("?")[0]) ||
    (typeof req.url === "string" && req.url.split("?")[0]) ||
    "";
  const normalizedPath = path.replace(/\/+$/, "");
  if (normalizedPath === "/analytics" || normalizedPath.startsWith("/analytics/")) {
    return true;
  }
  if (normalizedPath === "/v1/analytics" || normalizedPath.startsWith("/v1/analytics/")) {
    return true;
  }
  if (normalizedPath === "/backtesting" || normalizedPath.startsWith("/backtesting/")) {
    return true;
  }
  if (normalizedPath === "/v1/backtesting" || normalizedPath.startsWith("/v1/backtesting/")) {
    return true;
  }
  if (/^\/(?:v1\/)?stocks\/[^/]+$/i.test(normalizedPath)) {
    return true;
  }
  return (
    path === "/overview" ||
    path === "/leaderboard" ||
    path === "/change-heatmap" ||
    path === "/rsi-surface" ||
    path === "/will-surface" ||
    path === "/v1/overview" ||
    path === "/v1/leaderboard" ||
    path === "/v1/change-heatmap" ||
    path === "/v1/rsi-surface" ||
    path === "/v1/will-surface"
  );
}

export type RequestAuthenticator = {
  requireAuth: boolean;
  devLocalAuthEnabled: boolean;
  middleware: RequestHandler;
  authenticateUpgrade: (req: IncomingMessage, _url: URL) => Promise<SessionUser | null>;
  loginWithIdToken: (req: Request, res: Response, idToken: string) => Promise<{ user: SessionUser; csrfToken: string }>;
  loginWithTrustedUser: (req: Request, res: Response, user: SessionUser) => Promise<{ user: SessionUser; csrfToken: string }>;
  verifyIdToken: (req: Request, idToken: string) => Promise<SessionUser>;
  getSession: (req: Request) => Promise<SessionRecord | null>;
  requireCsrf: (req: Request, session: SessionRecord) => void;
  clearSession: (req: Request, res: Response) => Promise<void>;
  ensureReady: () => Promise<void>;
  getHealth: () => SessionStoreHealth;
};

export function createRequestAuthenticator(): RequestAuthenticator {
  const requireAuth = process.env.AUTH_REQUIRED === "1";
  const firebaseApiKey = getFirebaseWebApiKey() ?? "";
  const devLocalAuthEnabled = isDevLocalAuthEnabled();
  const allowedOrigins = parseAllowedOrigins(
    firstNonEmpty(process.env.AUTH_ALLOWED_ORIGINS, process.env.PUBLIC_APP_ORIGIN, process.env.CORS_ALLOWED_ORIGINS) ??
      undefined
  );
  const sessions = new SessionStore();

  if (!requireAuth && process.env.NODE_ENV === "production") {
    // eslint-disable-next-line no-console
    console.warn("AUTH_REQUIRED is disabled while NODE_ENV=production. Protected API mode is recommended.");
  }

  const middleware: RequestHandler = async (req, res, next) => {
    try {
      if (!requireAuth) return next();
      if (isGuestReadablePath(req)) return next();
      const session = await sessions.getFromRequest(req);
      if (!session) {
        return res.status(401).json({
          error: { code: "AUTH_REQUIRED", message: "Active session required." }
        });
      }
      req.authUser = session.user;
      return next();
    } catch (err) {
      return next(err);
    }
  };

  return {
    requireAuth,
    devLocalAuthEnabled,
    middleware,
    async authenticateUpgrade(req) {
      if (!requireAuth) return null;
      const session = await sessions.getFromRequest(req);
      if (!session) {
        throw new RequestAuthError(401, "AUTH_REQUIRED", "Active session required.");
      }
      return session.user;
    },
    async loginWithIdToken(req, res, idToken) {
      const token = idToken.trim();
      if (!token) {
        throw new RequestAuthError(400, "ID_TOKEN_REQUIRED", "idToken is required.");
      }
      if (token.length < 32 || token.length > 4096 || token.split(".").length !== 3) {
        authLog(req, "login_rejected", "reason=malformed_token");
        throw new RequestAuthError(400, "ID_TOKEN_INVALID", "idToken is malformed.");
      }
      if (!firebaseApiKey) {
        authLog(req, "login_rejected", "reason=auth_misconfigured");
        throw new RequestAuthError(503, "AUTH_MISCONFIGURED", "Authentication is not configured on server.");
      }

      assertOriginMatches(req, allowedOrigins);

      try {
        const user = await verifyFirebaseToken(firebaseApiKey, token);
        if (!user.emailVerified) {
          authLog(req, "login_rejected", `reason=email_not_verified uid=${user.uid}`);
          throw new RequestAuthError(403, "EMAIL_NOT_VERIFIED", "Email verification required.");
        }
        const session = await sessions.issueSession(req, res, user);
        authLog(req, "login_success", `uid=${session.user.uid}`);
        return { user: session.user, csrfToken: session.csrfToken };
      } catch (err) {
        const authErr = getAuthError(err);
        authLog(req, "login_failed", `code=${authErr.code} status=${authErr.status}`);
        throw authErr;
      }
    },
    async loginWithTrustedUser(req, res, user) {
      assertOriginMatches(req, allowedOrigins);
      const session = await sessions.issueSession(req, res, user);
      authLog(req, "login_success", `uid=${session.user.uid} mode=trusted`);
      return { user: session.user, csrfToken: session.csrfToken };
    },
    async verifyIdToken(req, idToken) {
      const token = idToken.trim();
      if (!token) {
        throw new RequestAuthError(400, "ID_TOKEN_REQUIRED", "idToken is required.");
      }
      if (token.length < 32 || token.length > 4096 || token.split(".").length !== 3) {
        authLog(req, "verify_rejected", "reason=malformed_token");
        throw new RequestAuthError(400, "ID_TOKEN_INVALID", "idToken is malformed.");
      }
      if (!firebaseApiKey) {
        authLog(req, "verify_rejected", "reason=auth_misconfigured");
        throw new RequestAuthError(503, "AUTH_MISCONFIGURED", "Authentication is not configured on server.");
      }

      assertOriginMatches(req, allowedOrigins);

      try {
        const user = await verifyFirebaseToken(firebaseApiKey, token);
        authLog(req, "verify_success", `uid=${user.uid}`);
        return user;
      } catch (err) {
        const authErr = getAuthError(err);
        authLog(req, "verify_failed", `code=${authErr.code} status=${authErr.status}`);
        throw authErr;
      }
    },
    getSession(req) {
      return sessions.getFromRequest(req);
    },
    requireCsrf(req, session) {
      assertOriginMatches(req, allowedOrigins);
      if (!sessions.validateCsrf(req, session)) {
        throw new RequestAuthError(403, "CSRF_INVALID", "CSRF token is missing or invalid.");
      }
    },
    async clearSession(req, res) {
      authLog(req, "logout");
      await sessions.clearSession(req, res);
    },
    ensureReady() {
      return sessions.ensureReady();
    },
    getHealth() {
      return sessions.getHealth();
    }
  };
}

export type AuthenticatedUser = SessionUser;
