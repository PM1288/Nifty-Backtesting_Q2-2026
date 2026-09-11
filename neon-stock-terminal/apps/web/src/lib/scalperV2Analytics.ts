import type { EChartsOption } from "echarts";
import { formatOiAxisValue } from "./scalperV2";

type DeltaOiValue = number | null;

const signedDeltaLabel = (value: DeltaOiValue) => value == null
  ? "—"
  : `${value > 0 ? "+" : ""}${formatOiAxisValue(value)}`;

const deltaBar = (value: DeltaOiValue, identity: string, borderColor: string) => value == null ? null : ({
  value,
  itemStyle: {
    color: identity,
    borderColor,
    borderWidth: 1,
  },
});

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
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    legend: { data: ["CE ΔOI", "PE ΔOI"], top: 2, left: 28 },
    grid: { left: 28, right: 218, top: 38, bottom: 52 },
    xAxis: {
      type: "value",
      name: "Signed ΔOI · provider units",
      nameLocation: "middle",
      nameGap: 34,
      axisLine: { show: true },
      axisTick: { show: true },
      axisLabel: { formatter: formatOiAxisValue, margin: 9 },
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
          return `{strike|${strikeLabel}}  {ce|CE ${signedDeltaLabel(ceChanges[index] ?? null)}}  {pe|PE ${signedDeltaLabel(peChanges[index] ?? null)}}`;
        },
        rich: {
          strike: { color: "#14243a", fontWeight: 650, width: 58 },
          ce: { color: "#1d4ed8", fontWeight: 600, width: 68 },
          pe: { color: "#785500", fontWeight: 600, width: 68 },
        },
      },
    },
    series: [
      {
        name: "CE ΔOI",
        type: "bar",
        barMaxWidth: 14,
        itemStyle: { color: "#2563eb", borderColor: "#1d4ed8", borderWidth: 1 },
        data: ceChanges.map((value) => deltaBar(value, "#2563eb", "#1d4ed8")),
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
        itemStyle: { color: "#eab308", borderColor: "#8a6200", borderWidth: 1 },
        data: peChanges.map((value) => deltaBar(value, "#eab308", "#8a6200")),
      },
    ],
  };
}
