export type TransportState = "CONNECTED" | "RECONNECTING" | "DISCONNECTED";
export type FreshnessState = "CURRENT" | "DELAYED" | "STALE" | "UNKNOWN";
export type ReadinessState = "READY" | "DEGRADED" | "INCOMPLETE" | "NO_DATA" | "RECOVERING" | "FAILED";

export interface ModuleQualityState {
  moduleId: string;
  transport: TransportState;
  freshness: FreshnessState;
  readiness: ReadinessState;
  eventTime?: string;
  receiveTime?: string;
  dataThrough?: string;
  ageMs?: number;
  source?: string;
  sequence?: number;
  gapDetected?: boolean;
  message?: string;
}

export type QualityTone = "positive" | "warning" | "negative" | "neutral" | "missing";

export function qualityTone(state: ModuleQualityState): QualityTone {
  if (state.readiness === "FAILED" || state.transport === "DISCONNECTED") return "negative";
  if (state.readiness === "NO_DATA" || state.freshness === "UNKNOWN") return "missing";
  if (
    state.readiness === "DEGRADED" ||
    state.readiness === "INCOMPLETE" ||
    state.readiness === "RECOVERING" ||
    state.transport === "RECONNECTING" ||
    state.freshness === "DELAYED" ||
    state.freshness === "STALE" ||
    state.gapDetected
  ) return "warning";
  if (state.transport === "CONNECTED" && state.freshness === "CURRENT" && state.readiness === "READY") return "positive";
  return "neutral";
}

export function qualitySummary(state: ModuleQualityState): string {
  const transport = state.transport === "CONNECTED" ? "Transport connected" : state.transport === "RECONNECTING" ? "Transport reconnecting" : "Transport disconnected";
  const freshness = state.freshness === "CURRENT"
    ? state.ageMs == null ? "Data current" : `Data ${formatAge(state.ageMs)} old`
    : state.freshness === "DELAYED" ? "Data delayed"
      : state.freshness === "STALE" ? "Data stale"
        : "Freshness unknown";
  const readiness = state.readiness.toLowerCase().replaceAll("_", " ");
  return `${transport} · ${freshness} · ${readiness}`;
}

export function formatAge(ageMs: number): string {
  const safe = Math.max(0, ageMs);
  if (safe < 60_000) return `${Math.round(safe / 1_000)}s`;
  if (safe < 3_600_000) return `${Math.round(safe / 60_000)}m`;
  if (safe < 86_400_000) return `${Math.round(safe / 3_600_000)}h`;
  return `${Math.round(safe / 86_400_000)}d`;
}

export function parseAgeMs(timestamp: string | null | undefined, now = Date.now()): number | undefined {
  if (!timestamp) return undefined;
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.max(0, now - parsed);
}

export function classifyFreshness(ageMs: number | undefined, currentMs = 30_000, delayedMs = 120_000): FreshnessState {
  if (ageMs == null) return "UNKNOWN";
  if (ageMs <= currentMs) return "CURRENT";
  if (ageMs <= delayedMs) return "DELAYED";
  return "STALE";
}

export function buildMarketQuoteQuality(input: {
  transport: TransportState;
  quoteTimestamp?: string;
  snapshotTimestamp?: string;
  receiveTimestamp?: string;
  sequence?: number;
  gapDetected?: boolean;
  snapshotFailed?: boolean;
  now?: number;
}): ModuleQualityState {
  const ageMs = parseAgeMs(input.quoteTimestamp, input.now);
  const fallbackAvailable = Boolean(input.snapshotTimestamp);
  return {
    moduleId: "market-quotes",
    transport: input.transport,
    freshness: classifyFreshness(ageMs),
    readiness: input.gapDetected
      ? "RECOVERING"
      : input.snapshotFailed
        ? "DEGRADED"
        : input.quoteTimestamp
          ? "READY"
          : fallbackAvailable
            ? "DEGRADED"
            : "NO_DATA",
    eventTime: input.quoteTimestamp,
    receiveTime: input.receiveTimestamp,
    dataThrough: input.quoteTimestamp ?? input.snapshotTimestamp,
    ageMs,
    source: input.quoteTimestamp ? "Canonical quote stream" : fallbackAvailable ? "Overview snapshot" : undefined,
    sequence: input.sequence,
    gapDetected: input.gapDetected,
    message: input.gapDetected
      ? "A stream sequence gap was detected; the canonical snapshot is being restored."
      : ageMs != null && ageMs > 120_000
        ? "Transport and quote freshness are reported separately. This quote is not current."
        : undefined
  };
}
