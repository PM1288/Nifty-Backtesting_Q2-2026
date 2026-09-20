export type LiveRefreshState = "loading" | "refreshing" | "fresh" | "stale" | "error";

export type LiveRefreshInput = {
  hasData: boolean;
  isError: boolean;
  isFetching: boolean;
  generatedAt?: string | null;
  dataUpdatedAt?: number;
  intervalMs: number;
  nowMs?: number;
};

export type LiveRefreshHealth = {
  state: LiveRefreshState;
  lastSuccessAt: number | null;
  ageMs: number | null;
  staleAfterMs: number;
};

export function liveRefreshHealth(input: LiveRefreshInput): LiveRefreshHealth {
  const nowMs = input.nowMs ?? Date.now();
  const generatedAt = input.generatedAt ? Date.parse(input.generatedAt) : Number.NaN;
  const lastSuccessAt = Number.isFinite(generatedAt) && generatedAt > 0
    ? generatedAt
    : input.dataUpdatedAt && input.dataUpdatedAt > 0
      ? input.dataUpdatedAt
      : null;
  const ageMs = lastSuccessAt == null ? null : Math.max(0, nowMs - lastSuccessAt);
  const staleAfterMs = Math.max(120_000, input.intervalMs * 3);

  if (!input.hasData) return { state: input.isError ? "error" : "loading", lastSuccessAt, ageMs, staleAfterMs };
  if (input.isError) return { state: "error", lastSuccessAt, ageMs, staleAfterMs };
  if (ageMs != null && ageMs > staleAfterMs) return { state: "stale", lastSuccessAt, ageMs, staleAfterMs };
  if (input.isFetching) return { state: "refreshing", lastSuccessAt, ageMs, staleAfterMs };
  return { state: "fresh", lastSuccessAt, ageMs, staleAfterMs };
}
