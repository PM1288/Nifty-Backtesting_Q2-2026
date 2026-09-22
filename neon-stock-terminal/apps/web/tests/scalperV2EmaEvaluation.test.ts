import assert from "node:assert/strict";
import test from "node:test";
import { scalperV2EmaMarkerDirection } from "../src/lib/scalperV2EmaAlignment";
import { scalperV2EmaEvaluation } from "../src/lib/scalperV2EmaEvaluation";

const start = Date.parse("2026-09-22T03:45:00.000Z");
const sides = {
  UNDERLYING: ["BELOW", "BELOW", "BELOW", "BELOW", "BELOW", "ABOVE", "ABOVE", "ABOVE", "ABOVE", "ABOVE", "ABOVE", "ABOVE"],
  CE: ["BELOW", "BELOW", "BELOW", "BELOW", "BELOW", "ABOVE", "ABOVE", "ABOVE", "ABOVE", "ABOVE", "ABOVE", "ABOVE"],
  PE: ["ABOVE", "ABOVE", "ABOVE", "ABOVE", "ABOVE", "BELOW", "BELOW", "BELOW", "BELOW", "BELOW", "BELOW", "BELOW"],
} as const;
const pane = (kind: keyof typeof sides) => ({
  identity: { tradingsymbol: kind === "UNDERLYING" ? "NIFTY 50" : `NIFTY29SEP23350${kind}` },
  bars: sides[kind].map((emaSide, index) => {
    const rising = kind !== "PE", base = kind === "UNDERLYING" ? 23_300 : 200;
    const close = base + (rising ? index ** 2 : -(index ** 2));
    return { end: new Date(start + index * 300_000).toISOString(), close, open: close - 1, high: close + 2, low: close - 2, ema9: emaSide === "ABOVE" ? close - 1 : close + 1, closed: true };
  }),
});

test("potential reference arrows follow each instrument's local EMA direction", () => {
  assert.equal(scalperV2EmaMarkerDirection("underlying", "CALL"), "up");
  assert.equal(scalperV2EmaMarkerDirection("call", "CALL"), "up");
  assert.equal(scalperV2EmaMarkerDirection("put", "CALL"), "down");
  assert.equal(scalperV2EmaMarkerDirection("underlying", "PUT"), "down");
  assert.equal(scalperV2EmaMarkerDirection("call", "PUT"), "down");
  assert.equal(scalperV2EmaMarkerDirection("put", "PUT"), "up");
});

test("retained evaluation reports exact-session signal outcomes and correlations", () => {
  const result = scalperV2EmaEvaluation([pane("UNDERLYING"), pane("CE"), pane("PE")], 5);
  assert.equal(result.sessions, 1);
  assert.equal(result.signals, 1);
  assert.equal(result.calls, 1);
  assert.equal(result.puts, 0);
  assert.equal(result.horizons[0].comparable, 1);
  assert.equal(result.horizons[0].positiveFollowThrough, 1);
  assert.ok((result.horizons[0].averageUnderlyingPct ?? 0) > 0);
  assert.ok((result.horizons[0].averageSelectedOptionPct ?? 0) > 0);
  assert.equal(result.correlations.underlyingVsCe.samples, 11);
  assert.equal(result.correlations.underlyingVsPe.samples, 11);
  assert.ok((result.correlations.underlyingVsCe.value ?? 0) > 0.95);
  assert.ok((result.correlations.underlyingVsPe.value ?? 0) < -0.95);
});

test("evaluation does not invent forward observations", () => {
  const panes = [pane("UNDERLYING"), pane("CE"), pane("PE")];
  panes[1].bars = panes[1].bars.slice(0, 6);
  const result = scalperV2EmaEvaluation(panes, 5);
  assert.equal(result.horizons[0].comparable, 0);
  assert.equal(result.horizons[0].averageSelectedOptionPct, null);
});
