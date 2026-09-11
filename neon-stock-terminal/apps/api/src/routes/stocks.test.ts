import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import type { AddressInfo } from "node:net";
import type { PrismaClient } from "@prisma/client";
import { registerStocks } from "./stocks";

test("1D stock response keeps the visible session separate from retained indicator warm-up", async () => {
  let call = 0;
  const prisma = {
    $queryRaw: async () => {
      call += 1;
      if (call === 1) return [{ symbol_token: "101", tradingsymbol: "TEST-EQ", symbol: "TEST", sector: "TEST" }];
      if (call === 2) return [{
        last_price: 110, net_change: 2, percent_change: 1.85, last_open: 108,
        last_high: 111, last_low: 107, last_close: 110, last_volume: 1_000,
        last_seen_ts: "2026-09-11T04:00:00.000Z",
      }];
      if (call === 3) return [
        { trade_date: "2026-09-11", open: 108, high: 111, low: 107, close: 110, volume: 1_000 },
        { trade_date: "2026-09-10", open: 105, high: 109, low: 104, close: 108, volume: 900 },
      ];
      if (call === 4) return [
        { ts: "2026-09-11T03:45:00.000Z", open: 108, high: 109, low: 107, close: 108.5, volume: 500 },
        { ts: "2026-09-11T03:46:00.000Z", open: 108.5, high: 110, low: 108, close: 109.5, volume: 600 },
      ];
      if (call === 5) return [
        { ts: "2026-09-10T10:00:00.000Z", open: 106.5, high: 108, low: 106, close: 107.5, volume: 550 },
        { ts: "2026-09-10T09:59:00.000Z", open: 106, high: 107, low: 105, close: 106.5, volume: 450 },
      ];
      return [];
    },
  } as unknown as PrismaClient;

  const app = express();
  registerStocks(app, prisma);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const response = await fetch(`${base}/v1/stocks/TEST?range=1D`);
    assert.equal(response.status, 200);
    const body = await response.json() as {
      intraday: Array<{ t: string; c: number }>;
      indicatorWarmup: Array<{ t: string; c: number }>;
    };
    assert.deepEqual(body.intraday.map((row) => row.c), [108.5, 109.5]);
    assert.deepEqual(body.indicatorWarmup.map((row) => row.c), [106.5, 107.5]);
    assert.ok(body.indicatorWarmup.every((row) => Date.parse(row.t) < Date.parse(body.intraday[0]!.t)));
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
