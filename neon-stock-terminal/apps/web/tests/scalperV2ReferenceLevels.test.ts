import assert from "node:assert/strict";
import test from "node:test";
import { scalperV2ReferenceGauge, visibleScalperV2ReferenceLevels } from "../src/lib/scalperV2ReferenceLevels";

const levels = [
  { id: "current", label: "Current", shortLabel: "NOW", value: 105, sourceDate: "2026-09-11", source: "live_session" as const },
  { id: "today-open", label: "Today open", shortLabel: "D O", value: 100, sourceDate: "2026-09-11", source: "live_session" as const },
  { id: "previous-day-close", label: "Yesterday close", shortLabel: "D-1 C", value: 98, sourceDate: "2026-09-10", source: "daily_bar" as const },
  { id: "previous-month-close", label: "Previous month close", shortLabel: "M-1 C", value: 80, sourceDate: "2026-08-31", source: "daily_bar" as const },
];

test("Scalper V2 plots references only inside raw session bounds", () => {
  assert.deepEqual(visibleScalperV2ReferenceLevels(levels, { low: 95, high: 110 }).map((level) => level.id), ["today-open", "previous-day-close"]);
  assert.deepEqual(visibleScalperV2ReferenceLevels(levels, null), []);
});

test("Scalper V2 reference gauge retains off-session evidence without changing chart bounds", () => {
  const gauge = scalperV2ReferenceGauge(levels);
  assert.equal(gauge.points.length, 4);
  assert.ok(gauge.low != null && gauge.low < 80);
  assert.ok(gauge.high != null && gauge.high > 105);
  assert.ok(gauge.points.every((point) => point.position > 0 && point.position < 100));
});
