export type AlignedPaneId =
  | "underlying"
  | "call"
  | "put"
  | "oi"
  | "doi"
  | "rsi"
  | "macd"
  | "pcr";

export type AlignedPaneVisibility = {
  rsi: boolean;
  macd: boolean;
  pcr: boolean;
};

export const ALIGNED_PANE_MINIMUMS: Record<AlignedPaneId, number> = {
  underlying: 320,
  call: 210,
  put: 210,
  oi: 130,
  doi: 120,
  rsi: 130,
  macd: 140,
  pcr: 120,
};

export function alignedPaneManifest(visibility: AlignedPaneVisibility) {
  return (["underlying", "call", "put", "oi", "doi"] as AlignedPaneId[])
    .concat(visibility.rsi ? ["rsi"] : [])
    .concat(visibility.macd ? ["macd"] : [])
    .concat(visibility.pcr ? ["pcr"] : []);
}

export function alignedChartContentHeight(visibility: AlignedPaneVisibility) {
  const panes = alignedPaneManifest(visibility);
  return panes.reduce((sum, pane) => sum + ALIGNED_PANE_MINIMUMS[pane], 0) + Math.max(0, panes.length - 1) * 2 + 28;
}

export function paddedRenderBounds(
  sessionBounds: { min: number; max: number } | null,
  tickSize = 0.05,
  allowance = 0.04,
) {
  if (!sessionBounds || !Number.isFinite(sessionBounds.min) || !Number.isFinite(sessionBounds.max)) return null;
  const span = Math.max(sessionBounds.max - sessionBounds.min, Math.abs(tickSize), Number.EPSILON);
  const pad = Math.max(span * allowance, Math.abs(tickSize) * 2);
  return { min: sessionBounds.min - pad, max: sessionBounds.max + pad };
}

export function inspectionBar<T extends Record<string, unknown>>(
  bars: T[],
  time: string | null,
) {
  const eligible = bars.filter((bar) => bar.closed === true);
  if (time) return eligible.find((bar) => String(bar.end) === time) ?? null;
  return eligible.at(-1) ?? null;
}

export function oiCompositeSegments(current: number | null, change: number | null) {
  if (current == null || change == null || !Number.isFinite(current) || !Number.isFinite(change)) {
    return { baseline: null, retained: null, addition: null, reduction: null };
  }
  const baseline = current - change;
  return {
    baseline,
    retained: Math.min(Math.max(0, baseline), Math.max(0, current)),
    addition: Math.max(current - baseline, 0),
    reduction: Math.max(baseline - current, 0),
  };
}

export function formatScalperNumber(value: unknown, digits = 2) {
  if (value == null || value === "") return "—";
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "—";
  const normalized = Object.is(parsed, -0) ? 0 : parsed;
  return normalized.toLocaleString("en-IN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function formatSignedScalperNumber(value: unknown, digits = 2) {
  if (value == null || value === "") return "—";
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "—";
  const normalized = Object.is(parsed, -0) || Math.abs(parsed) < 0.5 * 10 ** -digits ? 0 : parsed;
  return `${normalized > 0 ? "+" : ""}${formatScalperNumber(normalized, digits)}`;
}
