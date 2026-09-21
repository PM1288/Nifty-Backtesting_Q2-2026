import assert from "node:assert/strict";
import test from "node:test";
import { scalperV2OiDifferenceOption, scalperV2OiMetricOption, scalperV2PcrTimeOption, scalperV2SessionHeatData, type ScalperV2OiTimePoint } from "../src/lib/scalperV2OiTime";

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
  const oiSeries = oi.series as Array<{ name: string; yAxisIndex: number; data: Array<[number, number | null, number?]>; lineStyle?: Record<string, unknown>; areaStyle?: Record<string, unknown> }>;
  const changeSeries = change.series as Array<{ name: string; yAxisIndex: number; data: Array<[number, number | null, number?]>; lineStyle?: Record<string, unknown>; areaStyle?: Record<string, unknown> }>;
  assert.equal((oi.xAxis as { type: string }).type, "time");
  assert.equal((change.xAxis as { type: string }).type, "time");
  assert.equal((oi.xAxis as { min: number }).min, domain.from);
  assert.equal((oi.xAxis as { max: number }).max, domain.to);
  assert.equal(oi.dataZoom, undefined);
  assert.deepEqual(oi.grid, { left: 0, right: 72, top: 24, bottom: 38, containLabel: false });
  assert.equal((oi.yAxis as Array<{ position: string }>)[0].position, "right");
  assert.equal((oi.yAxis as Array<{ position: string }>)[1].position, "left");
  assert.equal(oiSeries.length, 3);
  assert.equal(changeSeries.length, 3);
  assert.equal(oiSeries[0].name, "PE OI − CE OI");
  assert.equal(changeSeries[0].name, "PE ΔOI − CE ΔOI");
  assert.equal(oiSeries[0].data[0][1], 40);
  assert.equal(changeSeries[0].data[0][1], -50);
  assert.deepEqual(oiSeries.slice(1).map((series) => [series.name, series.yAxisIndex, series.lineStyle?.type, series.areaStyle]), [
    ["Cumulative CE OI", 1, "dotted", undefined],
    ["Cumulative PE OI", 1, "dotted", undefined],
  ]);
  assert.deepEqual(changeSeries.slice(1).map((series) => [series.name, series.yAxisIndex, series.lineStyle?.type, series.areaStyle]), [
    ["Cumulative CE ΔOI", 1, "dotted", undefined],
    ["Cumulative PE ΔOI", 1, "dotted", undefined],
  ]);
  assert.equal(oiSeries[1].data[0][1], 100);
  assert.equal(oiSeries[2].data[0][1], 140);
  assert.equal(changeSeries[1].data[0][1], 30);
  assert.equal(changeSeries[2].data[0][1], -20);
  assert.deepEqual((oi.visualMap as { inRange: { color: string[] } }).inRange.color, ["#c6283d", "#111827", "#15803d"]);
  const markLine = oiSeries[0] as unknown as { markLine: { data: Array<Record<string, unknown>> } };
  assert.equal(markLine.markLine.data[1].xAxis, domain.from);
});

test("difference line heat score anchors session low red, open black and high green", () => {
  const rows: ScalperV2OiTimePoint[] = [
    { ...points[0], capturedAt: "2026-09-19T03:45:00.000Z", oiDifference: 40 },
    { ...points[0], capturedAt: "2026-09-19T03:50:00.000Z", oiDifference: 10 },
    { ...points[0], capturedAt: "2026-09-19T03:55:00.000Z", oiDifference: 100 },
    { ...points[0], capturedAt: "2026-09-19T04:00:00.000Z", oiDifference: 70 },
  ];
  const data = scalperV2SessionHeatData(rows, (point) => point.oiDifference);
  assert.deepEqual(data.map((datum) => datum[1]), [40, 10, 100, 70]);
  assert.deepEqual(data.map((datum) => datum[2]), [0, -1, 1, 0.5]);
});
