import type { EChartsOption } from "echarts";
import { formatOiAxisValue } from "./scalperV2";

type DeltaOiValue = number | null;

const signedDeltaLabel = (value: DeltaOiValue) => value == null
  ? "—"
  : `${value > 0 ? "+" : ""}${formatOiAxisValue(value)}`;

const deltaBar = (value: DeltaOiValue, identity: string) => value == null ? null : ({
  value,
  itemStyle: {
    color: value < 0 ? "#c6283d" : value > 0 ? "#117a40" : "#94a3b8",
    borderColor: identity,
    borderWidth: 1,
  },
});

export function scalperV2HorizontalDeltaOiOption(
  strikes: number[],
  ceChanges: DeltaOiValue[],
  peChanges: DeltaOiValue[],
): EChartsOption {
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
        data: ceChanges.map((value) => deltaBar(value, "#2563eb")),
        markLine: {
          silent: true,
          symbol: "none",
          label: { show: false },
          lineStyle: { color: "#64748b", width: 1 },
          data: [{ xAxis: 0 }],
        },
      },
      {
        name: "PE ΔOI",
        type: "bar",
        barMaxWidth: 14,
        data: peChanges.map((value) => deltaBar(value, "#eab308")),
      },
    ],
  };
}
