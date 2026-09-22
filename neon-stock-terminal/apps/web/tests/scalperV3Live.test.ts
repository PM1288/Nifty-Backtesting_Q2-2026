import assert from "node:assert/strict";
import test from "node:test";
import { scalperV3AccelerationArrow, scalperV3AgeLabel, scalperV3Delta, scalperV3FeedState, scalperV3ReferenceTime, scalperV3RowAtOrBefore, scalperV3Velocity } from "../src/lib/scalperV3Live";

test("Scalper V3 feed state is interval-aware and never calls missing data live", () => {
  assert.equal(scalperV3FeedState(50_000, 1, true), "live");
  assert.equal(scalperV3FeedState(130_000, 1, true), "delayed");
  assert.equal(scalperV3FeedState(300_000, 1, true), "stale");
  assert.equal(scalperV3FeedState(null, 5, true), "stale");
  assert.equal(scalperV3FeedState(0, 5, false), "closed");
});

test("Scalper V3 formats observation age compactly", () => {
  assert.equal(scalperV3AgeLabel(320), "0.3s");
  assert.equal(scalperV3AgeLabel(2_400), "2s");
  assert.equal(scalperV3AgeLabel(124_000), "2m 4s");
});

test("Scalper V3 selects only causal observations at or before a reference", () => {
  const rows = [{ t: 10, value: 1 }, { t: 20, value: 2 }, { t: 30, value: 3 }];
  assert.equal(scalperV3RowAtOrBefore(rows, 25, (row) => row.t)?.value, 2);
  assert.equal(scalperV3RowAtOrBefore(rows, 5, (row) => row.t), null);
});

test("Scalper V3 derives one global comparison reference", () => {
  assert.equal(scalperV3ReferenceTime({ reference: "5m", latestTime: 1_000, sessionOpenTime: 10, previousCloseTime: 5, pinnedTime: 20 }), 700);
  assert.equal(scalperV3ReferenceTime({ reference: "pinned", latestTime: 1_000, sessionOpenTime: 10, previousCloseTime: 5, pinnedTime: 20 }), 20);
});

test("Scalper V3 preserves unavailable deltas and exposes factual velocity", () => {
  assert.equal(scalperV3Delta(12, 10), 2);
  assert.equal(scalperV3Delta(null, 10), null);
  assert.equal(scalperV3Velocity(140, 100, 600_000, 300_000), 40);
  assert.equal(scalperV3Velocity(140, null, 600_000, 300_000), null);
  assert.equal(scalperV3AccelerationArrow(40, 20), "↑↑");
  assert.equal(scalperV3AccelerationArrow(-10, -9), "↓");
});
