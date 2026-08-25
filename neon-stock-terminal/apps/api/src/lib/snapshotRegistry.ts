import type { PrismaClient } from "@prisma/client";
import { marketDayIso } from "./time";
import { materializeSnapshot, type SnapshotDefinition } from "./dashboardSnapshots";
import { getOverview } from "../routes/overview";
import { buildChangeHeatmapPayload } from "../routes/changeHeatmap";
import { buildRsiSurfacePayload } from "../routes/rsiSurface";
import { buildWillSurfacePayload } from "../routes/willSurface";
import {
  getAnalyticsDashboard,
  getAnalyticsBoardBrief,
  getAnalyticsFlows,
  getAnalyticsQuality,
  getAnalyticsSimulatorDefaultSnapshot,
  getAnalyticsSimulatorUniverseSnapshot
} from "../routes/analytics";
import { getSupportingMetricsSnapshot } from "../routes/supportingMetrics";
import {
  getBacktestingCompare,
  getBacktestingDailySummary,
  getBacktestingOverview,
  getBacktestingRuns,
  getBacktestingStrategies
} from "../routes/backtesting";

export const SNAPSHOT_DEFINITIONS: SnapshotDefinition<unknown>[] = [
  {
    key: "overview",
    cacheControl: "private, max-age=60, stale-while-revalidate=300",
    freshnessMs: 3 * 60_000,
    snapshotDate: marketDayIso,
    // The full overview is intentionally on-demand. It scans the complete F&O
    // and indicator universe and must never compete with Paper/Strategy simply
    // because the API process restarted. Stale snapshots are served instantly
    // and refreshed in the background when the market canvas is opened.
    scheduled: false,
    build: getOverview
  },
  {
    key: "heatmap-change",
    cacheControl: "private, max-age=60, stale-while-revalidate=300",
    freshnessMs: 3 * 60_000,
    snapshotDate: marketDayIso,
    build: buildChangeHeatmapPayload
  },
  {
    key: "heatmap-rsi",
    cacheControl: "private, max-age=60, stale-while-revalidate=300",
    freshnessMs: 3 * 60_000,
    snapshotDate: marketDayIso,
    build: buildRsiSurfacePayload
  },
  {
    key: "heatmap-will",
    cacheControl: "private, max-age=60, stale-while-revalidate=300",
    freshnessMs: 3 * 60_000,
    snapshotDate: marketDayIso,
    build: buildWillSurfacePayload
  },
  {
    key: "analytics-dashboard",
    cacheControl: "private, max-age=300, stale-while-revalidate=300",
    freshnessMs: 5 * 60_000,
    snapshotDate: marketDayIso,
    build: getAnalyticsDashboard
  },
  {
    key: "analytics-flows",
    cacheControl: "private, max-age=300, stale-while-revalidate=300",
    freshnessMs: 5 * 60_000,
    snapshotDate: marketDayIso,
    build: getAnalyticsFlows
  },
  {
    key: "analytics-quality",
    cacheControl: "private, max-age=300, stale-while-revalidate=300",
    freshnessMs: 5 * 60_000,
    snapshotDate: marketDayIso,
    build: getAnalyticsQuality
  },
  {
    key: "analytics-board-brief",
    cacheControl: "private, max-age=300, stale-while-revalidate=300",
    freshnessMs: 5 * 60_000,
    snapshotDate: marketDayIso,
    build: getAnalyticsBoardBrief
  },
  {
    key: "analytics-supporting-metrics",
    cacheControl: "private, max-age=90, stale-while-revalidate=180",
    freshnessMs: 90_000,
    snapshotDate: marketDayIso,
    build: getSupportingMetricsSnapshot
  },
  {
    key: "analytics-simulator-universe",
    cacheControl: "private, max-age=300, stale-while-revalidate=300",
    freshnessMs: 5 * 60_000,
    snapshotDate: marketDayIso,
    build: getAnalyticsSimulatorUniverseSnapshot
  },
  {
    key: "analytics-simulator-default",
    cacheControl: "private, max-age=300, stale-while-revalidate=300",
    freshnessMs: 5 * 60_000,
    snapshotDate: marketDayIso,
    build: getAnalyticsSimulatorDefaultSnapshot
  },
  {
    key: "backtesting-overview",
    cacheControl: "private, max-age=300, stale-while-revalidate=300",
    freshnessMs: 5 * 60_000,
    snapshotDate: marketDayIso,
    scheduled: false,
    build: getBacktestingOverview
  },
  {
    key: "backtesting-strategies",
    cacheControl: "private, max-age=300, stale-while-revalidate=300",
    freshnessMs: 5 * 60_000,
    snapshotDate: marketDayIso,
    scheduled: false,
    build: getBacktestingStrategies
  },
  {
    key: "backtesting-daily-summary",
    cacheControl: "private, max-age=300, stale-while-revalidate=300",
    freshnessMs: 5 * 60_000,
    snapshotDate: marketDayIso,
    scheduled: false,
    build: getBacktestingDailySummary
  },
  {
    key: "backtesting-compare",
    cacheControl: "private, max-age=300, stale-while-revalidate=300",
    freshnessMs: 5 * 60_000,
    snapshotDate: marketDayIso,
    scheduled: false,
    build: getBacktestingCompare
  },
  {
    key: "backtesting-runs",
    cacheControl: "private, max-age=300, stale-while-revalidate=300",
    freshnessMs: 5 * 60_000,
    snapshotDate: marketDayIso,
    scheduled: false,
    build: getBacktestingRuns
  }
];

let schedulerStarted = false;
let scheduledRefreshQueue: Promise<void> = Promise.resolve();
const scheduledRefreshPending = new Set<string>();

export async function materializeAllSnapshots(prisma: PrismaClient) {
  for (const definition of SNAPSHOT_DEFINITIONS) {
    await materializeSnapshot(prisma, definition);
  }
}

export async function materializeSnapshotKeys(prisma: PrismaClient, keys: string[]) {
  const requested = new Set(keys);
  for (const definition of SNAPSHOT_DEFINITIONS) {
    if (!requested.has(definition.key)) continue;
    await materializeSnapshot(prisma, definition);
  }
}

export function startSnapshotScheduler(prisma: PrismaClient) {
  if (schedulerStarted) return;
  schedulerStarted = true;

  let scheduledIndex = 0;
  for (const definition of SNAPSHOT_DEFINITIONS) {
    if (definition.scheduled === false) continue;
    const run = () => {
      if (scheduledRefreshPending.has(definition.key)) return;
      scheduledRefreshPending.add(definition.key);
      scheduledRefreshQueue = scheduledRefreshQueue
        .then(async () => {
          await materializeSnapshot(prisma, definition);
        })
        .catch((err) => {
          console.warn(JSON.stringify({
            ts: new Date().toISOString(),
            level: "warn",
            event: "dashboard_snapshot_scheduler_failed",
            snapshotKey: definition.key,
            error: err instanceof Error ? err.message : String(err)
          }));
        })
        .finally(() => {
          scheduledRefreshPending.delete(definition.key);
        });
    };

    setTimeout(run, 1_500 + scheduledIndex * 250);
    setInterval(run, definition.freshnessMs);
    scheduledIndex += 1;
  }
}
