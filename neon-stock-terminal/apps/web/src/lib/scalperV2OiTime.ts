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

export function scalperV2OiDifferenceOption(
  points: ScalperV2OiTimePoint[],
  timeLabel: (value: number) => string,
): EChartsOption {
  const rows = points.filter(validTime);
  return {
    animation: false,
    tooltip: { trigger: "axis", valueFormatter: (value: unknown) => value == null ? "Unavailable" : formatOiAxisValue(Number(value)) },
    legend: { data: ["PE OI − CE OI", "PE ΔOI − CE ΔOI"], top: 2 },
    grid: { left: 76, right: 76, top: 48, bottom: 56 },
    dataZoom: [{ type: "inside", xAxisIndex: 0 }],
    xAxis: { type: "time", name: "Timestamp · IST", nameGap: 32, axisLabel: { formatter: timeLabel } },
    yAxis: [
      {
        type: "value", name: "PE OI − CE OI", axisLabel: { formatter: formatOiAxisValue },
        splitLine: { lineStyle: { color: "rgba(100,116,139,.14)" } },
      },
      {
        type: "value", name: "PE ΔOI − CE ΔOI", axisLabel: { formatter: formatOiAxisValue },
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: "PE OI − CE OI", type: "line", yAxisIndex: 0,
        data: rows.map((point) => [timestamp(point), point.oiDifference]),
        connectNulls: false, showSymbol: rows.length <= 1, symbolSize: 7,
        lineStyle: { color: "#7c3aed", width: 2 }, itemStyle: { color: "#7c3aed" },
        markLine: { silent: true, symbol: "none", label: { show: false }, lineStyle: { color: "#64748b", type: "dashed" }, data: [{ yAxis: 0 }] },
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
    xAxis: { type: "time", name: "Timestamp · IST", nameGap: 32, axisLabel: { formatter: timeLabel } },
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
