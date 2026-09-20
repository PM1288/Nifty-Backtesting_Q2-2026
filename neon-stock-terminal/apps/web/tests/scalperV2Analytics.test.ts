import assert from "node:assert/strict";
import test from "node:test";
import { scalperV2AdaptiveDeltaDomain, scalperV2CompactSideOption, scalperV2HorizontalDeltaOiOption, scalperV2PutMinusCall, scalperV2VerticalIvChangeOption, scalperV2VerticalStrikeOption } from "../src/lib/scalperV2Analytics";

test("Scalper V2 strike comparison preserves put minus call meaning and missingness", () => {
  assert.deepEqual(scalperV2PutMinusCall([100, 200, null, 50], [140, 80, 30, null]), [40, -120, null, null]);
});

test("Scalper V2 compact OI charts are vertical with an independent difference axis", () => {
  const option = scalperV2VerticalStrikeOption([23_450, 23_500], [100, 200], [140, 80], "oi", 23_477.8, 23_500);
  const xAxis = option.xAxis as Record<string, unknown>;
  const grid = option.grid as Record<string, unknown>;
  const yAxes = option.yAxis as Array<Record<string, unknown>>;
  const series = option.series as Array<Record<string, unknown>>;
  assert.equal(xAxis.type, "category");
  assert.deepEqual(xAxis.data, [23_450, 23_500]);
  assert.equal(grid.containLabel, true);
  assert.equal(grid.left, 2);
  assert.equal(grid.right, 2);
  assert.equal(grid.bottom, 2);
  assert.equal(yAxes.length, 2);
  assert.equal(yAxes[0].name, "OI");
  assert.equal(yAxes[1].name, "PE − CE OI");
  assert.equal(series[0].type, "bar");
  assert.equal(series[1].type, "bar");
  assert.equal(series[2].type, "line");
  assert.equal(series[2].yAxisIndex, 1);
  assert.deepEqual(series[2].data, [40, -120]);
});

test("Scalper V2 compact side charts suppress obstructive hover cards without changing expanded options", () => {
  const expanded = scalperV2VerticalStrikeOption([23_450], [100], [140], "oi");
  const compact = scalperV2CompactSideOption(expanded);
  assert.notEqual(compact, expanded);
  assert.equal((compact.tooltip as Record<string, unknown>).show, false);
  assert.equal((compact.tooltip as Record<string, unknown>).triggerOn, "none");
  assert.notEqual((expanded.tooltip as Record<string, unknown>).show, false);
  assert.deepEqual(compact.series, expanded.series);
});

test("Scalper V2 compact ΔOI chart keeps signed bars and PE minus CE line", () => {
  const option = scalperV2VerticalStrikeOption([100, 200], [40, -10], [-20, 30], "change");
  const yAxes = option.yAxis as Array<Record<string, unknown>>;
  const series = option.series as Array<Record<string, unknown>>;
  assert.equal(yAxes[0].name, "ΔOI");
  assert.equal(yAxes[1].name, "PE − CE ΔOI");
  assert.deepEqual(series[0].data, [40, -10]);
  assert.deepEqual(series[1].data, [-20, 30]);
  assert.deepEqual(series[2].data, [-60, 40]);
});

test("Scalper V2 option premium keeps exact side values and rupee difference", () => {
  const option = scalperV2VerticalStrikeOption([100, 200], [120.5, null], [88.25, 42], "premium");
  const yAxes = option.yAxis as Array<Record<string, unknown>>;
  const series = option.series as Array<Record<string, unknown>>;
  assert.equal(yAxes[0].name, "Premium · ₹");
  assert.equal(yAxes[1].name, "PE − CE Premium · ₹");
  assert.deepEqual(series[2].data, [-32.25, null]);
});

test("Scalper V2 bid ask spread is a separate rupee metric", () => {
  const option = scalperV2VerticalStrikeOption([100, 200], [0.5, 1.25], [0.75, null], "spread");
  const yAxes = option.yAxis as Array<Record<string, unknown>>;
  const series = option.series as Array<Record<string, unknown>>;
  assert.equal(yAxes[0].name, "Bid–ask spread · ₹");
  assert.equal(yAxes[1].name, "PE − CE Bid–ask spread · ₹");
  assert.deepEqual(series[2].data, [0.25, null]);
});

test("Scalper V2 ΔIV chart preserves sign, side identity, observed zero and missing baseline", () => {
  const option = scalperV2VerticalIvChangeOption([100, 200], [0.75, null], [-1.25, 0]);
  const yAxis = option.yAxis as { name: string; min: number; max: number };
  const series = option.series as Array<{ data: Array<null | { value: number; itemStyle: { color: string; borderColor: string } }> }>;
  assert.equal(yAxis.name, "ΔIV · pp");
  assert.equal(yAxis.min, -1.35);
  assert.equal(yAxis.max, 0.85);
  assert.equal(series[0].data[0]?.value, 0.75);
  assert.equal(series[0].data[0]?.itemStyle.color, "#15803d");
  assert.equal(series[0].data[0]?.itemStyle.borderColor, "#8a6200");
  assert.equal(series[0].data[1], null);
  assert.equal(series[1].data[0]?.itemStyle.color, "#b42336");
  assert.equal(series[1].data[0]?.itemStyle.borderColor, "#1d4ed8");
  assert.equal(series[1].data[1]?.itemStyle.color, "#64748b");
});

test("Scalper V2 ΔOI uses horizontal bars with strikes on the right Y axis", () => {
  const option = scalperV2HorizontalDeltaOiOption([23_450, 23_500], [40, null], [-20, 0]);
  const xAxis = option.xAxis as Record<string, unknown>;
  const yAxis = option.yAxis as Record<string, unknown>;
  const series = option.series as Array<Record<string, unknown>>;
  const markLine = series[0].markLine as { data: Array<Record<string, unknown>> };
  const axisLabel = yAxis.axisLabel as { interval: number; hideOverlap: boolean; formatter: (value: string, index: number) => string };

  assert.equal(xAxis.type, "value");
  assert.equal(xAxis.name, "Change in OI");
  assert.equal(xAxis.position, "top");
  assert.equal(xAxis.min, -23.2);
  assert.equal(xAxis.max, 43.2);
  assert.equal(yAxis.type, "category");
  assert.equal(yAxis.position, "right");
  assert.deepEqual(yAxis.data, [23_450, 23_500]);
  assert.equal(axisLabel.interval, 0);
  assert.equal(axisLabel.hideOverlap, false);
  assert.match(axisLabel.formatter("23450", 0), /23,450.*CE.*\+40.*PE.*−20/);
  assert.match(axisLabel.formatter("23500", 1), /23,500.*CE.*—.*PE.*0/);
  assert.equal(series[0].type, "bar");
  assert.equal(series[1].type, "bar");
  assert.equal((series[0].itemStyle as { color: string }).color, "#eab308");
  assert.equal((series[1].itemStyle as { color: string }).color, "#2563eb");
  assert.deepEqual(markLine.data, [{ xAxis: 0 }]);
});

test("Scalper V2 adaptive ΔOI domain keeps zero without wasting half the chart", () => {
  assert.deepEqual(scalperV2AdaptiveDeltaDomain([-100, -50, 0]), [-108, 8]);
  assert.deepEqual(scalperV2AdaptiveDeltaDomain([25, 100]), [-8, 108]);
  assert.deepEqual(scalperV2AdaptiveDeltaDomain([-100, 20]), [-108, 28]);
});

test("Scalper V2 horizontal ΔOI uses side colours and preserves signs, observed zero, and missingness", () => {
  const option = scalperV2HorizontalDeltaOiOption([100, 200], [40, null], [-20, 0]);
  const series = option.series as Array<{ data: Array<null | { value: number; itemStyle: { color: string; borderColor: string } }> }>;

  assert.equal(series[0].data[0]?.value, 40);
  assert.equal(series[0].data[0]?.itemStyle.color, "#eab308");
  assert.equal(series[0].data[0]?.itemStyle.borderColor, "#8a6200");
  assert.equal(series[0].data[1], null);
  assert.equal(series[1].data[0]?.value, -20);
  assert.equal(series[1].data[0]?.itemStyle.color, "#2563eb");
  assert.equal(series[1].data[1]?.value, 0);
  assert.equal(series[1].data[1]?.itemStyle.color, "#64748b");
});

test("Scalper V2 horizontal ΔOI shows NIFTY current on its strike axis", () => {
  const option = scalperV2HorizontalDeltaOiOption([23_450, 23_500], [40, 10], [-20, -5], 23_477.8, 23_500);
  const series = option.series as Array<{ markLine?: { data: Array<Record<string, unknown>> } }>;
  const guide = series[0].markLine?.data[1] as { yAxis: number; lineStyle: { type: string }; label: { formatter: string } };
  assert.equal(guide.yAxis, 1);
  assert.equal(guide.lineStyle.type, "dotted");
  assert.match(guide.label.formatter, /NIFTY current 23,477\.80/);
  assert.match(guide.label.formatter, /nearest strike 23,500/);
});
