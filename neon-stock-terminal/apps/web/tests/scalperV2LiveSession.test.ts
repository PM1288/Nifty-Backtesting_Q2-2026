import assert from "node:assert/strict";
import test from "node:test";
import {
  scalperV2CompletedCandleSignature,
  scalperV2RefreshClock,
  scalperV2SessionSlotCount,
  shouldFollowScalperV2TradingDay,
  shouldRefitScalperV2Day,
} from "../src/lib/scalperV2LiveSession";

test("Scalper V2 candle signature advances only when a completed pane candle advances", () => {
  assert.equal(scalperV2CompletedCandleSignature([{ bars: [] }]), "");
  const panes = [{ bars: [{ end: "2026-09-21T04:00:00.000Z", closed: true }] }];
  assert.equal(scalperV2CompletedCandleSignature(panes), "2026-09-21T04:00:00.000Z");
  assert.equal(scalperV2CompletedCandleSignature([{ bars: [...panes[0].bars, { end: "2026-09-21T04:05:00.000Z", closed: false }] }]), "2026-09-21T04:00:00.000Z");
  assert.equal(scalperV2CompletedCandleSignature([{ bars: [...panes[0].bars, { end: "2026-09-21T04:05:00.000Z", closed: true }] }]), "2026-09-21T04:05:00.000Z");
});

test("Scalper V2 refits appended candles only in live Fit Day mode", () => {
  const base = { historical: false, horizontalView: "day" as const, previousSignature: "a", nextSignature: "b" };
  assert.equal(shouldRefitScalperV2Day(base), true);
  assert.equal(shouldRefitScalperV2Day({ ...base, nextSignature: "a" }), false);
  assert.equal(shouldRefitScalperV2Day({ ...base, historical: true }), false);
  assert.equal(shouldRefitScalperV2Day({ ...base, horizontalView: "last30" }), false);
});

test("Scalper V2 follows a newly observed trading day without overriding older manual history", () => {
  const base = { historical: false, previousLatestDay: "2026-09-18", latestDay: "2026-09-21" };
  assert.equal(shouldFollowScalperV2TradingDay({ ...base, selectedDay: null }), true);
  assert.equal(shouldFollowScalperV2TradingDay({ ...base, selectedDay: "2026-09-18" }), true);
  assert.equal(shouldFollowScalperV2TradingDay({ ...base, selectedDay: "2026-09-17" }), false);
  assert.equal(shouldFollowScalperV2TradingDay({ ...base, selectedDay: null, historical: true }), false);
});

test("Scalper V2 refresh clock is explicit IST and handles the initial state", () => {
  assert.equal(scalperV2RefreshClock(0), "Waiting for refresh");
  assert.match(scalperV2RefreshClock(Date.parse("2026-09-21T04:00:00.000Z")), /^Refreshed 09:30:00 IST$/);
});

test("Scalper V2 reserves one fixed logical slot for every full-session interval", () => {
  const open = "2026-09-21T03:45:00.000Z", close = "2026-09-21T10:00:00.000Z";
  assert.equal(scalperV2SessionSlotCount(open, close, 1), 375);
  assert.equal(scalperV2SessionSlotCount(open, close, 5), 75);
  assert.equal(scalperV2SessionSlotCount(open, close, 15), 25);
  assert.equal(scalperV2SessionSlotCount(open, close, 60), 7);
  assert.equal(scalperV2SessionSlotCount("bad", close, 5), null);
});
