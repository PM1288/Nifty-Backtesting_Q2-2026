import type { EChartsOption } from "echarts";
import { formatOiAxisValue } from "./scalperV2";

type DeltaOiValue = number | null;

const signedDeltaLabel = (value: DeltaOiValue) => value == null
  ? "—"
  : `${value > 0 ? "+" : ""}${formatOiAxisValue(value)}`;

const NEUTRAL = "#64748b";
// V2 OI identity colours are intentionally independent from candle direction.
const CALL = "#eab308";
const CALL_BORDER = "#8a6200";
const PUT = "#2563eb";
const PUT_BORDER = "#1d4ed8";

export function scalperV2AdaptiveDeltaDomain(values: DeltaOiValue[], padding = 0.08): [number, number] {
  const observed = values.filter((value): value is number => value != null && Number.isFinite(value));
  if (!observed.length) return [-1, 1];
  const minimum = Math.min(0, ...observed), maximum = Math.max(0, ...observed);
  if (minimum < 0 && maximum > 0) {
    const pad = Math.max(Math.abs(minimum), Math.abs(maximum)) * padding;
    return [minimum - pad, maximum + pad];
  }
  if (minimum < 0) return [minimum * (1 + padding), Math.abs(minimum) * padding];
  if (maximum > 0) return [-maximum * padding, maximum * (1 + padding)];
  return [-1, 1];
}

/** Missing one side means the strike difference is unknown, not zero. */
export function scalperV2PutMinusCall(
  calls: DeltaOiValue[],
  puts: DeltaOiValue[],
): DeltaOiValue[] {
  return Array.from({ length: Math.max(calls.length, puts.length) }, (_, index) => {
    const call = calls[index] ?? null;
    const put = puts[index] ?? null;
    return call == null || put == null ? null : put - call;
  });
}

export function scalperV2VerticalStrikeOption(
  strikes: number[],
  calls: DeltaOiValue[],
  puts: DeltaOiValue[],
  metric: "oi" | "change" | "volume",
  underlyingValue: number | null = null,
  nearestStrike: number | null = null,
): EChartsOption {
  const difference = scalperV2PutMinusCall(calls, puts);
  const [primaryMinimum, primaryMaximum] = metric === "change"
    ? scalperV2AdaptiveDeltaDomain([...calls, ...puts])
    : [0, undefined];
  const [differenceMinimum, differenceMaximum] = scalperV2AdaptiveDeltaDomain(difference);
  const suffix = metric === "oi" ? "OI" : metric === "change" ? "ΔOI" : "Volume";
  const nearestIndex = nearestStrike == null ? -1 : strikes.indexOf(nearestStrike);
  return {
    animation: false,
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      valueFormatter: (value: unknown) => value == null ? "Unavailable" : formatOiAxisValue(Number(value)),
    },
    legend: {
      data: [`CE ${suffix}`, `PE ${suffix}`, `PE − CE ${suffix}`],
      top: 0,
      left: 2,
      right: 2,
      itemGap: 6,
      itemWidth: 12,
      itemHeight: 8,
      textStyle: { fontSize: 9 },
    },
    // Axis labels are part of the grid box. The previous fixed 62/58/48/52px
    // gutters were added on top of label space and consumed much of this narrow
    // side pane. Keep only a small outer inset and let ECharts reserve the exact
    // label footprint.
    grid: { left: 2, right: 2, top: 32, bottom: 2, containLabel: true },
    xAxis: {
      type: "category",
      data: strikes,
      axisLabel: { rotate: strikes.length > 12 ? 45 : 0, hideOverlap: true },
    },
    yAxis: [
      {
        type: "value",
        name: suffix,
        min: primaryMinimum,
        max: primaryMaximum,
        axisLabel: { formatter: formatOiAxisValue },
        splitLine: { lineStyle: { color: "rgba(100,116,139,.14)" } },
      },
      {
        type: "value",
        name: `PE − CE ${suffix}`,
        min: differenceMinimum,
        max: differenceMaximum,
        axisLabel: { formatter: formatOiAxisValue },
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: `CE ${suffix}`,
        type: "bar",
        data: calls,
        barMaxWidth: 18,
        itemStyle: { color: CALL, borderColor: CALL_BORDER, borderWidth: 1 },
        markLine: nearestIndex < 0 || underlyingValue == null ? undefined : {
          silent: true,
          symbol: "none",
          lineStyle: { color: "#0f766e", type: "dotted", width: 2 },
          label: { formatter: `NIFTY ${underlyingValue.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`, color: "#0f5f59" },
          data: [{ xAxis: nearestIndex }],
        },
      },
      {
        name: `PE ${suffix}`,
        type: "bar",
        data: puts,
        barMaxWidth: 18,
        itemStyle: { color: PUT, borderColor: PUT_BORDER, borderWidth: 1 },
      },
      {
        name: `PE − CE ${suffix}`,
        type: "line",
        yAxisIndex: 1,
        data: difference,
        connectNulls: false,
        symbol: "circle",
        symbolSize: 6,
        lineStyle: { color: "#7c3aed", width: 2 },
        itemStyle: { color: "#7c3aed" },
      },
    ],
  };
}

/** Signed IV change in percentage points. Missing baseline remains unavailable. */
export function scalperV2VerticalIvChangeOption(
  strikes: number[],
  calls: DeltaOiValue[],
  puts: DeltaOiValue[],
): EChartsOption {
  const [minimum, maximum] = scalperV2AdaptiveDeltaDomain([...calls, ...puts]);
  const bar = (value: DeltaOiValue, borderColor: string) => value == null ? null : ({
    value,
    itemStyle: {
      color: value > 0 ? "#15803d" : value < 0 ? "#b42336" : NEUTRAL,
      borderColor,
      borderWidth: 2,
    },
  });
  return {
    animation: false,
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      valueFormatter: (value: unknown) => value == null ? "Unavailable" : `${Number(value) > 0 ? "+" : ""}${Number(value).toFixed(2)} pp`,
    },
    legend: { data: ["CE ΔIV", "PE ΔIV"], top: 0, itemGap: 6, itemWidth: 12, itemHeight: 8, textStyle: { fontSize: 9 } },
    grid: { left: 2, right: 2, top: 32, bottom: 2, containLabel: true },
    xAxis: { type: "category", data: strikes, axisLabel: { rotate: strikes.length > 12 ? 45 : 0, hideOverlap: true } },
    yAxis: {
      type: "value", name: "ΔIV · pp", min: minimum, max: maximum,
      axisLabel: { formatter: (value: number) => `${value > 0 ? "+" : ""}${value}` },
      splitLine: { lineStyle: { color: "rgba(100,116,139,.14)" } },
    },
    series: [
      {
        name: "CE ΔIV", type: "bar", barMaxWidth: 18, data: calls.map((value) => bar(value, CALL_BORDER)),
        markLine: { silent: true, symbol: "none", label: { show: false }, lineStyle: { color: "#64748b" }, data: [{ yAxis: 0 }] },
      },
      { name: "PE ΔIV", type: "bar", barMaxWidth: 18, data: puts.map((value) => bar(value, PUT_BORDER)) },
    ],
  };
}

/** Option identity owns the fill; sign remains encoded by left/right geometry and the signed label. */
const deltaBar = (value: DeltaOiValue, color: string, borderColor: string) => value == null ? null : ({
  value,
  itemStyle: {
    color: value === 0 ? NEUTRAL : color,
    borderColor,
    borderWidth: 2,
  },
});

const richDelta = (value: DeltaOiValue, side: "ce" | "pe") => value == null
  ? `{missing|—}`
  : value === 0
    ? `{zero|0}`
    : `{${side}Value|${signedDeltaLabel(value)}}`;

export function scalperV2HorizontalDeltaOiOption(
  strikes: number[],
  ceChanges: DeltaOiValue[],
  peChanges: DeltaOiValue[],
  underlyingValue: number | null = null,
  nearestStrike: number | null = null,
): EChartsOption {
  const [domainMinimum, domainMaximum] = scalperV2AdaptiveDeltaDomain([...ceChanges, ...peChanges]);
  const nearestStrikeIndex = nearestStrike == null ? -1 : strikes.indexOf(nearestStrike);
  return {
    animation: false,
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    legend: { data: ["CE ΔOI", "PE ΔOI"], top: 2, left: 28 },
    grid: { left: 36, right: 278, top: 82, bottom: 22, containLabel: false },
    xAxis: {
      type: "value",
      name: "Change in OI",
      position: "top",
      nameLocation: "middle",
      nameGap: 42,
      axisLine: { show: true },
      axisTick: { show: true },
      axisLabel: { formatter: formatOiAxisValue, margin: 9 },
      splitLine: { show: true, lineStyle: { color: "rgba(100,116,139,.16)" } },
      splitNumber: 5,
      min: domainMinimum,
      max: domainMaximum,
    },
    yAxis: {
      type: "category",
      data: strikes,
      position: "right",
      axisLine: { show: true },
      axisTick: { show: true },
      axisLabel: {
        interval: 0,
        hideOverlap: false,
        margin: 10,
        align: "left",
        formatter: (_value: string, index: number) => {
          const strike = Number(strikes[index]);
          const strikeLabel = Number.isFinite(strike) ? strike.toLocaleString("en-IN") : "—";
          return `{strike|${strikeLabel}}  {ce|CE} ${richDelta(ceChanges[index] ?? null, "ce")}  {pe|PE} ${richDelta(peChanges[index] ?? null, "pe")}`;
        },
        rich: {
          strike: { color: "#14243a", fontWeight: 700, width: 62, fontSize: 12 },
          ce: { color: CALL_BORDER, fontWeight: 700, width: 20 },
          pe: { color: PUT_BORDER, fontWeight: 700, width: 20 },
          ceValue: { color: CALL_BORDER, fontWeight: 700, width: 54, align: "right" },
          peValue: { color: PUT_BORDER, fontWeight: 700, width: 54, align: "right" },
          zero: { color: NEUTRAL, fontWeight: 650, width: 54, align: "right" },
          missing: { color: NEUTRAL, width: 54, align: "right" },
        },
      },
    },
    series: [
      {
        name: "CE ΔOI",
        type: "bar",
        barMaxWidth: 14,
        barGap: "18%",
        barCategoryGap: "28%",
        itemStyle: { color: CALL, borderColor: CALL_BORDER, borderWidth: 2 },
        data: ceChanges.map((value) => deltaBar(value, CALL, CALL_BORDER)),
        markLine: {
          silent: true,
          symbol: "none",
          label: { show: false },
          lineStyle: { color: "#64748b", width: 1 },
          data: [
            { xAxis: 0 },
            ...(underlyingValue != null && Number.isFinite(underlyingValue) && nearestStrike != null && Number.isFinite(nearestStrike) && nearestStrikeIndex >= 0 ? [{
              // ECharts category-axis mark lines take the category index here.
              // Passing the numeric strike is interpreted as an out-of-range index.
              yAxis: nearestStrikeIndex,
              lineStyle: { color: "#0f766e", type: "dotted" as const, width: 2 },
              label: {
                show: true,
                color: "#0f5f59",
                backgroundColor: "rgba(255,255,255,.92)",
                padding: [3, 5] as [number, number],
                formatter: `NIFTY current ${underlyingValue.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\nnearest strike ${nearestStrike.toLocaleString("en-IN")}`,
                position: "insideEndTop" as const,
              },
            }] : []),
          ],
        },
      },
      {
        name: "PE ΔOI",
        type: "bar",
        barMaxWidth: 14,
        barGap: "18%",
        barCategoryGap: "28%",
        itemStyle: { color: PUT, borderColor: PUT_BORDER, borderWidth: 2 },
        data: peChanges.map((value) => deltaBar(value, PUT, PUT_BORDER)),
      },
    ],
  };
}
