import test from "node:test";
import assert from "node:assert/strict";
import {
  chartInterval,
  istDay,
  dayRows,
  candleColors,
} from "../src/lib/tradingAnalyticsChartView";
test("scalper defaults and invalid timeframe fallback use five minutes", () => {
  assert.equal(chartInterval(null), 5);
  assert.equal(chartInterval("bad"), 5);
  assert.equal(chartInterval("15"), 15);
});
test("one-day filter uses IST and preserves existing EMA", () => {
  const rows = [
    { end: "2026-09-06T19:00:00Z", ema9: 100 },
    { end: "2026-09-06T10:00:00Z", ema9: 90 },
  ];
  assert.equal(istDay(rows[0].end), "2026-09-07");
  assert.deepEqual(dayRows(rows, "2026-09-07", "end"), [rows[0]]);
});
test("green rising and red falling candles remain distinct", () => {
  assert.equal(candleColors.color, "#087a55");
  assert.equal(candleColors.color0, "#c93346");
});
