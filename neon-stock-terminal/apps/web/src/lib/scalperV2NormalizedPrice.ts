import type { EChartsOption } from "echarts";

export type ScalperV2OptionPricePoint = {
  capturedAt: string; strike: number | null; side: unknown; price: number | null;
  oi?: number | null; reportedChangeOi?: number | null; volume?: number | null;
  bidQty?: number | null; askQty?: number | null; totalBuyQty?: number | null; totalSellQty?: number | null;
};
export type ScalperV2PriceMode = "return" | "indexed" | "relative" | "range";
export type ScalperV2NormalizedPriceDatum = { value: [number, number | null]; rawPrice: number | null; returnPct: number | null };
export type ScalperV2NormalizedPriceSeries = {
  id: string; name: string; side: "CE" | "PE"; strike: number; selected: boolean; opacity: number;
  openingPrice: number; observedHigh: number; observedLow: number; data: ScalperV2NormalizedPriceDatum[];
};

const finite = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;

/** Legacy range normalisation. It remains opt-in because later extrema can rescale earlier values. */
export function scalperV2NormalizedPrice(value: number, opening: number, high: number, low: number) {
  if (value === opening) return 0;
  if (value > opening) return high > opening ? Math.min(100, 100 * (value - opening) / (high - opening)) : 0;
  return low < opening ? Math.max(-100, -100 * (opening - value) / (opening - low)) : 0;
}

export function scalperV2PriceValue(mode: ScalperV2PriceMode, value: number, opening: number, high: number, low: number, selectedSideReturn: number | null = null) {
  if (opening <= 0) return null;
  const returnPct = 100 * (value / opening - 1);
  if (mode === "return") return returnPct;
  if (mode === "indexed") return 100 * value / opening;
  if (mode === "relative") return selectedSideReturn == null ? null : returnPct - selectedSideReturn;
  return scalperV2NormalizedPrice(value, opening, high, low);
}

export function scalperV2NormalizedPriceSeries(input: ScalperV2OptionPricePoint[], selectedCeStrike: number | null, selectedPeStrike: number | null, mode: ScalperV2PriceMode = "return", relativeCeStrike = selectedCeStrike, relativePeStrike = selectedPeStrike) {
  const prepared = input.flatMap((point) => {
    const time = Date.parse(point.capturedAt), strike = finite(point.strike), price = finite(point.price), side = String(point.side).toUpperCase();
    return Number.isFinite(time) && strike != null && price != null && price > 0 && (side === "CE" || side === "PE") ? [{ time, strike, price, side: side as "CE" | "PE" }] : [];
  }).sort((a, b) => a.time - b.time || a.strike - b.strike || a.side.localeCompare(b.side));
  const timestamps = [...new Set(prepared.map((point) => point.time))];
  const strikesBySide = { CE: [...new Set(prepared.filter((p) => p.side === "CE").map((p) => p.strike))], PE: [...new Set(prepared.filter((p) => p.side === "PE").map((p) => p.strike))] };
  const selected = { CE: selectedCeStrike, PE: selectedPeStrike };
  const relativeReference = { CE: relativeCeStrike, PE: relativePeStrike };
  const maximumDistance = (side: "CE" | "PE") => Math.max(1, ...strikesBySide[side].map((strike) => selected[side] == null ? 0 : Math.abs(strike - selected[side]!)));
  const selectedReturns = new Map<string, number>();
  for (const side of ["CE", "PE"] as const) {
    const rows = prepared.filter((point) => point.side === side && point.strike === relativeReference[side]);
    const opening = rows[0]?.price;
    if (opening) rows.forEach((row) => selectedReturns.set(`${side}:${row.time}`, 100 * (row.price / opening - 1)));
  }
  const series: ScalperV2NormalizedPriceSeries[] = [];
  for (const side of ["CE", "PE"] as const) for (const strike of strikesBySide[side].sort((a, b) => a - b)) {
    const rows = prepared.filter((point) => point.side === side && point.strike === strike), byTime = new Map(rows.map((point) => [point.time, point.price]));
    const prices = rows.map((point) => point.price), openingPrice = prices[0], observedHigh = Math.max(...prices), observedLow = Math.min(...prices), isSelected = selected[side] === strike;
    const distanceFraction = selected[side] == null ? 1 : Math.abs(strike - selected[side]!) / maximumDistance(side);
    series.push({ id: `${side}:${strike}`, name: `${side} ${strike.toLocaleString("en-IN")}${isSelected ? " · selected" : ""}`, side, strike, selected: isSelected,
      opacity: isSelected ? 1 : Math.max(0.12, 0.68 * (1 - distanceFraction)), openingPrice, observedHigh, observedLow,
      data: timestamps.map((time) => { const rawPrice = byTime.get(time) ?? null, returnPct = rawPrice == null ? null : 100 * (rawPrice / openingPrice - 1); return { value: [time, rawPrice == null ? null : scalperV2PriceValue(mode, rawPrice, openingPrice, observedHigh, observedLow, selectedReturns.get(`${side}:${time}`) ?? null)], rawPrice, returnPct }; }),
    });
  }
  return { timestamps, series, mode };
}

export function visibleScalperV2PriceSeries(series: ScalperV2NormalizedPriceSeries[], selectedCeStrike: number | null, selectedPeStrike: number | null, leaderIds: string[], showAll: boolean) {
  if (showAll) return series;
  const wanted = new Set(leaderIds);
  for (const [side, strike] of [["CE", selectedCeStrike], ["PE", selectedPeStrike]] as const) {
    if (strike == null) continue;
    wanted.add(`${side}:${strike}`);
    series.filter((row) => row.side === side).sort((a, b) => Math.abs(a.strike - strike) - Math.abs(b.strike - strike)).slice(0, 5).forEach((row) => wanted.add(row.id));
  }
  return series.filter((row) => wanted.has(row.id));
}

export function scalperV2CompactRangePriceOption(
  model: ReturnType<typeof scalperV2NormalizedPriceSeries>,
  timeLabel: (value: number) => string,
  domain?: { from: number; to: number },
): EChartsOption {
  return {
    animation: false,
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "line", snap: true },
      formatter: (input: unknown) => {
        const rows = (Array.isArray(input) ? input : [input]) as Array<{ axisValue?: unknown; seriesName?: string; data?: ScalperV2NormalizedPriceDatum }>;
        const time = Number(rows[0]?.data?.value?.[0] ?? rows[0]?.axisValue);
        const heading = Number.isFinite(time) ? timeLabel(time) : "Time unavailable";
        return [heading, ...rows.flatMap((row) => {
          const normalized = row.data?.value?.[1];
          if (normalized == null) return [];
          const raw = row.data?.rawPrice;
          return [`${row.seriesName ?? "Series"}: ${Math.round(normalized)} · raw ${raw == null ? "—" : `₹${Math.round(raw).toLocaleString("en-IN")}`}`];
        })].join("<br/>");
      },
    },
    legend: { show: false },
    grid: { left: 25, right: 3, top: 3, bottom: 20, containLabel: false },
    xAxis: {
      type: "time",
      min: domain?.from,
      max: domain?.to,
      axisLabel: { formatter: timeLabel, fontSize: 7, hideOverlap: true, margin: 4 },
      axisTick: { show: false },
      splitLine: { show: false },
    },
    yAxis: {
      type: "value",
      min: -100,
      max: 100,
      interval: 100,
      axisLabel: { formatter: (value: number) => Math.round(value).toString(), fontSize: 7, margin: 2 },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: "rgba(100,116,139,.12)" } },
    },
    series: model.series.map((series, index) => {
      const opacity = series.selected ? 0.95 : Math.max(0.18, Math.min(0.7, series.opacity * 0.7));
      return {
        id: `compact-range:${series.id}`,
        name: series.name,
        type: "line",
        data: series.data,
        connectNulls: false,
        showSymbol: false,
        symbol: "none",
        lineStyle: {
          color: series.side === "CE" ? "#eab308" : "#2563eb",
          width: series.selected ? 1.6 : 0.8,
          type: "dotted",
          opacity,
        },
        itemStyle: { color: series.side === "CE" ? "#eab308" : "#2563eb", opacity },
        emphasis: { focus: "series", lineStyle: { width: 2, opacity: 1 } },
        z: series.selected ? 4 : 1,
        markLine: index === 0 ? {
          silent: true,
          symbol: "none",
          label: { show: false },
          lineStyle: { color: "#111827", type: "dotted", width: 1 },
          data: [{ yAxis: 0 }],
        } : undefined,
      };
    }),
  };
}
