import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import type { PrismaClient } from "@prisma/client";
import { registerDiscordMarketStream, type DiscordMarketStreamService } from "./discordMarketStream";

async function withServer(run: (baseUrl: string) => Promise<void>) {
  const app = express();
  app.use(express.json());

  const service: DiscordMarketStreamService = {
    async getHealth() {
      return {
        status: "ok",
        configured: { test_webhook: true, prod_webhook: false },
        scheduler: { enabled: true, running: false }
      };
    },
    async getRecent(limit = 20) {
      return [{ id: "dispatch_1", status: "delivered", limit }];
    },
    async preview(target = "test") {
      return {
        message_kind: "close_summary",
        target,
        session_reference: "2026-04-02",
        trust_score: 61,
        quality_summary: "mixed",
        dedupe_key: "close_summary:test:2026-04-02:abc",
        payload: {
          content: "**Nifty Market Dossier**",
          allowed_mentions: { parse: [] }
        }
      };
    },
    async dispatch(input) {
      return {
        message_kind: "close_summary",
        target: input.target,
        session_reference: "2026-04-02",
        trust_score: 61,
        quality_summary: "mixed",
        dedupe_key: "close_summary:test:2026-04-02:abc",
        payload: {
          content: "**Nifty Market Dossier**",
          allowed_mentions: { parse: [] }
        },
        status: "delivered",
        dispatch_id: "dispatch_1",
        sent_at: "2026-04-05T10:00:00.000Z",
        suppression_reason: null,
        discord_status: 200,
        response_preview: "{\"id\":\"1\"}"
      };
    }
  };

  registerDiscordMarketStream(app, {} as PrismaClient, service);
  const server = app.listen(0);

  try {
    const address = server.address() as AddressInfo;
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
}

test("discord stream preview returns a safe Discord payload", async () =>
  withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/discord-stream/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target: "test" })
    });

    assert.equal(response.status, 200);
    const payload = (await response.json()) as { target: string; payload: { allowed_mentions: { parse: string[] } } };
    assert.equal(payload.target, "test");
    assert.deepEqual(payload.payload.allowed_mentions.parse, []);
  }));

test("discord stream test route forces test target", async () =>
  withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/discord-stream/test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target: "prod", force: true })
    });

    assert.equal(response.status, 200);
    const payload = (await response.json()) as { target: string; status: string };
    assert.equal(payload.target, "test");
    assert.equal(payload.status, "delivered");
  }));

test("discord stream recent route validates query parameters", async () =>
  withServer(async (baseUrl) => {
    const invalidResponse = await fetch(`${baseUrl}/v1/discord-stream/recent?limit=500`);
    assert.equal(invalidResponse.status, 400);

    const response = await fetch(`${baseUrl}/v1/discord-stream/recent?limit=10`);
    assert.equal(response.status, 200);
    const payload = (await response.json()) as Array<{ id: string }>;
    assert.equal(payload[0]?.id, "dispatch_1");
  }));
