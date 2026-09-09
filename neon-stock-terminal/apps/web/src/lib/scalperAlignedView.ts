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

export type ScalperInspectorSection = "snapshot" | "chain" | "rules" | "measure" | "levels" | "health";
export type ScalperWorkspacePreset = "price" | "full" | "custom";
export type ScalperLadderMetric = "premium" | "oi" | "doi";

export type ScalperPresentationPreferences = {
  version: 4;
  inspectorWidth: number;
  inspectorSection: ScalperInspectorSection;
  paneVisibility: AlignedPaneVisibility;
  workspacePreset: ScalperWorkspacePreset;
  ladderMetric: ScalperLadderMetric;
  compactOi: boolean;
  priceRangeMode: "session" | "visible";
  paneHeights: Partial<Record<AlignedPaneId, number>>;
};

export const SCALPER_PRESENTATION_STORAGE_KEY = "n50.scalper.aligned.presentation.v4";

export const DEFAULT_SCALPER_PRESENTATION: ScalperPresentationPreferences = {
  version: 4,
  inspectorWidth: 360,
  inspectorSection: "snapshot",
  paneVisibility: { rsi: false, macd: false, pcr: false },
  workspacePreset: "price",
  ladderMetric: "premium",
  compactOi: true,
  priceRangeMode: "session",
  paneHeights: {},
};

const sections = new Set<ScalperInspectorSection>(["snapshot", "chain", "rules", "measure", "levels", "health"]);
const presets = new Set<ScalperWorkspacePreset>(["price", "full", "custom"]);
const ladderMetrics = new Set<ScalperLadderMetric>(["premium", "oi", "doi"]);

/** Parse presentation-only browser state. Market data and measurement anchors never enter storage. */
export function parseScalperPresentationPreferences(value: unknown): ScalperPresentationPreferences {
  if (!value || typeof value !== "object") return DEFAULT_SCALPER_PRESENTATION;
  const row = value as Record<string, unknown>;
  const panes = row.paneVisibility && typeof row.paneVisibility === "object"
    ? row.paneVisibility as Record<string, unknown>
    : {};
  const inspectorWidth = Number(row.inspectorWidth);
  const inspectorSection = sections.has(row.inspectorSection as ScalperInspectorSection)
    ? row.inspectorSection as ScalperInspectorSection
    : DEFAULT_SCALPER_PRESENTATION.inspectorSection;
  const workspacePreset = presets.has(row.workspacePreset as ScalperWorkspacePreset)
    ? row.workspacePreset as ScalperWorkspacePreset
    : DEFAULT_SCALPER_PRESENTATION.workspacePreset;
  const ladderMetric = ladderMetrics.has(row.ladderMetric as ScalperLadderMetric)
    ? row.ladderMetric as ScalperLadderMetric
    : DEFAULT_SCALPER_PRESENTATION.ladderMetric;
  const paneHeights = row.paneHeights && typeof row.paneHeights === "object"
    ? Object.fromEntries(Object.entries(row.paneHeights as Record<string, unknown>).flatMap(([key, value]) => {
      const height = Number(value);
      return key in ALIGNED_PANE_MINIMUMS && Number.isFinite(height) && height >= 80 && height <= 900 ? [[key, Math.round(height)]] : [];
    })) as Partial<Record<AlignedPaneId, number>>
    : {};
  return {
    version: 4,
    inspectorWidth: Number.isFinite(inspectorWidth) ? Math.min(460, Math.max(320, inspectorWidth)) : 360,
    inspectorSection,
    paneVisibility: {
      rsi: panes.rsi === true,
      macd: panes.macd === true,
      pcr: panes.pcr === true,
    },
    workspacePreset,
    ladderMetric,
    compactOi: row.compactOi !== false,
    priceRangeMode: row.priceRangeMode === "visible" ? "visible" : "session",
    paneHeights,
  };
}

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

export function aggregateOiFlows(changes: Array<number | null>) {
  return changes.reduce((result, value) => {
    if (value == null || !Number.isFinite(value)) return result;
    return {
      net: result.net + value,
      additions: result.additions + Math.max(value, 0),
      removals: result.removals + Math.max(-value, 0),
    };
  }, { net: 0, additions: 0, removals: 0 });
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
