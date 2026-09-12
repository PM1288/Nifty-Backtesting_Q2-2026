import assert from "node:assert/strict";
import test from "node:test";
import { underlyingReferenceLevels } from "./tradingAnalyticsReferenceLevels";

const rows = Array.from({ length: 55 }, (_, index) => {
  const date = new Date(Date.UTC(2026, 6, 1 + index));
  const value = 100 + index;
  return { date: date.toISOString().slice(0, 10), open: value, high: value + 4, low: value - 3, close: value + 1 };
}).filter((row) => ![0, 6].includes(new Date(`${row.date}T00:00:00Z`).getUTCDay()));

test("underlying references preserve session, period and rolling extrema", () => {
  const result = underlyingReferenceLevels(rows, { day_open: 150, day_high: 156, day_low: 148, ltp: 154, previous_close: 149, exch_feed_time: "2026-09-11T10:00:00Z" }, "2026-09-12T08:00:00Z");
  const values = Object.fromEntries(result.levels.map((level) => [level.id, level.value]));
  assert.equal(values.current, 154);
  assert.equal(values["today-open"], 150);
  assert.equal(values["previous-day-close"], 149);
  assert.ok(values["current-week-open"] != null);
  assert.ok(values["current-month-open"] != null);
  assert.ok(values["five-day-low"] < values["five-day-high"]);
  assert.ok(values["thirty-day-low"] < values["thirty-day-high"]);
});

test("underlying references do not fabricate unavailable windows", () => {
  const result = underlyingReferenceLevels(rows.slice(-3), { day_open: 150, day_high: 151, day_low: 149, ltp: 150, exch_feed_time: "2026-09-11T10:00:00Z" }, "2026-09-12T08:00:00Z");
  assert.equal(result.levels.some((level) => level.id.startsWith("five-day")), false);
  assert.equal(result.levels.some((level) => level.id.startsWith("thirty-day")), false);
  assert.equal(result.levels.some((level) => level.id === "previous-day-close"), true);
});
