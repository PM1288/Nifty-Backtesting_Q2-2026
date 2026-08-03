import type { Express, Response } from "express";
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
      const pgStatStatementsEnabled = await isPgStatStatementsEnabled(prisma);
      const dbSizing = await getDatabaseSizing(prisma);
      const dbRuntime = getApiDbRuntimeProfile();
      const snapshots = await getDashboardSnapshotHealth(prisma);
      const topStatements = pgStatStatementsEnabled ? await getTopPgStatements(prisma, 5) : [];
      const sessionStore = auth.getHealth();
      const rateLimitStore = getRateLimitStoreHealth();
      const dbConnected = dbRows[0]?.ok === 1;
      const ready = dbConnected && sessionStore.ready && rateLimitStore.ready;

      return res.status(ready ? 200 : 503).json({
        ok: ready,
        ready,
        db: {
          connected: dbConnected,
          size: dbSizing,
          pooling: dbRuntime.prisma
        },
        cache: { redisConfigured: sessionStore.redisConfigured || rateLimitStore.redisConfigured },
        redis: {
          sessionStore,
          rateLimitStore
        },
        observability: {
          slowQueryMs: dbRuntime.slowQueryMs,
          pgStatStatementsEnabled,
          topStatements
        },
        snapshots: {
          count: snapshots.length,
          latest: snapshots
        }
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
}
