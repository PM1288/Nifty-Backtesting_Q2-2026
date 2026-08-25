import type { Express, Request, Response } from "express";
import type { PrismaClient } from "@prisma/client";
import type { RequestAuthenticator } from "../auth/guard";
import { getDashboardSnapshotHealth } from "../lib/dashboardSnapshots";
import { getApiDbRuntimeProfile, getDatabaseSizing, getTopPgStatements, isPgStatStatementsEnabled } from "../lib/dbPerformance";
import { ensureRateLimitStoreReady, getRateLimitStoreHealth } from "../security/rateLimit";

export function registerHealth(app: Express, prisma: PrismaClient, auth: RequestAuthenticator) {
  const sendHealth = async (res: Response) => {
    try {
      await Promise.allSettled([auth.ensureReady(), ensureRateLimitStoreReady()]);
      const dbRows = await prisma.$queryRawUnsafe<Array<{ ok: number }>>("SELECT 1 AS ok");
      const dbRuntime = getApiDbRuntimeProfile();
      const sessionStore = auth.getHealth();
      const rateLimitStore = getRateLimitStoreHealth();
      const dbConnected = dbRows[0]?.ok === 1;
      const ready = dbConnected && sessionStore.ready && rateLimitStore.ready;

      return res.status(ready ? 200 : 503).json({
        ok: ready,
        ready,
        db: {
          connected: dbConnected,
          pooling: dbRuntime.prisma
        },
        cache: { redisConfigured: sessionStore.redisConfigured || rateLimitStore.redisConfigured },
        redis: {
          sessionStore,
          rateLimitStore
        },
        observability: {
          slowQueryMs: dbRuntime.slowQueryMs
        },
        diagnostics: "Use the authenticated /health/details endpoint for database size, statement and snapshot diagnostics."
      });
    } catch (err) {
      return res.status(503).json({
        ok: false,
        ready: false,
        db: { connected: false },
        error: err instanceof Error ? err.message : "Health check failed."
      });
    }
  };

  app.get("/health", async (_req, res) => sendHealth(res));
  app.get("/ready", async (_req, res) => sendHealth(res));

  app.get("/health/details", async (req: Request, res: Response) => {
    const session = await auth.getSession(req);
    if (!session || session.user.role !== "admin") {
      return res.status(403).json({ error: { code: "ADMIN_REQUIRED", message: "Administrator access required." } });
    }
    try {
      const pgStatStatementsEnabled = await isPgStatStatementsEnabled(prisma);
      const [dbSizing, snapshots, topStatements] = await Promise.all([
        getDatabaseSizing(prisma),
        getDashboardSnapshotHealth(prisma),
        pgStatStatementsEnabled ? getTopPgStatements(prisma, 5) : Promise.resolve([])
      ]);
      return res.json({
        asOf: new Date().toISOString(),
        db: { size: dbSizing, pooling: getApiDbRuntimeProfile().prisma },
        observability: { slowQueryMs: getApiDbRuntimeProfile().slowQueryMs, pgStatStatementsEnabled, topStatements },
        snapshots: { count: snapshots.length, latest: snapshots }
      });
    } catch (error) {
      return res.status(503).json({ error: { code: "HEALTH_DIAGNOSTICS_FAILED", message: error instanceof Error ? error.message : "Diagnostics failed." } });
    }
  });
}
