import type { EChartsOption } from "echarts";
import { formatOiAxisValue } from "./scalperV2";
import { scalperV2AdaptiveDeltaDomain } from "./scalperV2Analytics";
import type { ScalperV2OptionPricePoint } from "./scalperV2NormalizedPrice";

export type ScalperV2Regime = "Long buildup" | "Short buildup" | "Short covering" | "Long unwinding" | "Neutral" | "Unavailable";
export type PositioningCell = {
  timestamp: number; side: "CE" | "PE"; strike: number; price: number | null; oi: number | null;
  changeOi: number | null; premiumReturnPct: number | null; volume: number | null; volumeShare: number | null;
  deltaOiShare: number | null; depthImbalance: number | null; pressure: number | null; componentCount: number;
  regime: ScalperV2Regime; baselineKind: "PROVIDER_REPORTED_CHANGE" | "SESSION_FIRST_OBSERVATION" | "UNAVAILABLE";
};

const finite = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;
const clamp = (value: number) => Math.max(-1, Math.min(1, value));

export function scalperV2Regime(premiumReturnPct: number | null, changeOi: number | null): ScalperV2Regime {
  if (premiumReturnPct == null || changeOi == null) return "Unavailable";
  if (premiumReturnPct === 0 || changeOi === 0) return "Neutral";
  if (premiumReturnPct > 0 && changeOi > 0) return "Long buildup";
  if (premiumReturnPct < 0 && changeOi > 0) return "Short buildup";
  if (premiumReturnPct > 0 && changeOi < 0) return "Short covering";
  return "Long unwinding";
}

export function scalperV2PositioningModel(input: ScalperV2OptionPricePoint[]) {
  const prepared = input.flatMap((point) => {
    const timestamp = Date.parse(point.capturedAt), strike = finite(point.strike), side = String(point.side).toUpperCase();
    if (!Number.isFinite(timestamp) || strike == null || (side !== "CE" && side !== "PE")) return [];
    return [{ ...point, timestamp, strike, side: side as "CE" | "PE", price: finite(point.price), oi: finite(point.oi), reportedChangeOi: finite(point.reportedChangeOi), volume: finite(point.volume), bidQty: finite(point.bidQty), askQty: finite(point.askQty), totalBuyQty: finite(point.totalBuyQty), totalSellQty: finite(point.totalSellQty) }];
  }).sort((a, b) => a.timestamp - b.timestamp || a.strike - b.strike || a.side.localeCompare(b.side));
  const groups = new Map<string, typeof prepared>();
  prepared.forEach((point) => { const key = `${point.side}:${point.strike}`; groups.set(key, [...(groups.get(key) ?? []), point]); });
  const provisional: PositioningCell[] = [];
  for (const rows of groups.values()) {
    const openingPrice = rows.find((row) => row.price != null && row.price > 0)?.price ?? null;
    const openingOi = rows.find((row) => row.oi != null)?.oi ?? null;
    const openingVolume = rows.find((row) => row.volume != null)?.volume ?? null;
    for (const row of rows) {
      const changeOi = row.reportedChangeOi ?? (row.oi != null && openingOi != null ? row.oi - openingOi : null);
      const baselineKind = row.reportedChangeOi != null ? "PROVIDER_REPORTED_CHANGE" : row.oi != null && openingOi != null ? "SESSION_FIRST_OBSERVATION" : "UNAVAILABLE";
      const premiumReturnPct = row.price != null && openingPrice != null && openingPrice > 0 ? 100 * (row.price / openingPrice - 1) : null;
      const volume = row.volume != null && openingVolume != null ? Math.max(0, row.volume - openingVolume) : row.volume;
      const buy = row.totalBuyQty ?? row.bidQty, sell = row.totalSellQty ?? row.askQty;
      const depthImbalance = buy != null && sell != null && buy + sell > 0 ? (buy - sell) / (buy + sell) : null;
      provisional.push({ timestamp: row.timestamp, side: row.side, strike: row.strike, price: row.price, oi: row.oi, changeOi, premiumReturnPct, volume, volumeShare: null, deltaOiShare: null, depthImbalance, pressure: null, componentCount: 0, regime: scalperV2Regime(premiumReturnPct, changeOi), baselineKind });
    }
  }
  const timestamps = [...new Set(provisional.map((cell) => cell.timestamp))].sort((a, b) => a - b);
  const cells = provisional.map((cell) => {
    const cohort = provisional.filter((candidate) => candidate.timestamp === cell.timestamp && candidate.side === cell.side);
    const deltaTotal = cohort.reduce((sum, candidate) => sum + Math.abs(candidate.changeOi ?? 0), 0);
    const volumeTotal = cohort.reduce((sum, candidate) => sum + Math.max(0, candidate.volume ?? 0), 0);
    const deltaOiShare = cell.changeOi == null || deltaTotal <= 0 ? null : cell.changeOi / deltaTotal;
    const volumeShare = cell.volume == null || volumeTotal <= 0 ? null : Math.max(0, cell.volume) / volumeTotal;
    const components = [deltaOiShare, cell.premiumReturnPct == null ? null : clamp(cell.premiumReturnPct / 5), volumeShare == null || cell.premiumReturnPct == null ? null : Math.sign(cell.premiumReturnPct) * volumeShare, cell.depthImbalance].filter((value): value is number => value != null);
    return { ...cell, deltaOiShare, volumeShare, componentCount: components.length, pressure: components.length ? 100 * components.reduce((sum, value) => sum + value, 0) / components.length : null };
  });
  return { timestamps, strikes: [...new Set(cells.map((cell) => cell.strike))].sort((a, b) => a - b), cells };
}

const regimeShort: Record<ScalperV2Regime, string> = { "Long buildup": "LB", "Short buildup": "SB", "Short covering": "SC", "Long unwinding": "LU", Neutral: "N", Unavailable: "—" };
const sideColor = { CE: "#eab308", PE: "#2563eb" } as const;

export function scalperV2StrikeStructureOption(strikes: number[], calls: Array<{ oi: number | null; changeOi: number | null; premiumReturnPct: number | null }>, puts: Array<{ oi: number | null; changeOi: number | null; premiumReturnPct: number | null }>, underlyingValue: number | null, nearestStrike: number | null, unitLabel = ""): EChartsOption {
  const ranks = (values: typeof calls) => new Map(values.map((row, index) => ({ index, value: row.oi })).filter((row) => row.value != null).sort((a, b) => b.value! - a.value!).slice(0, 5).map((row, index) => [row.index, index + 1]));
  const ceRanks = ranks(calls), peRanks = ranks(puts);
  const changes = [...calls, ...puts].map((row) => row.changeOi);
  const [deltaMin, deltaMax] = scalperV2AdaptiveDeltaDomain(changes);
  const returns = [...calls, ...puts].flatMap((row) => row.premiumReturnPct == null ? [] : [row.premiumReturnPct]);
  const returnMax = Math.max(1, ...returns.map(Math.abs));
  const barData = (rows: typeof calls, side: "CE" | "PE", rank: Map<number, number>) => rows.map((row, index) => row.oi == null ? null : ({ value: row.oi, label: { show: true, position: "top" as const, distance: 2, color: side === "CE" ? "#785500" : "#1d4ed8", fontSize: 8, formatter: `${rank.get(index) ? `${side}${rank.get(index)} ` : ""}${regimeShort[scalperV2Regime(row.premiumReturnPct, row.changeOi)]}` } }));
  const nearestIndex = nearestStrike == null ? -1 : strikes.indexOf(nearestStrike);
  return {
    animation: false,
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, formatter: (raw: unknown) => { const items = (Array.isArray(raw) ? raw : [raw]) as Array<{ axisValue?: number; seriesName?: string; value?: number | { value?: number }; dataIndex?: number }>; const index = Number(items[0]?.dataIndex ?? -1), strike = strikes[index]; const lines = [`Strike ${strike?.toLocaleString("en-IN") ?? "—"}`]; for (const side of ["CE", "PE"] as const) { const row = side === "CE" ? calls[index] : puts[index]; lines.push(`${side}: OI ${row?.oi == null ? "—" : formatOiAxisValue(row.oi)} · ΔOI ${row?.changeOi == null ? "—" : `${row.changeOi > 0 ? "+" : ""}${formatOiAxisValue(row.changeOi)}`} · premium ${row?.premiumReturnPct == null ? "—" : `${row.premiumReturnPct > 0 ? "+" : ""}${row.premiumReturnPct.toFixed(2)}%`} · ${scalperV2Regime(row?.premiumReturnPct ?? null, row?.changeOi ?? null)}`); } return lines.join("<br/>"); } },
    legend: { data: ["CE OI", "PE OI", "CE ΔOI", "PE ΔOI", "CE premium %", "PE premium %"], top: 0, type: "scroll", textStyle: { fontSize: 8 }, itemWidth: 10, itemHeight: 7 },
    grid: { left: 2, right: 2, top: 35, bottom: 2, containLabel: true },
    xAxis: { type: "category", data: strikes, axisLabel: { hideOverlap: true, fontSize: 8 } },
    yAxis: [{ type: "value", min: 0, name: unitLabel ? `OI · ${unitLabel}` : "OI", axisLabel: { formatter: formatOiAxisValue, fontSize: 8 } }, { type: "value", min: deltaMin, max: deltaMax, name: unitLabel ? `ΔOI · ${unitLabel}` : "ΔOI", splitLine: { show: false }, axisLabel: { formatter: formatOiAxisValue, fontSize: 8 } }, { type: "value", min: -returnMax, max: returnMax, show: false }],
    series: [
      { name: "CE OI", type: "bar", data: barData(calls, "CE", ceRanks), barMaxWidth: 14, itemStyle: { color: sideColor.CE }, markLine: nearestIndex < 0 || underlyingValue == null ? undefined : { silent: true, symbol: "none", label: { formatter: `Spot ${underlyingValue.toFixed(1)}`, fontSize: 8 }, lineStyle: { color: "#0f766e", type: "dotted" }, data: [{ xAxis: nearestIndex }] } },
      { name: "PE OI", type: "bar", data: barData(puts, "PE", peRanks), barMaxWidth: 14, itemStyle: { color: sideColor.PE } },
      { name: "CE ΔOI", type: "line", yAxisIndex: 1, data: calls.map((row) => row.changeOi), symbolSize: 4, lineStyle: { color: "#8a6200", width: 1.5 } },
      { name: "PE ΔOI", type: "line", yAxisIndex: 1, data: puts.map((row) => row.changeOi), symbolSize: 4, lineStyle: { color: "#1d4ed8", width: 1.5 } },
      { name: "CE premium %", type: "scatter", yAxisIndex: 2, data: calls.map((row) => row.premiumReturnPct), symbol: "diamond", symbolSize: 5, itemStyle: { color: "#785500" } },
      { name: "PE premium %", type: "scatter", yAxisIndex: 2, data: puts.map((row) => row.premiumReturnPct), symbol: "diamond", symbolSize: 5, itemStyle: { color: "#1d4ed8" } },
    ],
  };
}

export function scalperV2PositioningHeatmapOption(model: ReturnType<typeof scalperV2PositioningModel>, clock: (value: number) => string): EChartsOption {
  const labels = ["CE", "PE"].flatMap((side) => model.strikes.map((strike) => `${side} ${strike.toLocaleString("en-IN")}`));
  const timeIndex = new Map(model.timestamps.map((value, index) => [value, index]));
  const labelIndex = new Map(labels.map((value, index) => [value, index]));
  const data = model.cells.flatMap((cell) => cell.pressure == null ? [] : [{ value: [timeIndex.get(cell.timestamp), labelIndex.get(`${cell.side} ${cell.strike.toLocaleString("en-IN")}`), cell.pressure], cell }]);
  return { animation: false, tooltip: { formatter: (raw: unknown) => { const cell = (raw as { data?: { cell?: PositioningCell } }).data?.cell; return !cell ? "Unavailable" : `${cell.side} ${cell.strike.toLocaleString("en-IN")} · ${clock(cell.timestamp)}<br/>Pressure ${cell.pressure == null ? "—" : cell.pressure.toFixed(1)} · ${cell.componentCount}/4 components<br/>ΔOI share ${cell.deltaOiShare == null ? "—" : `${(100 * cell.deltaOiShare).toFixed(1)}%`} · premium ${cell.premiumReturnPct == null ? "—" : `${cell.premiumReturnPct.toFixed(2)}%`}<br/>Volume share ${cell.volumeShare == null ? "—" : `${(100 * cell.volumeShare).toFixed(1)}%`} · depth ${cell.depthImbalance == null ? "—" : cell.depthImbalance.toFixed(2)}<br/>${cell.regime} · ${cell.baselineKind.replaceAll("_", " ")}`; } }, grid: { left: 2, right: 2, top: 8, bottom: 2, containLabel: true }, xAxis: { type: "category", data: model.timestamps, axisLabel: { formatter: (value: string) => clock(Number(value)), fontSize: 8, hideOverlap: true } }, yAxis: { type: "category", data: labels, axisLabel: { fontSize: 8, color: (value?: string | number) => String(value ?? "").startsWith("CE") ? "#785500" : "#1d4ed8" } }, visualMap: { show: false, min: -100, max: 100, inRange: { color: ["#b42336", "#f8fafc", "#15803d"] } }, series: [{ type: "heatmap", data, progressive: 5000, emphasis: { itemStyle: { borderColor: "#14243a", borderWidth: 1 } } }] };
}
