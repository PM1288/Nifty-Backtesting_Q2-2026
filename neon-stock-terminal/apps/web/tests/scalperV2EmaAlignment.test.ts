import assert from "node:assert/strict";
import test from "node:test";
import {
  SCALPER_V2_THREE_INSTRUMENT_EMA_RULE,
  scalperV2EmaAlignmentAvailability,
  scalperV2EmaAlignmentSignals,
} from "../src/lib/scalperV2EmaAlignment";

const start = Date.parse("2026-09-22T03:45:00.000Z");
const time = (index: number) => new Date(start + index * 5 * 60_000).toISOString();
const bar = (index: number, side: "ABOVE" | "BELOW", overrides: Record<string, unknown> = {}) => ({
  start: new Date(start + (index - 1) * 5 * 60_000).toISOString(),
  end: time(index),
  open: side === "ABOVE" ? 80 : 120,
  high: 140,
  low: 60,
  close: side === "ABOVE" ? 101 : 99,
  ema9: 100,
  volume: 100,
  closed: true,
  ...overrides,
});
const pane = (tradingsymbol: string, sides: Array<"ABOVE" | "BELOW">) => ({
  identity: { tradingsymbol },
  bars: sides.map((side, index) => bar(index, side)),
});

test("CALL reference requires aligned underlying and CE up-crosses plus inverse PE cross", () => {
  const result = scalperV2EmaAlignmentSignals([
    pane("NIFTY 50", ["BELOW", "BELOW", "BELOW", "ABOVE", "BELOW", "ABOVE", "ABOVE"]),
    pane("NIFTY24SEP23400CE", ["BELOW", "BELOW", "ABOVE", "BELOW", "BELOW", "BELOW", "ABOVE"]),
    pane("NIFTY24SEP23400PE", ["ABOVE", "ABOVE", "ABOVE", "ABOVE", "ABOVE", "BELOW", "BELOW"]),
  ], 5);
  assert.equal(result.length, 1);
  assert.equal(result[0].rule, SCALPER_V2_THREE_INSTRUMENT_EMA_RULE);
  assert.equal(result[0].direction, "CALL");
  assert.equal(result[0].setupTime, time(6));
  assert.deepEqual(result[0].legs.map((leg) => leg.crossTime), [time(5), time(6), time(5)]);
  assert.ok(result[0].legs.every((leg) => leg.sourceSideCloses >= 2));
});

test("PUT reference uses the exact inverse alignment", () => {
  const result = scalperV2EmaAlignmentSignals([
    pane("NIFTY 50", ["ABOVE", "ABOVE", "ABOVE", "BELOW", "ABOVE", "BELOW", "BELOW"]),
    pane("NIFTY24SEP23400CE", ["ABOVE", "ABOVE", "BELOW", "ABOVE", "ABOVE", "ABOVE", "BELOW"]),
    pane("NIFTY24SEP23400PE", ["BELOW", "BELOW", "BELOW", "BELOW", "BELOW", "ABOVE", "ABOVE"]),
  ], 5);
  assert.equal(result.length, 1);
  assert.equal(result[0].direction, "PUT");
  assert.equal(result[0].setupTime, time(6));
});

test("open and candle body do not affect the close-to-EMA rule", () => {
  const panes = [
    pane("NIFTY 50", ["BELOW", "BELOW", "BELOW", "BELOW", "BELOW", "ABOVE"]),
    pane("XCE", ["BELOW", "BELOW", "BELOW", "BELOW", "BELOW", "ABOVE"]),
    pane("XPE", ["ABOVE", "ABOVE", "ABOVE", "ABOVE", "ABOVE", "BELOW"]),
  ];
  panes.forEach((item) => Object.assign(item.bars[5], { open: 100.99, high: 101.01, low: 98.99 }));
  assert.equal(scalperV2EmaAlignmentSignals(panes, 5).length, 1);
});

test("missing exact bar, insufficient source-side history, gaps and non-5m views do not emit", () => {
  const valid = [
    pane("NIFTY 50", ["BELOW", "BELOW", "BELOW", "BELOW", "BELOW", "ABOVE"]),
    pane("XCE", ["BELOW", "BELOW", "BELOW", "BELOW", "BELOW", "ABOVE"]),
    pane("XPE", ["ABOVE", "ABOVE", "ABOVE", "ABOVE", "ABOVE", "BELOW"]),
  ];
  assert.deepEqual(scalperV2EmaAlignmentSignals(valid, 15), []);
  const missing = structuredClone(valid); missing[1].bars.pop();
  assert.deepEqual(scalperV2EmaAlignmentSignals(missing, 5), []);
  const insufficient = structuredClone(valid); insufficient[0].bars.splice(0, 4, bar(0, "ABOVE"), bar(1, "ABOVE"), bar(2, "ABOVE"), bar(3, "ABOVE"));
  assert.deepEqual(scalperV2EmaAlignmentSignals(insufficient, 5), []);
  const gapped = structuredClone(valid); gapped[2].bars[3].end = new Date(Date.parse(String(gapped[2].bars[3].end)) + 60_000).toISOString();
  assert.deepEqual(scalperV2EmaAlignmentSignals(gapped, 5), []);
});

test("the current-or-previous crossover grace period creates one marker, not a repeated zone", () => {
  const result = scalperV2EmaAlignmentSignals([
    pane("NIFTY 50", ["BELOW", "BELOW", "BELOW", "BELOW", "BELOW", "ABOVE", "ABOVE"]),
    pane("XCE", ["BELOW", "BELOW", "BELOW", "BELOW", "BELOW", "ABOVE", "ABOVE"]),
    pane("XPE", ["ABOVE", "ABOVE", "ABOVE", "ABOVE", "ABOVE", "BELOW", "BELOW"]),
  ], 5);
  assert.equal(result.length, 1);
  assert.equal(result[0].setupTime, time(5));
});

test("CE and PE each require at least 95 percent of their progressive volume EMA20", () => {
  const valid = [
    pane("NIFTY 50", ["BELOW", "BELOW", "BELOW", "BELOW", "BELOW", "ABOVE"]),
    pane("XCE", ["BELOW", "BELOW", "BELOW", "BELOW", "BELOW", "ABOVE"]),
    pane("XPE", ["ABOVE", "ABOVE", "ABOVE", "ABOVE", "ABOVE", "BELOW"]),
  ];
  valid[1].bars[5].volume = 94;
  assert.equal(scalperV2EmaAlignmentSignals(valid, 5).length, 0);
  valid[1].bars[5].volume = 95;
  const result = scalperV2EmaAlignmentSignals(valid, 5);
  assert.equal(result.length, 1);
  assert.equal(result[0].legs[1].volumeConfirmed, true);
  assert.ok((result[0].legs[1].volumeToEmaRatio ?? 0) >= 0.95);
  assert.equal(result[0].legs[2].volumeConfirmed, true);
});

test("availability separates no signal from missing exact 5m evidence", () => {
  const valid = [
    pane("NIFTY 50", ["BELOW", "BELOW", "BELOW", "BELOW", "BELOW", "ABOVE"]),
    pane("XCE", ["BELOW", "BELOW", "BELOW", "BELOW", "BELOW", "ABOVE"]),
    pane("XPE", ["ABOVE", "ABOVE", "ABOVE", "ABOVE", "ABOVE", "BELOW"]),
  ];
  assert.deepEqual(scalperV2EmaAlignmentAvailability(valid, 5), { state: "READY", reasons: [] });
  const missing = structuredClone(valid); missing[1].bars = [];
  const unavailable = scalperV2EmaAlignmentAvailability(missing, 5);
  assert.equal(unavailable.state, "UNAVAILABLE");
  assert.match(unavailable.reasons.join(" "), /CE needs six completed 5m/);
  assert.equal(scalperV2EmaAlignmentAvailability(valid, 15).state, "INACTIVE_TIMEFRAME");
});
