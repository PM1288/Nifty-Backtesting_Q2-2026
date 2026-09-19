import assert from "node:assert/strict";
import test from "node:test";
import { scalperV2OiDifferenceOption, scalperV2PcrTimeOption, type ScalperV2OiTimePoint } from "../src/lib/scalperV2OiTime";

const points: ScalperV2OiTimePoint[] = [{
  capturedAt: "2026-09-19T04:00:00.000Z",
  ceOi: 100, peOi: 140, ceChangeOi: 30, peChangeOi: -20,
  oiDifference: 40, changeOiDifference: -50, pcr: 1.4,
}];

test("OI difference history uses one time axis and independent OI/change axes", () => {
  const option = scalperV2OiDifferenceOption(points, String);
  const axes = option.yAxis as Array<Record<string, unknown>>;
  const series = option.series as Array<{ yAxisIndex: number; data: Array<[number, number | null]> }>;
  assert.equal((option.xAxis as { type: string }).type, "time");
  assert.equal(axes.length, 2);
  assert.equal(axes[0].name, "PE OI − CE OI");
  assert.equal(axes[1].name, "PE ΔOI − CE ΔOI");
  assert.equal(series[0].yAxisIndex, 0);
  assert.equal(series[1].yAxisIndex, 1);
  assert.deepEqual(series[0].data[0][1], 40);
  assert.deepEqual(series[1].data[0][1], -50);
});

test("PCR history plots the retained PE divided by CE ratio", () => {
  const option = scalperV2PcrTimeOption(points, String);
  const series = option.series as Array<{ data: Array<[number, number | null]> }>;
  assert.equal((option.yAxis as { name: string }).name, "OI PCR · PE / CE");
  assert.equal(series[0].data[0][1], 1.4);
});
