import test from "node:test";
import assert from "node:assert/strict";
import { chartTimeToIso, intervalBarChartTime, istChartTimeLabel } from "../src/lib/tradingAnalyticsTime";

test("interval candles are plotted at the opening timestamp", () => {
  assert.equal(
    intervalBarChartTime({ start: "2026-09-18T03:45:00.000Z", end: "2026-09-18T03:50:00.000Z" }),
    Date.parse("2026-09-18T03:45:00.000Z") / 1000,
  );
});

test("older interval payloads without start fall back to end", () => {
  assert.equal(intervalBarChartTime({ end: "2026-09-18T03:46:00.000Z" }), Date.parse("2026-09-18T03:46:00.000Z") / 1000);
});

test("NSE chart epoch labels are formatted in IST rather than UTC", () => {
  const nineThirtyIst = Date.parse("2026-09-08T04:00:00.000Z") / 1000;
  assert.equal(istChartTimeLabel(nineThirtyIst), "09:30");
  assert.equal(chartTimeToIso(nineThirtyIst), "2026-09-08T04:00:00.000Z");
});

test("invalid chart timestamps remain unavailable", () => {
  assert.equal(chartTimeToIso("not-a-time"), null);
  assert.equal(istChartTimeLabel("not-a-time"), "—");
});
