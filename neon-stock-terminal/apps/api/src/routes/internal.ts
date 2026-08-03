import type { Express, Request, Response } from "express";
import type { PrismaClient } from "@prisma/client";
import { materializeAllSnapshots, materializeSnapshotKeys, SNAPSHOT_DEFINITIONS } from "../lib/snapshotRegistry";
import { warmSimulatorCachesOnce } from "./analytics";
import { internalRefreshRateLimiter } from "../security/rateLimit";

function readRefreshToken(req: Request) {
  const headerToken = req.header("x-snapshot-refresh-token")?.trim();
  if (headerToken) return headerToken;
  const authHeader = req.header("authorization");
  if (!authHeader) return "";
  const [scheme, token] = authHeader.split(/\s+/, 2);
  return scheme?.toLowerCase() === "bearer" ? token?.trim() ?? "" : "";
}

export function registerInternalRoutes(app: Express, prisma: PrismaClient) {
  app.post("/internal/snapshots/refresh", internalRefreshRateLimiter, async (req: Request, res: Response) => {
    const expectedToken = (process.env.SNAPSHOT_REFRESH_TOKEN ?? "").trim();
    if (!expectedToken) {
      return res.status(503).json({
        error: {
          code: "SNAPSHOT_REFRESH_DISABLED",
          message: "Snapshot refresh token is not configured."
        }
      });
    }

    const providedToken = readRefreshToken(req);
    if (providedToken !== expectedToken) {
      return res.status(403).json({
        error: {
          code: "SNAPSHOT_REFRESH_FORBIDDEN",
          message: "Snapshot refresh token is invalid."
        }
      });
    }

    const requestedKeys = Array.isArray(req.body?.keys)
      ? req.body.keys.filter((value: unknown): value is string => typeof value === "string" && value.trim().length > 0)
      : [];
    const validKeys = new Set(SNAPSHOT_DEFINITIONS.map((definition) => definition.key));
    const keys = requestedKeys.length ? requestedKeys.filter((key: string) => validKeys.has(key)) : [];
    const startedAt = Date.now();

    try {
      if (keys.length) {
        await materializeSnapshotKeys(prisma, keys);
      } else {
        await materializeAllSnapshots(prisma);
      }
      await warmSimulatorCachesOnce();

      return res.json({
        ok: true,
        refreshedKeys: keys.length ? keys : [...validKeys],
        elapsedMs: Date.now() - startedAt
      });
    } catch (error) {
      return res.status(500).json({
        error: {
          code: "SNAPSHOT_REFRESH_FAILED",
          message: error instanceof Error ? error.message : "Snapshot refresh failed."
        }
      });
    }
  });
}
