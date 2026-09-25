import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import type { PrismaClient } from "@prisma/client";
import type { RequestAuthenticator } from "../auth/guard";
import { registerTradingAnalytics } from "./tradingAnalytics";

const setupTime = new Date(Date.now() - 60_000).toISOString();
const body = {
  rule: "SCALPER_V2_THREE_INSTRUMENT_EMA_ALIGNMENT_VOLUME_V2",
  state: "POTENTIAL_ENTRY_REFERENCE",
  direction: "CALL",
  intervalMinutes: 5,
  setupTime,
  underlyingSymbol: "NIFTY",
  expiry: "2026-10-01",
  legs: [
    { instrument: "UNDERLYING", symbol: "NIFTY", targetSide: "ABOVE", crossTime: setupTime, close: 25001, ema9: 25000, volume: null, volumeEma20: null, volumeToEmaRatio: null, volumeConfirmed: null },
    { instrument: "CE", symbol: "NIFTY01OCT2625000CE", targetSide: "ABOVE", crossTime: setupTime, close: 115, ema9: 110, volume: 1000, volumeEma20: 950, volumeToEmaRatio: 1.0526, volumeConfirmed: true },
    { instrument: "PE", symbol: "NIFTY01OCT2625000PE", targetSide: "BELOW", crossTime: setupTime, close: 75, ema9: 80, volume: 1200, volumeEma20: 1000, volumeToEmaRatio: 1.2, volumeConfirmed: true },
  ],
};

async function requestWith(prisma: PrismaClient, input: unknown = body) {
  const app = express();
  app.use(express.json());
  const auth = {
    getSession: async () => ({ user: { uid: "test-user" } }),
    requireCsrf: () => undefined,
  } as unknown as RequestAuthenticator;
  registerTradingAnalytics(app, prisma, auth);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  try {
    return await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/v1/trading-analytics/scalper-v2/tentative-alert`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
    });
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

test("tentative reference is queued once and duplicate refreshes are idempotent", async () => {
  let inserts = 0;
  const prisma = {
    $queryRawUnsafe: async (sql: string) => {
      if (sql.includes("INSERT INTO nse_ops.scalper_v2_tentative_alert_outbox")) {
        inserts += 1;
        return inserts === 1 ? [{ eventKey: "a".repeat(64) }] : [];
      }
      return [{ eventKey: "a".repeat(64) }];
    },
  } as unknown as PrismaClient;
  const first = await requestWith(prisma);
  assert.equal(first.status, 202);
  assert.equal((await first.json() as { accepted: boolean; duplicate: boolean }).duplicate, false);
  const second = await requestWith(prisma);
  assert.equal(second.status, 200);
  assert.equal((await second.json() as { accepted: boolean; duplicate: boolean }).duplicate, true);
  assert.equal(inserts, 2);
});

test("rejects non-tentative, wrong-direction, unconfirmed-volume and stale events", async () => {
  const prisma = { $queryRawUnsafe: async () => [] } as unknown as PrismaClient;
  assert.equal((await requestWith(prisma, { ...body, state: "ENTRY" })).status, 400);
  const wrongDirection = structuredClone(body);
  wrongDirection.legs[2]!.targetSide = "ABOVE";
  assert.equal((await requestWith(prisma, wrongDirection)).status, 400);
  const unconfirmed = structuredClone(body);
  unconfirmed.legs[1]!.volumeConfirmed = false;
  assert.equal((await requestWith(prisma, unconfirmed)).status, 400);
  assert.equal((await requestWith(prisma, { ...body, setupTime: new Date(Date.now() - 11 * 60_000).toISOString() })).status, 409);
});
