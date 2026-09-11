export type ParticipantHeatmapExtent = {
  maximumPositive: number;
  maximumNegativeMagnitude: number;
};

export type ParticipantHeatmapReading = {
  value: number | null;
  tone: "positive" | "negative" | "neutral" | "missing";
  strength: number;
};

const finiteNumber = (value: unknown): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const participantHeatmapExtent = (
  values: readonly unknown[],
): ParticipantHeatmapExtent => {
  let maximumPositive = 0;
  let minimumNegative = 0;
  for (const candidate of values) {
    const value = finiteNumber(candidate);
    if (value == null) continue;
    maximumPositive = Math.max(maximumPositive, value);
    minimumNegative = Math.min(minimumNegative, value);
  }
  return {
    maximumPositive,
    maximumNegativeMagnitude: Math.abs(minimumNegative),
  };
};

export const participantHeatmapReading = (
  candidate: unknown,
  extent: ParticipantHeatmapExtent,
): ParticipantHeatmapReading => {
  const value = finiteNumber(candidate);
  if (value == null) return { value: null, tone: "missing", strength: 0 };
  if (value === 0) return { value, tone: "neutral", strength: 0 };

  const denominator = value > 0
    ? extent.maximumPositive
    : extent.maximumNegativeMagnitude;
  const strength = denominator > 0
    ? Math.min(1, Math.abs(value) / denominator)
    : 0;
  return {
    value,
    tone: value > 0 ? "positive" : "negative",
    strength,
  };
};
