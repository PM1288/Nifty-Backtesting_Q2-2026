import { levelInObservedSession, type PriceBounds } from "./scalperV2Geometry";

export type ScalperV2ReferenceLevel = {
  id: string;
  label: string;
  shortLabel: string;
  value: number;
  sourceDate: string | null;
  source: "daily_bar" | "live_session" | "derived_window";
};

export type ScalperV2ReferenceLevelPayload = {
  asOf: string;
  sessionDate: string;
  levels: ScalperV2ReferenceLevel[];
  coverage: { completedDailyBars: number; observedSessions: number };
};

export function visibleScalperV2ReferenceLevels(levels: ScalperV2ReferenceLevel[], bounds: PriceBounds | null) {
  return levels.filter((level) => level.id !== "current" && levelInObservedSession(level.value, bounds));
}

export function scalperV2ReferenceGauge(levels: ScalperV2ReferenceLevel[]) {
  const valid = levels.filter((level) => Number.isFinite(level.value));
  if (!valid.length) return { low: null, high: null, points: [] as Array<ScalperV2ReferenceLevel & { position: number }> };
  const minimum = Math.min(...valid.map((level) => level.value));
  const maximum = Math.max(...valid.map((level) => level.value));
  const fallback = Math.max(Math.abs(minimum) * 0.002, 1);
  const span = maximum - minimum || fallback * 2;
  const low = minimum - span * 0.03, high = maximum + span * 0.03;
  return {
    low, high,
    points: valid.map((level) => ({ ...level, position: 100 * (level.value - low) / (high - low) })).sort((a, b) => a.value - b.value),
  };
}
