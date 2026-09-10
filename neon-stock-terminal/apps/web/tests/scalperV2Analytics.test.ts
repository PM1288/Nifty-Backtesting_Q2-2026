import assert from "node:assert/strict";
import test from "node:test";
import { scalperV2HorizontalDeltaOiOption } from "../src/lib/scalperV2Analytics";

test("Scalper V2 ΔOI uses horizontal bars with strikes on the right Y axis", () => {
  const option = scalperV2HorizontalDeltaOiOption([23_450, 23_500], [40, null], [-20, 0]);
  const xAxis = option.xAxis as Record<string, unknown>;
  const yAxis = option.yAxis as Record<string, unknown>;
  const series = option.series as Array<Record<string, unknown>>;
  const markLine = series[0].markLine as { data: Array<Record<string, unknown>> };
  const axisLabel = yAxis.axisLabel as { interval: number; hideOverlap: boolean; formatter: (value: string, index: number) => string };

  assert.equal(xAxis.type, "value");
  assert.equal(xAxis.name, "Signed ΔOI · provider units");
  assert.equal(yAxis.type, "category");
  assert.equal(yAxis.position, "right");
  assert.deepEqual(yAxis.data, [23_450, 23_500]);
  assert.equal(axisLabel.interval, 0);
  assert.equal(axisLabel.hideOverlap, false);
  assert.match(axisLabel.formatter("23450", 0), /23,450.*CE \+40.*PE −20/);
  assert.match(axisLabel.formatter("23500", 1), /23,500.*CE —.*PE 0/);
  assert.equal(series[0].type, "bar");
  assert.equal(series[1].type, "bar");
  assert.deepEqual(markLine.data, [{ xAxis: 0 }]);
});

test("Scalper V2 horizontal ΔOI preserves signs, observed zero, and missingness", () => {
  const option = scalperV2HorizontalDeltaOiOption([100, 200], [40, null], [-20, 0]);
  const series = option.series as Array<{ data: Array<null | { value: number; itemStyle: { color: string; borderColor: string } }> }>;

  assert.equal(series[0].data[0]?.value, 40);
  assert.equal(series[0].data[0]?.itemStyle.color, "#117a40");
  assert.equal(series[0].data[0]?.itemStyle.borderColor, "#2563eb");
  assert.equal(series[0].data[1], null);
  assert.equal(series[1].data[0]?.value, -20);
  assert.equal(series[1].data[0]?.itemStyle.color, "#c6283d");
  assert.equal(series[1].data[1]?.value, 0);
  assert.equal(series[1].data[1]?.itemStyle.color, "#94a3b8");
});
