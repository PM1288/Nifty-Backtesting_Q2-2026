import assert from "node:assert/strict";
import test from "node:test";
import { scalperV2ReferenceGauge, visibleScalperV2ReferenceLevels } from "../src/lib/scalperV2ReferenceLevels";

const levels = [
  { id: "current", label: "Current", shortLabel: "NOW", value: 105, sourceDate: "2026-09-11", source: "live_session" as const },
  { id: "today-open", label: "Today open", shortLabel: "D O", value: 100, sourceDate: "2026-09-11", source: "live_session" as const },
  { id: "previous-day-close", label: "Yesterday close", shortLabel: "D-1 C", value: 98, sourceDate: "2026-09-10", source: "daily_bar" as const },
  { id: "previous-month-close", label: "Previous month close", shortLabel: "M-1 C", value: 80, sourceDate: "2026-08-31", source: "daily_bar" as const },
  { id: "thirty-day-low", label: "30-session minimum", shortLabel: "30D MIN", value: 90, sourceDate: "2026-08-01", source: "derived_window" as const },
  { id: "thirty-day-high", label: "30-session maximum", shortLabel: "30D MAX", value: 110, sourceDate: "2026-08-01", source: "derived_window" as const },
];

test("Scalper V2 plots references only inside raw session bounds", () => {
  assert.deepEqual(visibleScalperV2ReferenceLevels(levels, { low: 95, high: 110 }).map((level) => level.id), ["today-open", "previous-day-close", "thirty-day-high"]);
  assert.deepEqual(visibleScalperV2ReferenceLevels(levels, null), []);
});

test("Scalper V2 reference gauge uses the exact 30-session range and labels every eligible strike", () => {
  const gauge = scalperV2ReferenceGauge(levels, [85, 90, 95, 100, 105, 110, 115]);
  assert.equal(gauge.low, 90);
  assert.equal(gauge.high, 110);
  assert.deepEqual(gauge.strikes.map((strike) => strike.value), [90, 95, 100, 105, 110]);
  assert.equal(gauge.points.some((point) => point.id === "previous-month-close"), false);
  assert.equal(gauge.points.find((point) => point.id === "current")?.position, 75);
});

test("Scalper V2 reference gauge stays unavailable without a complete 30-session envelope", () => {
  const gauge = scalperV2ReferenceGauge(levels.filter((level) => !level.id.startsWith("thirty-day")), [100]);
  assert.equal(gauge.low, null);
  assert.equal(gauge.high, null);
  assert.deepEqual(gauge.strikes, []);
});
