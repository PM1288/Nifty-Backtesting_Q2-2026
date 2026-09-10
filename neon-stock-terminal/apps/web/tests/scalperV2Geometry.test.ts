import assert from "node:assert/strict";
import test from "node:test";
import {
  levelInObservedSession,
  observedSessionBounds,
  oiComparisonState,
  paddedSessionBounds,
  profileWidth,
} from "../src/lib/scalperV2Geometry";

test("Scalper V2 uses independent observed OHLC bounds and equal padding", () => {
  const bounds = observedSessionBounds([
    { closed: true, low: 23_400, high: 23_480, ema9: 50_000 },
    { closed: false, low: 1, high: 99_999 },
  ]);
  assert.deepEqual(bounds, { low: 23_400, high: 23_480 });
  assert.deepEqual(paddedSessionBounds(bounds, 0.05), { low: 23_396, high: 23_484 });
});

test("Scalper V2 strict level eligibility ignores padded display bounds", () => {
  const bounds = { low: 23_400, high: 23_480 };
  assert.deepEqual([23_396, 23_400, 23_450, 23_480, 23_484].filter((value) => levelInObservedSession(value, bounds)), [23_400, 23_450, 23_480]);
});

test("Scalper V2 flat sessions use two verified ticks on each side", () => {
  assert.deepEqual(paddedSessionBounds({ low: 100, high: 100 }, 0.05), { low: 99.9, high: 100.1 });
});

test("Scalper V2 profile widths preserve magnitude, zero and missingness", () => {
  assert.equal(profileWidth(100, 200, 160), 80);
  assert.equal(profileWidth(200, 200, 160), 160);
  assert.equal(profileWidth(0, 200, 160), 0);
  assert.equal(profileWidth(null, 200, 160), null);
});

test("Scalper V2 distinguishes absent, partial and complete OI baselines", () => {
  assert.deepEqual(oiComparisonState([140, 80, 200], [100, 100, null]), { state: "partial", comparable: 2, total: 3 });
  assert.deepEqual(oiComparisonState([140, 80], [null, null]), { state: "baseline_unavailable", comparable: 0, total: 2 });
  assert.deepEqual(oiComparisonState([null], [100]), { state: "current_unavailable", comparable: 0, total: 1 });
});
