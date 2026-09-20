import assert from "node:assert/strict";
import test from "node:test";
import { scalperV2OiDifferenceOption, scalperV2OiMetricOption, scalperV2PcrTimeOption, type ScalperV2OiTimePoint } from "../src/lib/scalperV2OiTime";

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

test("separate OI history panels retain the requested tracked-chain arithmetic", () => {
  const domain = { from: Date.parse("2026-09-19T03:45:00.000Z"), to: Date.parse("2026-09-19T10:00:00.000Z") };
  const oi = scalperV2OiMetricOption(points, "oi", String, domain, domain.from);
  const change = scalperV2OiMetricOption(points, "change", String, domain, domain.from);
  const oiSeries = oi.series as Array<{ name: string; data: Array<[number, number | null]> }>;
  const changeSeries = change.series as Array<{ name: string; data: Array<[number, number | null]> }>;
  assert.equal((oi.xAxis as { type: string }).type, "time");
  assert.equal((change.xAxis as { type: string }).type, "time");
  assert.equal((oi.xAxis as { min: number }).min, domain.from);
  assert.equal((oi.xAxis as { max: number }).max, domain.to);
  assert.equal(oi.dataZoom, undefined);
  assert.equal(oiSeries.length, 1);
  assert.equal(changeSeries.length, 1);
  assert.equal(oiSeries[0].name, "PE OI − CE OI");
  assert.equal(changeSeries[0].name, "PE ΔOI − CE ΔOI");
  assert.equal(oiSeries[0].data[0][1], 40);
  assert.equal(changeSeries[0].data[0][1], -50);
  const markLine = oiSeries[0] as unknown as { markLine: { data: Array<Record<string, unknown>> } };
  assert.equal(markLine.markLine.data[1].xAxis, domain.from);
});
