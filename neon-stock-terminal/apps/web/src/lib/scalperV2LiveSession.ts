export type ScalperV2LivePane = { bars: Array<Record<string, unknown>> };

const completedEnd = (pane: ScalperV2LivePane | undefined) => pane?.bars
  .filter((row) => row.closed === true && typeof row.end === "string")
  .at(-1)?.end ?? null;

export function scalperV2CompletedCandleSignature(panes: ScalperV2LivePane[]) {
  const ends = panes.map(completedEnd);
  return ends.some(Boolean) ? ends.map((value) => value ?? "missing").join("|") : "";
}

export function shouldRefitScalperV2Day(input: {
  historical: boolean;
  horizontalView: "day" | "last30" | "last60";
  previousSignature: string | null;
  nextSignature: string;
}) {
  return !input.historical
    && input.horizontalView === "day"
    && input.previousSignature != null
    && input.nextSignature !== input.previousSignature;
}

export function shouldFollowScalperV2TradingDay(input: {
  historical: boolean;
  selectedDay: string | null;
  previousLatestDay: string | null;
  latestDay: string;
}) {
  return !input.historical
    && Boolean(input.latestDay)
    && input.previousLatestDay != null
    && input.latestDay !== input.previousLatestDay
    && (input.selectedDay == null || input.selectedDay === input.previousLatestDay);
}

export function scalperV2RefreshClock(updatedAt: number) {
  if (!Number.isFinite(updatedAt) || updatedAt <= 0) return "Waiting for refresh";
  return `Refreshed ${new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(updatedAt))} IST`;
}

export function scalperV2SessionSlotCount(open: string, close: string, intervalMinutes: number) {
  const openMs = Date.parse(open), closeMs = Date.parse(close);
  if (!Number.isFinite(openMs) || !Number.isFinite(closeMs) || closeMs <= openMs || !Number.isFinite(intervalMinutes) || intervalMinutes <= 0) return null;
  return Math.ceil((closeMs - openMs) / (intervalMinutes * 60_000));
}

export function scalperV2StableFitSlotBudget(observedSlots: number, sessionSlots: number, intervalMinutes: number, previousSlots: number | null) {
  if (![observedSlots, sessionSlots, intervalMinutes].every(Number.isFinite) || observedSlots <= 0 || sessionSlots <= 0 || intervalMinutes <= 0) return null;
  const boundedObserved = Math.min(sessionSlots, Math.ceil(observedSlots));
  if (previousSlots != null && previousSlots >= boundedObserved && previousSlots <= sessionSlots) return previousSlots;
  const bufferMinutes = intervalMinutes <= 1 ? 15 : intervalMinutes <= 5 ? 30 : 60;
  const bufferSlots = Math.max(1, Math.ceil(bufferMinutes / intervalMinutes));
  return Math.min(sessionSlots, boundedObserved + bufferSlots);
}
