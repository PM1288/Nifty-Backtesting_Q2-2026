import test from "node:test";
import assert from "node:assert/strict";
import {
  chartInterval,
  istDay,
  dayRows,
  candleColors,
  evidenceValueAxis,
  financialVisibleBounds,
  levelIsNearVisiblePrice,
  roundNumberGuides,
} from "../src/lib/tradingAnalyticsChartView";
test("evidence axes explicitly show value line, ticks and readable signed labels",()=>{
  assert.equal(evidenceValueAxis.axisLine.show,true);
  assert.equal(evidenceValueAxis.axisTick.show,true);
  assert.equal(evidenceValueAxis.axisLabel.show,true);
  assert.equal(evidenceValueAxis.axisLabel.formatter(0),"0");
  assert.ok(evidenceValueAxis.axisLabel.formatter(-5000).startsWith("-"));
  assert.equal(evidenceValueAxis.axisLabel.formatter(0.52),"0.52");
});
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
test("financial bounds use both candle lows and highs and ignore missing values", () => {
  assert.deepEqual(financialVisibleBounds([
    { open: 100, close: 102, low: 97, high: 105 },
    { open: 102, close: 101, low: 99, high: 108 },
    { low: null, high: undefined },
  ]), { min: 97, max: 108 });
  assert.equal(financialVisibleBounds([]), null);
});
test("round-number guides stay inside price bounds and distant levels remain off-screen", () => {
  const bounds = { min: 24112, max: 24218 };
  assert.deepEqual(roundNumberGuides(bounds, 50), [24150, 24200]);
  assert.equal(levelIsNearVisiblePrice(24220, bounds), true);
  assert.equal(levelIsNearVisiblePrice(24659.25, bounds), false);
  assert.deepEqual(roundNumberGuides(bounds, 0), []);
});
