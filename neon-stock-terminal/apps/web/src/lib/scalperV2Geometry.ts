export type PriceBounds = { low: number; high: number };

const finite = (value: unknown) => {
  const parsed = value == null || value === "" ? NaN : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/** Bounds from observed OHLC only. Indicators, levels and OI never enter this calculation. */
export function observedSessionBounds(rows: Array<Record<string, unknown>>): PriceBounds | null {
  let low = Number.POSITIVE_INFINITY;
  let high = Number.NEGATIVE_INFINITY;
  for (const row of rows) {
    if (row.closed !== true) continue;
    const rowLow = finite(row.low);
    const rowHigh = finite(row.high);
    if (rowLow == null || rowHigh == null || rowLow > rowHigh) continue;
    low = Math.min(low, rowLow);
    high = Math.max(high, rowHigh);
  }
  return Number.isFinite(low) && Number.isFinite(high) ? { low, high } : null;
}

export function paddedSessionBounds(bounds: PriceBounds | null, tickSize: number | null, fraction = 0.05): PriceBounds | null {
  if (!bounds) return null;
  const span = bounds.high - bounds.low;
  const tick = tickSize != null && Number.isFinite(tickSize) && tickSize > 0 ? tickSize : Math.max(Math.abs(bounds.high) * 0.0001, 0.01);
  const padding = span > 0 ? span * fraction : tick * 2;
  return { low: bounds.low - padding, high: bounds.high + padding };
}

export function levelInObservedSession(price: unknown, bounds: PriceBounds | null) {
  const value = finite(price);
  return value != null && bounds != null && value >= bounds.low && value <= bounds.high;
}

export function profileWidth(value: unknown, maximum: unknown, laneWidth: number) {
  const amount = finite(value);
  const max = finite(maximum);
  if (amount == null || max == null || amount < 0 || max <= 0 || laneWidth <= 0) return null;
  if (amount === 0) return 0;
  return Math.min(laneWidth, amount / max * laneWidth);
}

export type OiComparisonState = {
  state: "comparable" | "partial" | "baseline_unavailable" | "current_unavailable";
  comparable: number;
  total: number;
};

export function oiComparisonState(current: unknown[], baseline: unknown[]): OiComparisonState {
  const total = Math.max(current.length, baseline.length);
  const currentCount = current.filter((value) => finite(value) != null).length;
  const comparable = Array.from({ length: total }, (_, index) => (
    finite(current[index]) != null && finite(baseline[index]) != null
  )).filter(Boolean).length;
  if (currentCount === 0) return { state: "current_unavailable", comparable: 0, total };
  if (comparable === 0) return { state: "baseline_unavailable", comparable, total };
  return { state: comparable === total ? "comparable" : "partial", comparable, total };
}
