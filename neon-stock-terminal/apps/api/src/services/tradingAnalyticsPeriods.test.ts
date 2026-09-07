import { test } from "node:test";
import assert from "node:assert/strict";
import { periodCandles } from "./tradingAnalyticsPeriods";
test("weekly UI candles aggregate real OHLC rather than relabel daily rows", () => {
  const r = periodCandles(
    [
      { date: "2026-08-31", open: 10, high: 14, low: 9, close: 12 },
      { date: "2026-09-01", open: 12, high: 16, low: 8, close: 15 },
    ],
    "week",
    "2026-09-07T00:00:00Z",
  );
  assert.equal(r.length, 1);
  assert.equal(r[0].open, 10);
  assert.equal(r[0].close, 15);
  assert.equal(r[0].high, 16);
  assert.equal(r[0].low, 8);
  assert.equal(r[0].closed, true);
});
test("forming monthly candle has no completed EMA and missing values stay null", () => {
  const r = periodCandles(
    [{ date: "2026-09-07", open: null, high: 14, low: 9, close: 12 }],
    "month",
    "2026-09-07T17:00:00Z",
  );
  assert.equal(r[0].closed, false);
  assert.equal(r[0].ema9, null);
  assert.equal(r[0].open, null);
});
