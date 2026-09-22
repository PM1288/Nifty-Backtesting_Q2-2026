import assert from "node:assert/strict";
import test from "node:test";
import { SCALPER_DIRECTIONAL_OI_ENTRY_RULE, scalperV2DirectionalOiEntries } from "../src/lib/scalperV2DirectionalEntry";
import type { ScalperV2OiTimePoint } from "../src/lib/scalperV2OiTime";
import type { ScalperV2ReferenceLevel } from "../src/lib/scalperV2ReferenceLevels";

const bar = (end: string, close: number, ema9: number) => ({ end, open: close - 1, high: close + 1, low: close - 2, close, ema9, closed: true });
const pane = (tradingsymbol: string, bars: Array<Record<string, unknown>>) => ({ identity: { tradingsymbol }, bars });
const point = (capturedAt: string, oiDifference: number, changeOiDifference: number): ScalperV2OiTimePoint => ({
  capturedAt, ceOi: 100, peOi: 100 + oiDifference, ceChangeOi: 10, peChangeOi: 10 + changeOiDifference,
  oiDifference, changeOiDifference, pcr: 1,
});
const refs: ScalperV2ReferenceLevel[] = [
  { id: "today-open", label: "Today open", shortLabel: "Open", value: 100, sourceDate: "2026-09-22", source: "live_session" },
  { id: "previous-day-close", label: "Previous close", shortLabel: "PDC", value: 101, sourceDate: "2026-09-21", source: "daily_bar" },
  { id: "previous-day-high", label: "Previous high", shortLabel: "PDH", value: 105, sourceDate: "2026-09-21", source: "daily_bar" },
];

test("directional OI CALL requires a fresh OI crossover, rising delta pressure, pure EMA cross and price reference", () => {
  const t1 = "2026-09-22T03:50:00.000Z", t2 = "2026-09-22T03:55:00.000Z";
  const result = scalperV2DirectionalOiEntries([
    pane("NIFTY 50", [bar(t1, 99, 100), bar(t2, 103, 101)]),
    pane("NIFTY24SEP23400CE", [bar(t1, 18, 20), bar(t2, 22, 20)]),
    pane("NIFTY24SEP23400PE", []),
  ], [point(t1, -10, 0), point(t2, 15, 8)], refs);
  assert.equal(result.length, 1);
  assert.equal(result[0].rule, SCALPER_DIRECTIONAL_OI_ENTRY_RULE);
  assert.equal(result[0].direction, "CALL");
  assert.equal(result[0].optionPremium, 22);
  assert.equal(result[0].state, "DIRECTIONAL_ENTRY_REFERENCE");
  assert.deepEqual(result[0].matchedReferences, ["Open", "PDC"]);
});

test("directional OI PUT is the exact inverse and retains missing option premium truthfully", () => {
  const t1 = "2026-09-22T04:00:00.000Z", t2 = "2026-09-22T04:05:00.000Z";
  const result = scalperV2DirectionalOiEntries([
    pane("NIFTY 50", [bar(t1, 104, 102), bar(t2, 99, 101)]),
    pane("NIFTY24SEP23400CE", []),
    pane("NIFTY24SEP23400PE", []),
  ], [point(t1, 12, 4), point(t2, -6, -3)], refs);
  assert.equal(result.length, 1);
  assert.equal(result[0].direction, "PUT");
  assert.equal(result[0].optionPremium, null);
  assert.equal(result[0].state, "OPTION_PRICE_UNAVAILABLE");
  assert.deepEqual(result[0].matchedReferences, ["Open", "PDC", "PDH"]);
});

test("same-side EMA position is not a crossover and missing delta baseline never emits a signal", () => {
  const t1 = "2026-09-22T04:10:00.000Z", t2 = "2026-09-22T04:15:00.000Z";
  const panes = [pane("NIFTY 50", [bar(t1, 102, 100), bar(t2, 104, 101)]), pane("XCE", [bar(t1, 10, 9), bar(t2, 12, 10)])];
  assert.deepEqual(scalperV2DirectionalOiEntries(panes, [point(t1, -5, 0), point(t2, 5, 3)], refs), []);
  assert.deepEqual(scalperV2DirectionalOiEntries(panes, [{ ...point(t1, -5, 0), changeOiDifference: null }, { ...point(t2, 5, 3), changeOiDifference: null }], refs), []);
});
