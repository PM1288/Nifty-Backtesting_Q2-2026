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

export function scalperV2ReferenceGauge(levels: ScalperV2ReferenceLevel[], strikes: number[] = []) {
  const valid = levels.filter((level) => Number.isFinite(level.value));
  const lowLevel = valid.find((level) => level.id === "thirty-day-low");
  const highLevel = valid.find((level) => level.id === "thirty-day-high");
  if (!lowLevel || !highLevel || highLevel.value <= lowLevel.value) return {
    low: null, high: null,
    points: [] as Array<ScalperV2ReferenceLevel & { position: number }>,
    strikes: [] as Array<{ value: number; position: number }>,
  };
  const low = lowLevel.value, high = highLevel.value;
  const position = (value: number) => 100 * (value - low) / (high - low);
  return {
    low, high,
    points: valid.filter((level) => level.value >= low && level.value <= high).map((level) => ({ ...level, position: position(level.value) })).sort((a, b) => a.value - b.value),
    strikes: [...new Set(strikes.filter((strike) => Number.isFinite(strike) && strike >= low && strike <= high))].sort((a, b) => a - b).map((value) => ({ value, position: position(value) })),
  };
}
