import type { Express } from "express";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import {
  dispatchDiscordMarketStream,
  getDiscordMarketStreamHealth,
  listRecentDiscordDispatches,
  buildDiscordMarketStreamPreview,
  type DiscordDispatchResult,
  type DiscordPreviewResult,
  type DiscordStreamTarget
} from "../lib/discordMarketStream";

export type DiscordMarketStreamService = {
  getHealth(): Promise<unknown>;
  getRecent(limit?: number): Promise<unknown>;
  preview(target?: DiscordStreamTarget): Promise<DiscordPreviewResult>;
  dispatch(input: { target: DiscordStreamTarget; force?: boolean; reason?: string | null }): Promise<DiscordDispatchResult>;
};

const recentQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional()
});

const dispatchSchema = z.object({
  target: z.enum(["test", "prod"]).optional().default("test"),
  force: z.boolean().optional().default(false),
  reason: z.string().trim().max(200).optional().nullable()
});

function buildService(prisma: PrismaClient): DiscordMarketStreamService {
  return {
    async getHealth() {
      return getDiscordMarketStreamHealth(prisma);
    },
    async getRecent(limit) {
      return listRecentDiscordDispatches(prisma, limit);
    },
    async preview(target = "test") {
      return buildDiscordMarketStreamPreview(prisma, { target, messageKind: "close_summary" });
    },
    async dispatch(input) {
      return dispatchDiscordMarketStream(prisma, {
        target: input.target,
        force: input.force,
        reason: input.reason,
        messageKind: "close_summary"
      });
    }
  };
}

export function registerDiscordMarketStream(
  app: Express,
  prisma: PrismaClient,
  service: DiscordMarketStreamService = buildService(prisma)
) {
  app.get("/v1/discord-stream/health", async (_req, res) => {
    const payload = await service.getHealth();
    return res.json(payload);
  });

  app.get("/v1/discord-stream/recent", async (req, res) => {
    const parsed = recentQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        error: {
          code: "DISCORD_STREAM_RECENT_INVALID_REQUEST",
          message: "Invalid recent-dispatch query parameters."
        }
      });
    }

    const payload = await service.getRecent(parsed.data.limit);
    return res.json(payload);
  });

  app.post("/v1/discord-stream/preview", async (req, res) => {
    const parsed = dispatchSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        error: {
          code: "DISCORD_STREAM_PREVIEW_INVALID_REQUEST",
          message: "Invalid Discord preview request payload."
        }
      });
    }

    const payload = await service.preview(parsed.data.target);
    return res.json(payload);
  });

  app.post("/v1/discord-stream/test", async (req, res) => {
    const parsed = dispatchSchema.safeParse({ ...(req.body ?? {}), target: "test" });
    if (!parsed.success) {
      return res.status(400).json({
        error: {
          code: "DISCORD_STREAM_TEST_INVALID_REQUEST",
          message: "Invalid Discord test request payload."
        }
      });
    }

    const payload = await service.dispatch(parsed.data);
    return res.status(payload.status === "failed" ? 502 : 200).json(payload);
  });

  app.post("/v1/discord-stream/dispatch", async (req, res) => {
    const parsed = dispatchSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        error: {
          code: "DISCORD_STREAM_DISPATCH_INVALID_REQUEST",
          message: "Invalid Discord dispatch request payload."
        }
      });
    }

    const payload = await service.dispatch(parsed.data);
    return res.status(payload.status === "failed" ? 502 : 200).json(payload);
  });
}
