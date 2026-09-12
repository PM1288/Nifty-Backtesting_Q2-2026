export type ScalperV2ProfileSide = "CE" | "PE";
export type ScalperV2ProfileMode = "current" | "change" | "structure";

export type ScalperV2ProfileRow = {
  side: ScalperV2ProfileSide;
  strike: number;
  currentOi: number | null;
  baselineOi: number | null;
  changeOi: number | null;
  baselineKind: string;
  baselineAt: string | null;
  currentAt: string | null;
  source: string;
  unit: string;
  state: "comparable" | "missing_current" | "missing_baseline" | "incompatible_baseline";
};

export type ScalperV2ProfileBar = ScalperV2ProfileRow & {
  metric: "current" | "change";
  y: number;
  centerY: number;
  width: number | null;
  startX: number | null;
  endX: number | null;
};

export type ScalperV2ProfileLayout = {
  anchorX: number;
  laneWidth: number;
  maximum: number;
  bars: ScalperV2ProfileBar[];
  visibleStrikes: number;
  totalStrikes: number;
};

export type ScalperV2ProfileBounds = { low: number; high: number };

const finite = (value: unknown) => {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const text = (value: unknown) => value == null ? "" : String(value);
const rowSide = (row: Record<string, unknown>) => text(row.option_type ?? row.side).toUpperCase();
const layers = (row: Record<string, unknown>) => row.oi_layers && typeof row.oi_layers === "object"
  ? row.oi_layers as Record<string, unknown>
  : null;

const BASELINE_PRIORITY = ["PREVIOUS_SESSION_FINAL", "FIRST_SESSION_OBSERVATION", "PREVIOUS_ARCHIVED_SNAPSHOT"] as const;

/**
 * Builds one truthful comparison cohort. Rows from another baseline definition stay
 * visible as unavailable instead of being mixed into the same visual denominator.
 */
export function normalizeScalperV2ProfileRows(
  rows: Array<Record<string, unknown>>,
  exactRows: Array<Record<string, unknown>> = [],
): { rows: ScalperV2ProfileRow[]; baselineKind: string | null; duplicates: number } {
  const exactByIdentity = new Map(exactRows.map((row) => [`${rowSide(row)}:${finite(row.strike)}`, row]));
  const availableKinds = new Set(rows.flatMap((row) => {
    const exact = exactByIdentity.get(`${rowSide(row)}:${finite(row.strike)}`);
    const kind = text(row.baseline_kind ?? exact?.baseline_kind);
    return kind && kind !== "BASELINE_UNAVAILABLE" ? [kind] : [];
  }));
  const baselineKind = BASELINE_PRIORITY.find((kind) => availableKinds.has(kind))
    ?? [...availableKinds].sort()[0]
    ?? null;
  const seen = new Set<string>();
  let duplicates = 0;
  const normalized: ScalperV2ProfileRow[] = [];
  for (const row of rows) {
    const side = rowSide(row), strike = finite(row.strike);
    if ((side !== "CE" && side !== "PE") || strike == null || strike <= 0) continue;
    const identity = `${side}:${strike}`;
    if (seen.has(identity)) { duplicates += 1; continue; }
    seen.add(identity);
    const exact = exactByIdentity.get(identity);
    const currentOi = finite(row.open_interest ?? row.currentOi ?? exact?.open_interest ?? exact?.currentOi);
    const baselineOi = finite(row.baseline_open_interest ?? exact?.baseline_open_interest);
    const kind = text(row.baseline_kind ?? exact?.baseline_kind) || "BASELINE_UNAVAILABLE";
    const rawChange = finite(layers(row)?.change ?? layers(exact ?? {})?.change ?? row.changeOi ?? exact?.changeOi);
    const compatible = baselineKind != null && kind === baselineKind;
    const changeOi = compatible && currentOi != null && baselineOi != null
      ? currentOi - baselineOi
      : compatible ? rawChange : null;
    const state = currentOi == null || currentOi < 0
      ? "missing_current"
      : !compatible && kind !== "BASELINE_UNAVAILABLE"
        ? "incompatible_baseline"
        : changeOi == null
          ? "missing_baseline"
          : "comparable";
    normalized.push({
      side, strike,
      currentOi: currentOi != null && currentOi >= 0 ? currentOi : null,
      baselineOi: baselineOi != null && baselineOi >= 0 ? baselineOi : null,
      changeOi: state === "comparable" ? changeOi : null,
      baselineKind: kind,
      baselineAt: text(row.baseline_collected_at ?? exact?.baseline_collected_at) || null,
      currentAt: text(row.collected_at ?? row.ts ?? exact?.collected_at ?? exact?.ts) || null,
      source: text(row.source ?? exact?.source) || "unavailable",
      unit: text(row.oi_unit ?? exact?.oi_unit) || "provider-native",
      state,
    });
  }
  return { rows: normalized, baselineKind, duplicates };
}

/** Price-native profile geometry. The shared denominator includes off-screen rows. */
export function layoutScalperV2Profile(
  rows: ScalperV2ProfileRow[],
  mode: ScalperV2ProfileMode,
  paneWidth: number,
  paneHeight: number,
  priceToCoordinate: (strike: number) => number | null,
  maxWidth = 180,
  maxFraction = 0.22,
): ScalperV2ProfileLayout {
  const laneWidth = Math.max(0, Math.min(maxWidth, paneWidth * maxFraction, paneWidth - 16));
  // Current OI grows left from the plot edge. Signed delta OI owns a true
  // centre origin so positive and negative values cannot collapse together.
  const anchorX = Math.max(0, paneWidth - 8 - (mode === "change" || mode === "structure" ? laneWidth / 2 : 0));
  const values = rows.map((row) => mode === "change" ? row.changeOi : row.currentOi);
  const maximum = Math.max(0, ...values.map((value) => Math.abs(value ?? 0)));
  const currentMaximum = Math.max(0, ...rows.map((row) => Math.abs(row.currentOi ?? 0)));
  const changeMaximum = Math.max(0, ...rows.map((row) => Math.abs(row.changeOi ?? 0)));
  const strikes = [...new Set(rows.map((row) => row.strike))];
  const visible = new Set<number>();
  const bars = rows.flatMap((row): ScalperV2ProfileBar[] => {
    const y = priceToCoordinate(row.strike);
    if (y == null || !Number.isFinite(y) || y < 0 || y > paneHeight) return [];
    visible.add(row.strike);
    if (mode === "structure") {
      const center = paneWidth - 8 - laneWidth / 2, oiLane = laneWidth * .34, deltaLane = laneWidth * .14;
      const currentWidth = row.currentOi == null ? null : currentMaximum > 0 ? row.currentOi / currentMaximum * oiLane : 0;
      const deltaWidth = row.changeOi == null ? null : changeMaximum > 0 ? Math.abs(row.changeOi) / changeMaximum * deltaLane : 0;
      const currentEnd = row.side === "CE" ? center - deltaLane : center + deltaLane + (currentWidth ?? 0);
      const currentStart = row.side === "CE" ? currentEnd - (currentWidth ?? 0) : center + deltaLane;
      const deltaStart = row.side === "CE" ? center - (deltaWidth ?? 0) : center;
      return [
        { ...row, metric: "current", y, centerY: y + (row.side === "CE" ? -5 : 5), width: currentWidth, startX: currentWidth == null ? null : currentStart, endX: currentWidth == null ? null : currentEnd },
        { ...row, metric: "change", y, centerY: y + (row.side === "CE" ? -1.5 : 1.5), width: deltaWidth, startX: deltaWidth == null ? null : deltaStart, endX: deltaWidth == null ? null : deltaStart + deltaWidth },
      ];
    }
    const value = mode === "change" ? row.changeOi : row.currentOi;
    const availableWidth = mode === "change" ? laneWidth / 2 : laneWidth;
    const width = value == null ? null : maximum > 0 ? Math.abs(value) / maximum * availableWidth : 0;
    const endX = value == null || width == null ? null : mode === "change"
      ? anchorX + Math.sign(value) * width
      : anchorX - width;
    return [{
      ...row, metric: mode, y, centerY: y + (row.side === "CE" ? -3 : 3), width,
      startX: endX == null ? null : Math.min(anchorX, endX),
      endX: endX == null ? null : Math.max(anchorX, endX),
    }];
  });
  return { anchorX, laneWidth, maximum, bars, visibleStrikes: visible.size, totalStrikes: strikes.length };
}

export function profileBaselineLabel(kind: string | null) {
  if (kind === "PREVIOUS_SESSION_FINAL") return "Previous-session final";
  if (kind === "FIRST_SESSION_OBSERVATION") return "Session initial observation";
  if (kind === "PREVIOUS_ARCHIVED_SNAPSHOT") return "Previous archived snapshot";
  return "Baseline unavailable";
}

/**
 * Explicit all-strikes fit. This is never applied implicitly because distant
 * option strikes would otherwise compress the underlying candles.
 */
export function allProfileStrikeBounds(
  sessionBounds: ScalperV2ProfileBounds | null,
  rows: ScalperV2ProfileRow[],
  paddingFraction = 0.03,
): ScalperV2ProfileBounds | null {
  const values = rows.map((row) => row.strike).filter((strike) => Number.isFinite(strike) && strike > 0);
  if (!sessionBounds && values.length === 0) return null;
  const low = Math.min(sessionBounds?.low ?? Number.POSITIVE_INFINITY, ...values);
  const high = Math.max(sessionBounds?.high ?? Number.NEGATIVE_INFINITY, ...values);
  if (!Number.isFinite(low) || !Number.isFinite(high)) return null;
  const span = high - low;
  const padding = span > 0 ? span * Math.max(0, paddingFraction) : Math.max(Math.abs(high) * 0.0001, 0.01) * 2;
  return { low: low - padding, high: high + padding };
}
