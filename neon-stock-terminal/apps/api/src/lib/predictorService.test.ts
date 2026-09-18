import test from "node:test";
import assert from "node:assert/strict";
import { runPredictor, readPredictor } from "./predictorService";
import type { PrismaClient } from "@prisma/client";
test("outside window evaluates only valid stored outcomes and never retroactively creates forecasts", async (t) => {
  t.mock.method(Date, "now", () => Date.parse("2026-09-18T12:00:00Z"));
  const writes: { q: string; args: any[] }[] = [];
  const tx = {
    $queryRawUnsafe: async (q: string, ...args: any[]) => {
      if (q.includes("advisory_xact")) return [{ ok: true }];
      if (q.includes("trade_date=$1"))
        return [
          {
            day: "2026-09-18",
            market_open_ts: "2026-09-18T03:45:00Z",
            market_close_ts: "2026-09-18T10:00:00Z",
          },
        ];
      if (q.includes("SELECT f.*"))
        return [
          {
            id: 1,
            token: "test",
            session_date: "2026-09-18",
            symbol: "SYNTHETIC",
            model: "ridge",
            payload: {
              predicted: 102,
              low: 95,
              high: 105,
              reference: 100,
              open: 99,
              probabilityAboveReference: 0.7,
              condition: "test",
            },
          },
        ];
      if (q.includes("trade_date=$2"))
        return [
          { day: "2026-09-18", open: 99, high: 105, low: 95, close: 103 },
        ];
      if (q.includes("SELECT 1 FROM market_predictor.study"))
        return [{ exists: 1 }];
      return [];
    },
    $executeRawUnsafe: async (q: string, ...args: any[]) => {
      writes.push({ q, args });
      return 1;
    },
  };
  const db = { $transaction: async (fn: any) => fn(tx) } as PrismaClient;
  const result = await runPredictor(db);
  assert.equal(result.state, "MORNING_WINDOW_CLOSED");
  assert.equal(result.evaluated, 1);
  assert.equal(
    writes.filter((w) => w.q.includes("INSERT INTO market_predictor.forecast"))
      .length,
    0,
  );
  assert.equal(
    JSON.parse(
      writes.find((w) => w.q.includes("INSERT INTO market_predictor.outcome"))!
        .args[1],
    ).actual,
    103,
  );
});
test("morning branch saves three models with identical sources and skips unavailable stocks", async (t) => {
  t.mock.method(Date, "now", () => Date.parse("2026-09-18T04:10:00Z"));
  const bars = Array.from({ length: 220 }, (_, i) => ({
    day: new Date(Date.UTC(2026, 1, 10 + i)).toISOString().slice(0, 10),
    open: 100 + i * 0.02,
    close: 100 + i * 0.02 + 0.05,
    high: 101 + i * 0.02,
    low: 99 + i * 0.02,
  }));
  const writes: { q: string; args: any[] }[] = [];
  const tx = {
    $queryRaw: async () => [],
    $queryRawUnsafe: async (q: string, ...args: any[]) => {
      if (q.includes("advisory_xact")) return [{ ok: true }];
      if (q.includes("SELECT f.*")) return [];
      if (q.includes("market_open_ts,market_close_ts"))
        return [
          {
            day: "2026-09-18",
            market_open_ts: "2026-09-18T03:45:00Z",
            market_close_ts: "2026-09-18T10:00:00Z",
          },
        ];
      if (q.includes("trade_date<$1")) return [{ day: bars.at(-1)!.day }];
      if (q.includes("SELECT 1 FROM market_predictor.study"))
        return [{ exists: 1 }];
      if (q.includes("c.instrument_token"))
        return [{ symbol: "UNAVAILABLE", token: null, direction: "LONG" }];
      if (q.includes("FROM bars_1m"))
        return [
          {
            ts: "2026-09-18T03:45:00Z",
            open: 105,
            high: 106,
            low: 104,
            close: 105,
          },
          {
            ts: "2026-09-18T04:08:00Z",
            open: 105,
            high: 106,
            low: 104,
            close: 105.1,
          },
        ];
      if (q.includes("FROM bars_1d")) return [...bars].reverse();
      return [];
    },
    $executeRawUnsafe: async (q: string, ...args: any[]) => {
      writes.push({ q, args });
      return 1;
    },
  };
  const result = await runPredictor({
    $transaction: async (fn: any) => fn(tx),
  } as PrismaClient);
  assert.equal(result.forecastCount, 3);
  assert.equal(result.eligibility[1].state, "TOKEN_UNAVAILABLE");
  const inserts = writes.filter((w) =>
    w.q.includes("INSERT INTO market_predictor.forecast"),
  );
  assert.equal(inserts.length, 3);
  for (const insert of inserts) {
    const p = JSON.parse(insert.args[8]);
    assert.equal(p.reference, 105.1);
    assert.equal(p.eligibility.eligible, true);
    assert.equal(insert.args[7], "2026-09-18T04:08:00Z");
    assert.ok(p.trainingBars.every((b: any) => b.day < "2026-09-18"));
  }
});
test("GET model only reads, strips bulky inputs and separates study/forward records", async () => {
  const queries: string[] = [];
  const db = {
    $queryRawUnsafe: async (q: string) => {
      queries.push(q);
      return [];
    },
  } as unknown as PrismaClient;
  const result = await readPredictor(db, "2026-09-18");
  assert.equal(result.executionEnabled, false);
  assert.deepEqual(result.forecasts, []);
  assert.ok(queries.every((q) => q.trim().startsWith("SELECT")));
  assert.ok(queries.some((q) => q.includes("payload-'trainingBars'")));
});
