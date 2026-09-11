import type { EChartsOption } from "echarts";
import { formatOiAxisValue } from "./scalperV2";

type DeltaOiValue = number | null;

const signedDeltaLabel = (value: DeltaOiValue) => value == null
  ? "—"
  : `${value > 0 ? "+" : ""}${formatOiAxisValue(value)}`;

const NEUTRAL = "#64748b";
const CALL = "#2563eb";
const CALL_BORDER = "#1d4ed8";
const PUT = "#eab308";
const PUT_BORDER = "#8a6200";

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
  const maximum = Math.max(1, ...[...ceChanges, ...peChanges].flatMap((value) => value == null || !Number.isFinite(value) ? [] : [Math.abs(value)]));
  const nearestStrikeIndex = nearestStrike == null ? -1 : strikes.indexOf(nearestStrike);
  return {
    animation: false,
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    legend: { data: ["CE ΔOI", "PE ΔOI"], top: 2, left: 28 },
    grid: { left: 36, right: 278, top: 82, bottom: 22, containLabel: false },
    xAxis: {
      type: "value",
      name: "Signed ΔOI · provider units",
      position: "top",
      nameLocation: "middle",
      nameGap: 42,
      axisLine: { show: true },
      axisTick: { show: true },
      axisLabel: { formatter: formatOiAxisValue, margin: 9 },
      splitLine: { show: true, lineStyle: { color: "rgba(100,116,139,.16)" } },
      splitNumber: 5,
      min: -maximum,
      max: maximum,
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
          ce: { color: "#1d4ed8", fontWeight: 700, width: 20 },
          pe: { color: "#785500", fontWeight: 700, width: 20 },
          ceValue: { color: CALL_BORDER, fontWeight: 700, width: 54, align: "right" },
          peValue: { color: "#785500", fontWeight: 700, width: 54, align: "right" },
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
