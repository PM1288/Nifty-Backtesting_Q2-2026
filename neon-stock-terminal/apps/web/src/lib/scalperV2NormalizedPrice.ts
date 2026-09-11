export type ScalperV2OptionPricePoint = {
  capturedAt: string;
  strike: number | null;
  side: unknown;
  price: number | null;
};

export type ScalperV2NormalizedPriceDatum = {
  value: [number, number | null];
  rawPrice: number | null;
};

export type ScalperV2NormalizedPriceSeries = {
  id: string;
  name: string;
  side: "CE" | "PE";
  strike: number;
  selected: boolean;
  opacity: number;
  openingPrice: number;
  observedHigh: number;
  observedLow: number;
  data: ScalperV2NormalizedPriceDatum[];
};

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Piecewise normalisation keeps open=0, observed high=+100 and low=-100. */
export function scalperV2NormalizedPrice(value: number, opening: number, high: number, low: number) {
  if (value === opening) return 0;
  if (value > opening) return high > opening ? Math.min(100, 100 * (value - opening) / (high - opening)) : 0;
  return low < opening ? Math.max(-100, -100 * (opening - value) / (opening - low)) : 0;
}

export function scalperV2NormalizedPriceSeries(
  input: ScalperV2OptionPricePoint[],
  selectedCeStrike: number | null,
  selectedPeStrike: number | null,
) {
  const prepared = input.flatMap((point) => {
    const time = Date.parse(point.capturedAt);
    const strike = finite(point.strike);
    const price = finite(point.price);
    const side = String(point.side).toUpperCase();
    return Number.isFinite(time) && strike != null && price != null && (side === "CE" || side === "PE")
      ? [{ time, strike, price, side: side as "CE" | "PE" }]
      : [];
  }).sort((a, b) => a.time - b.time || a.strike - b.strike || a.side.localeCompare(b.side));
  const timestamps = [...new Set(prepared.map((point) => point.time))];
  const strikesBySide = {
    CE: [...new Set(prepared.filter((point) => point.side === "CE").map((point) => point.strike))],
    PE: [...new Set(prepared.filter((point) => point.side === "PE").map((point) => point.strike))],
  };
  const selected = { CE: selectedCeStrike, PE: selectedPeStrike };
  const maximumDistance = (side: "CE" | "PE") => Math.max(1, ...strikesBySide[side].map((strike) => selected[side] == null ? 0 : Math.abs(strike - selected[side]!)));
  const series: ScalperV2NormalizedPriceSeries[] = [];

  for (const side of ["CE", "PE"] as const) {
    for (const strike of strikesBySide[side].sort((a, b) => a - b)) {
      const rows = prepared.filter((point) => point.side === side && point.strike === strike);
      const byTime = new Map(rows.map((point) => [point.time, point.price]));
      const prices = rows.map((point) => point.price);
      const openingPrice = prices[0];
      const observedHigh = Math.max(...prices);
      const observedLow = Math.min(...prices);
      const isSelected = selected[side] === strike;
      const distanceFraction = selected[side] == null ? 1 : Math.abs(strike - selected[side]!) / maximumDistance(side);
      series.push({
        id: `${side}:${strike}`,
        name: `${side} ${strike.toLocaleString("en-IN")}${isSelected ? " · selected" : ""}`,
        side,
        strike,
        selected: isSelected,
        opacity: isSelected ? 1 : Math.max(0.18, 0.82 * (1 - distanceFraction)),
        openingPrice,
        observedHigh,
        observedLow,
        data: timestamps.map((time) => {
          const rawPrice = byTime.get(time) ?? null;
          return {
            value: [time, rawPrice == null ? null : scalperV2NormalizedPrice(rawPrice, openingPrice, observedHigh, observedLow)],
            rawPrice,
          };
        }),
      });
    }
  }
  return { timestamps, series };
}
