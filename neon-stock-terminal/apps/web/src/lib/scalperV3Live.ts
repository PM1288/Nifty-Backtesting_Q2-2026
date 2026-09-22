export type ScalperV3FeedState = "live" | "delayed" | "stale" | "closed";
export type ScalperV3ComparisonReference = "previous-close" | "session-open" | "15m" | "5m" | "pinned";

export function scalperV3FeedState(ageMs: number | null, intervalMinutes: number, marketOpen: boolean): ScalperV3FeedState {
  if (!marketOpen) return "closed";
  if (ageMs == null || !Number.isFinite(ageMs) || ageMs < 0) return "stale";
  const intervalMs = Math.max(1, intervalMinutes) * 60_000;
  if (ageMs <= intervalMs + 45_000) return "live";
  if (ageMs <= intervalMs * 2.5 + 45_000) return "delayed";
  return "stale";
}

export function scalperV3AgeLabel(ageMs: number | null) {
  if (ageMs == null || !Number.isFinite(ageMs) || ageMs < 0) return "—";
  if (ageMs < 1_000) return `${Math.max(0, ageMs / 1_000).toFixed(1)}s`;
  if (ageMs < 60_000) return `${Math.floor(ageMs / 1_000)}s`;
  const minutes = Math.floor(ageMs / 60_000);
  const seconds = Math.floor(ageMs % 60_000 / 1_000);
  return `${minutes}m ${seconds}s`;
}

export function scalperV3RowAtOrBefore<T>(rows: T[], target: number | null, timestamp: (row: T) => number | null): T | null {
  if (target == null || !Number.isFinite(target)) return null;
  let selected: T | null = null;
  let selectedTime = Number.NEGATIVE_INFINITY;
  for (const row of rows) {
    const time = timestamp(row);
    if (time != null && Number.isFinite(time) && time <= target && time >= selectedTime) {
      selected = row;
      selectedTime = time;
    }
  }
  return selected;
}

export function scalperV3ReferenceTime(input: {
  reference: ScalperV3ComparisonReference;
  latestTime: number | null;
  sessionOpenTime: number | null;
  previousCloseTime: number | null;
  pinnedTime: number | null;
}) {
  const { reference, latestTime, sessionOpenTime, previousCloseTime, pinnedTime } = input;
  if (reference === "pinned") return pinnedTime;
  if (reference === "session-open") return sessionOpenTime;
  if (reference === "previous-close") return previousCloseTime;
  if (latestTime == null) return null;
  return latestTime - (reference === "15m" ? 15 : 5) * 60;
}

export function scalperV3Delta(current: unknown, reference: unknown) {
  if (current == null || current === "" || reference == null || reference === "") return null;
  const currentNumber = typeof current === "number" ? current : Number(current);
  const referenceNumber = typeof reference === "number" ? reference : Number(reference);
  return Number.isFinite(currentNumber) && Number.isFinite(referenceNumber) ? currentNumber - referenceNumber : null;
}

export function scalperV3Velocity(current: number | null, previous: number | null, currentTime: number | null, previousTime: number | null) {
  if (current == null || previous == null || currentTime == null || previousTime == null || currentTime <= previousTime) return null;
  const minutes = (currentTime - previousTime) / 60_000;
  return minutes > 0 ? (current - previous) / minutes * 5 : null;
}

export function scalperV3AccelerationArrow(velocity: number | null, priorVelocity: number | null) {
  if (velocity == null || Math.abs(velocity) < 1e-9) return "—";
  const accelerating = priorVelocity != null && Math.sign(priorVelocity) === Math.sign(velocity) && Math.abs(velocity) > Math.abs(priorVelocity) * 1.2;
  return velocity > 0 ? accelerating ? "↑↑" : "↑" : accelerating ? "↓↓" : "↓";
}
