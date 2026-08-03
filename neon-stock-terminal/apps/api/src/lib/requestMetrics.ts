import { AsyncLocalStorage } from "node:async_hooks";

export type RequestMetrics = {
  requestId: string;
  dbQueryCount: number;
  dbQueryDurationMs: number;
  snapshotKey: string | null;
  snapshotStatus: string | null;
  snapshotSource: string | null;
  snapshotAgeMs: number | null;
};

const storage = new AsyncLocalStorage<RequestMetrics>();

export function runWithRequestMetrics<T>(requestId: string, fn: () => T): T {
  return storage.run(
    {
      requestId,
      dbQueryCount: 0,
      dbQueryDurationMs: 0,
      snapshotKey: null,
      snapshotStatus: null,
      snapshotSource: null,
      snapshotAgeMs: null
    },
    fn
  );
}

export function getRequestMetrics(): RequestMetrics | null {
  return storage.getStore() ?? null;
}

export function recordDbQuery(durationMs: number) {
  const metrics = storage.getStore();
  if (!metrics) return;
  metrics.dbQueryCount += 1;
  metrics.dbQueryDurationMs += durationMs;
}

export function annotateSnapshotMetrics(input: {
  key: string;
  status: string;
  source: string;
  ageMs: number | null;
}) {
  const metrics = storage.getStore();
  if (!metrics) return;
  metrics.snapshotKey = input.key;
  metrics.snapshotStatus = input.status;
  metrics.snapshotSource = input.source;
  metrics.snapshotAgeMs = input.ageMs;
}
