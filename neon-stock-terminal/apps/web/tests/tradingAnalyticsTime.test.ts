import test from "node:test";
import assert from "node:assert/strict";
import { chartTimeToIso, istChartTimeLabel } from "../src/lib/tradingAnalyticsTime";

test("NSE chart epoch labels are formatted in IST rather than UTC", () => {
  const nineThirtyIst = Date.parse("2026-09-08T04:00:00.000Z") / 1000;
  assert.equal(istChartTimeLabel(nineThirtyIst), "09:30");
  assert.equal(chartTimeToIso(nineThirtyIst), "2026-09-08T04:00:00.000Z");
});

test("invalid chart timestamps remain unavailable", () => {
  assert.equal(chartTimeToIso("not-a-time"), null);
  assert.equal(istChartTimeLabel("not-a-time"), "—");
});
