import type { EChartsOption } from "echarts";
import { formatOiAxisValue } from "./scalperV2";

export type ScalperV2OiTimePoint = {
  capturedAt: string;
  ceOi: number | null;
  peOi: number | null;
  ceChangeOi: number | null;
  peChangeOi: number | null;
  oiDifference: number | null;
  changeOiDifference: number | null;
  pcr: number | null;
};

const timestamp = (point: ScalperV2OiTimePoint) => Date.parse(point.capturedAt);
const validTime = (point: ScalperV2OiTimePoint) => Number.isFinite(timestamp(point));
const nativePriceScaleGutter = 72;

const roundedOiAxisValue = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "—";
  const absolute = Math.abs(parsed);
  const sign = parsed < 0 ? "−" : "";
  if (absolute >= 10_000_000) return `${sign}${Math.round(absolute / 10_000_000).toLocaleString("en-IN")}Cr`;
  if (absolute >= 100_000) return `${sign}${Math.round(absolute / 100_000).toLocaleString("en-IN")}L`;
  if (absolute >= 1_000) return `${sign}${Math.round(absolute / 1_000).toLocaleString("en-IN")}K`;
  return `${sign}${Math.round(absolute).toLocaleString("en-IN")}`;
};

export type ScalperV2OiDifferenceMetric = "oi" | "change";
export type ScalperV2TimeDomain = { from: number; to: number };

const timeAxis = (timeLabel: (value: number) => string, domain?: ScalperV2TimeDomain) => ({
  type: "time" as const,
  min: domain?.from,
  max: domain?.to,
  axisPointer: { show: true, snap: true, lineStyle: { color: "#334155", type: "dashed" as const } },
  axisLabel: { formatter: timeLabel },
});

const dayOpenMark = (dayOpenMs?: number | null) => dayOpenMs == null || !Number.isFinite(dayOpenMs) ? [] : [{
  xAxis: dayOpenMs,
  label: { show: true, formatter: "Day open", position: "insideStartTop" as const, color: "#0f5f59" },
  lineStyle: { color: "#0f766e", type: "dotted" as const, width: 2 },
}];

type HeatDatum = [number, number | null, number | null];

/**
 * Adds a stable visual score without changing the plotted value:
 * session low = -1, first observed value = 0, session high = +1.
 * This lets ECharts colour the primary line red -> black -> green even when
 * the opening value is not the midpoint of the numerical Y range.
 */
export function scalperV2SessionHeatData(
  rows: ScalperV2OiTimePoint[],
  value: (point: ScalperV2OiTimePoint) => number | null,
): HeatDatum[] {
  const observed = rows.flatMap((point) => {
    const candidate = value(point);
    return candidate == null || !Number.isFinite(candidate) ? [] : [candidate];
  });
  const opening = observed[0] ?? null;
  const minimum = observed.length ? Math.min(...observed) : null;
  const maximum = observed.length ? Math.max(...observed) : null;
  const score = (candidate: number | null) => {
    if (candidate == null || opening == null || minimum == null || maximum == null) return null;
    if (candidate === opening) return 0;
    if (candidate < opening) return opening > minimum ? -(opening - candidate) / (opening - minimum) : 0;
    return maximum > opening ? (candidate - opening) / (maximum - opening) : 0;
  };
  return rows.map((point) => {
    const candidate = value(point);
    return [timestamp(point), candidate, score(candidate)];
  });
}

export function scalperV2OiContextBands(
  rows: ScalperV2OiTimePoint[],
  metric: ScalperV2OiDifferenceMetric,
) {
  const change = metric === "change";
  const values = rows.map((point) => {
    const ce = change ? point.ceChangeOi : point.ceOi;
    const pe = change ? point.peChangeOi : point.peOi;
    return { time: timestamp(point), ce, pe };
  });
  const band = (positive: boolean, base: boolean) => values.map(({ time, ce, pe }) => {
    if (ce == null || pe == null || !Number.isFinite(ce) || !Number.isFinite(pe)) return [time, null];
    const matches = positive ? pe >= ce : ce > pe;
    if (!matches) return [time, null];
    return [time, base ? Math.min(ce, pe) : Math.abs(pe - ce)];
  });
  return {
    peAboveBase: band(true, true),
    peAboveGap: band(true, false),
    ceAboveBase: band(false, true),
    ceAboveGap: band(false, false),
  };
}

export function scalperV2OiMetricOption(
  points: ScalperV2OiTimePoint[],
  metric: ScalperV2OiDifferenceMetric,
  timeLabel: (value: number) => string,
  domain?: ScalperV2TimeDomain,
  dayOpenMs?: number | null,
  unitLabel = "",
): EChartsOption {
  const rows = points.filter(validTime);
  const change = metric === "change";
  const name = change ? "PE ΔOI − CE ΔOI" : "PE OI − CE OI";
  const ceName = change ? "Cumulative CE ΔOI" : "Cumulative CE OI";
  const peName = change ? "Cumulative PE ΔOI" : "Cumulative PE OI";
  const differenceData = scalperV2SessionHeatData(rows, (point) => change ? point.changeOiDifference : point.oiDifference);
  const ceData = rows.map((point) => [timestamp(point), change ? point.ceChangeOi : point.ceOi]);
  const peData = rows.map((point) => [timestamp(point), change ? point.peChangeOi : point.peOi]);
  const contextBands = scalperV2OiContextBands(rows, metric);
  const bandBase = (name: string, stack: string, data: Array<Array<number | null>>) => ({
    name,
    type: "line" as const,
    yAxisIndex: 1,
    stack,
    data,
    connectNulls: false,
    showSymbol: false,
    symbol: "none" as const,
    silent: true,
    tooltip: { show: false },
    lineStyle: { opacity: 0, width: 0 },
    areaStyle: { opacity: 0 },
    z: 0,
  });
  const bandGap = (name: string, stack: string, data: Array<Array<number | null>>, color: string) => ({
    name,
    type: "line" as const,
    yAxisIndex: 1,
    stack,
    data,
    connectNulls: false,
    showSymbol: false,
    symbol: "none" as const,
    silent: true,
    tooltip: { show: false },
    lineStyle: { opacity: 0, width: 0 },
    areaStyle: { color, opacity: 0.3 },
    z: 0,
  });
  return {
    animation: false,
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "line", snap: true },
      valueFormatter: (value: unknown) => value == null ? "Unavailable" : roundedOiAxisValue(value),
    },
    legend: {
      data: [name, ceName, peName],
      top: 0,
      left: 2,
      itemGap: 7,
      itemWidth: 11,
      itemHeight: 7,
      textStyle: { fontSize: 7 },
    },
    visualMap: {
      show: false,
      type: "continuous",
      min: -1,
      max: 1,
      dimension: 2,
      seriesIndex: 0,
      inRange: { color: ["#c6283d", "#111827", "#15803d"] },
    },
    // Match the native price panes: time starts at the plot's left edge and
    // the numeric scale occupies the right-side price-scale gutter.
    grid: { left: 0, right: nativePriceScaleGutter, top: 20, bottom: 28, containLabel: false },
    xAxis: timeAxis(timeLabel, domain),
    yAxis: [
      {
        type: "value",
        name: unitLabel ? `${name} · ${unitLabel}` : name,
        position: "right",
        nameLocation: "end",
        scale: true,
        axisLabel: { formatter: roundedOiAxisValue, fontSize: 8 },
        splitLine: { lineStyle: { color: "rgba(100,116,139,.14)" } },
      },
      {
        type: "value",
        name: unitLabel ? `${change ? "CE / PE ΔOI" : "CE / PE OI"} · ${unitLabel}` : change ? "CE / PE ΔOI" : "CE / PE OI",
        position: "left",
        scale: change,
        min: change ? undefined : 0,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { inside: true, formatter: roundedOiAxisValue, color: "rgba(71,85,105,.72)", fontSize: 7 },
        nameTextStyle: { color: "rgba(71,85,105,.72)", fontSize: 7, align: "left" },
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name,
        type: "line",
        yAxisIndex: 0,
        data: differenceData,
        encode: { x: 0, y: 1, tooltip: [1] },
        connectNulls: false,
        showSymbol: rows.length <= 1,
        symbolSize: 7,
        lineStyle: { width: 2.4 },
        z: 3,
        markLine: {
          silent: true,
          symbol: "none",
          label: { show: false },
          lineStyle: { color: "#64748b", type: "dashed" },
          data: [{ yAxis: 0 }, ...dayOpenMark(dayOpenMs)],
        },
      },
      bandBase("PE above CE base", "pe-above", contextBands.peAboveBase),
      bandGap("PE above CE area", "pe-above", contextBands.peAboveGap, "#15803d"),
      bandBase("CE above PE base", "ce-above", contextBands.ceAboveBase),
      bandGap("CE above PE area", "ce-above", contextBands.ceAboveGap, "#c6283d"),
      {
        name: ceName,
        type: "line",
        yAxisIndex: 1,
        data: ceData,
        connectNulls: false,
        showSymbol: false,
        lineStyle: { color: "#eab308", width: 1, type: "dotted", opacity: 0.7 },
        itemStyle: { color: "#eab308", opacity: 0.7 },
        z: 2,
      },
      {
        name: peName,
        type: "line",
        yAxisIndex: 1,
        data: peData,
        connectNulls: false,
        showSymbol: false,
        lineStyle: { color: "#2563eb", width: 1, type: "dotted", opacity: 0.7 },
        itemStyle: { color: "#2563eb", opacity: 0.7 },
        z: 2,
      },
    ],
  };
}

export function scalperV2OiDifferenceOption(
  points: ScalperV2OiTimePoint[],
  timeLabel: (value: number) => string,
  domain?: ScalperV2TimeDomain,
  dayOpenMs?: number | null,
  unitLabel = "",
): EChartsOption {
  const rows = points.filter(validTime);
  return {
    animation: false,
    tooltip: { trigger: "axis", valueFormatter: (value: unknown) => value == null ? "Unavailable" : formatOiAxisValue(Number(value)) },
    legend: { data: ["PE OI − CE OI", "PE ΔOI − CE ΔOI"], top: 2 },
    grid: { left: 76, right: 76, top: 48, bottom: 56 },
    dataZoom: [{ type: "inside", xAxisIndex: 0 }],
    xAxis: { ...timeAxis(timeLabel, domain), name: "Timestamp · IST", nameGap: 32 },
    yAxis: [
      {
        type: "value", name: unitLabel ? `PE OI − CE OI · ${unitLabel}` : "PE OI − CE OI", axisLabel: { formatter: formatOiAxisValue },
        splitLine: { lineStyle: { color: "rgba(100,116,139,.14)" } },
      },
      {
        type: "value", name: unitLabel ? `PE ΔOI − CE ΔOI · ${unitLabel}` : "PE ΔOI − CE ΔOI", axisLabel: { formatter: formatOiAxisValue },
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: "PE OI − CE OI", type: "line", yAxisIndex: 0,
        data: rows.map((point) => [timestamp(point), point.oiDifference]),
        connectNulls: false, showSymbol: rows.length <= 1, symbolSize: 7,
        lineStyle: { color: "#7c3aed", width: 2 }, itemStyle: { color: "#7c3aed" },
        markLine: { silent: true, symbol: "none", label: { show: false }, lineStyle: { color: "#64748b", type: "dashed" }, data: [{ yAxis: 0 }, ...dayOpenMark(dayOpenMs)] },
      },
      {
        name: "PE ΔOI − CE ΔOI", type: "line", yAxisIndex: 1,
        data: rows.map((point) => [timestamp(point), point.changeOiDifference]),
        connectNulls: false, showSymbol: rows.length <= 1, symbolSize: 7,
        lineStyle: { color: "#0f766e", width: 2 }, itemStyle: { color: "#0f766e" },
      },
    ],
  };
}

export function scalperV2PcrTimeOption(
  points: ScalperV2OiTimePoint[],
  timeLabel: (value: number) => string,
  domain?: ScalperV2TimeDomain,
): EChartsOption {
  const rows = points.filter(validTime);
  return {
    animation: false,
    tooltip: {
      trigger: "axis",
      valueFormatter: (value: unknown) => value == null ? "Unavailable" : Number(value).toLocaleString("en-IN", { minimumFractionDigits: 3, maximumFractionDigits: 3 }),
    },
    grid: { left: 64, right: 24, top: 34, bottom: 56 },
    dataZoom: [{ type: "inside", xAxisIndex: 0 }],
    xAxis: { ...timeAxis(timeLabel, domain), name: "Timestamp · IST", nameGap: 32 },
    yAxis: { type: "value", name: "OI PCR · PE / CE", scale: true, axisLabel: { formatter: (value: number) => value.toFixed(2) } },
    series: [{
      name: "OI PCR", type: "line",
      data: rows.map((point) => [timestamp(point), point.pcr]),
      connectNulls: false, showSymbol: rows.length <= 1, symbolSize: 7,
      lineStyle: { color: "#9a6700", width: 2 }, itemStyle: { color: "#9a6700" }, areaStyle: { color: "rgba(234,179,8,.12)" },
      markLine: { silent: true, symbol: "none", label: { formatter: "PCR 1.00" }, lineStyle: { color: "#64748b", type: "dashed" }, data: [{ yAxis: 1 }] },
    }],
  };
}
