export const candleColors = {
  color: "#087a55",
  borderColor: "#087a55",
  color0: "#c93346",
  borderColor0: "#c93346",
};

// Scoped override: the shared chart skin normally hides value-axis lines.
export const evidenceValueAxis = {
  axisLine: { show: true, lineStyle: { color: "#64748b", width: 1 } },
  axisTick: { show: true },
  axisLabel: { show: true, color: "#3d506c", fontSize: 12, hideOverlap: true,
    formatter: (value: number) => new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 2 }).format(value) },
  nameTextStyle: { color: "#3d506c", fontSize: 11 },
};
export function chartInterval(value: string | null) {
  return [1, 5, 15, 60].includes(Number(value)) ? Number(value) : 5;
}
export function istDay(value: unknown) {
  const d = new Date(String(value));
  return Number.isFinite(d.getTime())
    ? new Date(d.getTime() + 19800000).toISOString().slice(0, 10)
    : "";
}
export function dayRows<T extends Record<string, unknown>>(
  rows: T[],
  day: string,
  key: string,
) {
  return rows.filter((r) => istDay(r[key]) === day);
}

export function financialVisibleBounds(
  rows: Array<Record<string, unknown>>,
): { min: number; max: number } | null {
  const values = rows.flatMap((row) => [row.low, row.high]).filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value),
  );
  if (!values.length) return null;
  return { min: Math.min(...values), max: Math.max(...values) };
}

export function roundNumberGuides(
  bounds: { min: number; max: number } | null,
  step = 50,
): number[] {
  if (!bounds || !Number.isFinite(step) || step <= 0) return [];
  const start = Math.ceil(bounds.min / step) * step;
  const end = Math.floor(bounds.max / step) * step;
  const result: number[] = [];
  for (let value = start; value <= end && result.length < 20; value += step) result.push(value);
  return result;
}

export function levelIsNearVisiblePrice(
  value: number,
  bounds: { min: number; max: number } | null,
  paddingRatio = 0.08,
) {
  if (!bounds || !Number.isFinite(value)) return false;
  const span = Math.max(bounds.max - bounds.min, Math.abs(bounds.max) * 0.002, 1);
  return value >= bounds.min - span * paddingRatio && value <= bounds.max + span * paddingRatio;
}
