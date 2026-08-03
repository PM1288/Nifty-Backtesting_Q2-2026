import { analytics } from "./index";
import type { AnalyticsParams } from "./types";

export type QueryTimingSnapshot = {
  queryName: string;
  durationMs: number;
  status: "success" | "error";
  fetchKind: "initial" | "refresh";
  recordedAt: number;
};

export type PageLoadSnapshot = {
  pageName: string;
  pagePath: string;
  status: "ready" | "error";
  totalDurationMs: number;
  queryCount: number;
  bottleneckQuery: string | null;
  bottleneckDurationMs: number | null;
  recordedAt: number;
};

export type RouteAlertSnapshot = {
  pageName: string;
  pagePath: string;
  status: "ready" | "error";
  severity: "warning" | "critical";
  reason: "slow_route" | "route_error";
  totalDurationMs: number;
  thresholdMs: number | null;
  bottleneckQuery: string | null;
  recordedAt: number;
};

export type RoutePerformanceSummary = {
  pageName: string;
  latestPath: string;
  latestStatus: "ready" | "error";
  latestDurationMs: number;
  medianDurationMs: number;
  averageDurationMs: number;
  sampleCount: number;
  alertCount: number;
  warningThresholdMs: number | null;
  criticalThresholdMs: number | null;
  lastRecordedAt: number;
};

type PerformanceDebugSnapshot = {
  recentQueries: QueryTimingSnapshot[];
  recentPages: PageLoadSnapshot[];
  recentRouteAlerts: RouteAlertSnapshot[];
  routeSummaries: RoutePerformanceSummary[];
};

const PAGE_LOAD_STORAGE_KEY = "n50.analytics.performance.page_loads.v1";
const ROUTE_ALERT_STORAGE_KEY = "n50.analytics.performance.route_alerts.v1";
const MAX_DEBUG_QUERIES = 12;
const MAX_PAGE_LOAD_ENTRIES = 48;
const MAX_ROUTE_ALERT_ENTRIES = 24;
const ROUTE_ALERT_COOLDOWN_MS = 2 * 60_000;

const latestQueryTimings = new Map<string, QueryTimingSnapshot>();
const recentQueryTimings: QueryTimingSnapshot[] = [];
const recentPageLoads: PageLoadSnapshot[] = [];
const recentRouteAlerts: RouteAlertSnapshot[] = [];
const recentAlertKeys = new Map<string, number>();
const listeners = new Set<() => void>();

const ROUTE_PERFORMANCE_THRESHOLDS: Record<string, { warningMs: number; criticalMs: number }> = {
  landing: { warningMs: 550, criticalMs: 900 },
  analytics_overview: { warningMs: 650, criticalMs: 1_000 },
  analytics_regime: { warningMs: 700, criticalMs: 1_050 },
  backtesting_overview: { warningMs: 750, criticalMs: 1_150 },
  backtesting_library: { warningMs: 800, criticalMs: 1_250 },
  backtesting_strategy_detail: { warningMs: 1_000, criticalMs: 1_500 },
  backtesting_results: { warningMs: 950, criticalMs: 1_450 },
  backtesting_regimes: { warningMs: 900, criticalMs: 1_350 },
  backtesting_stocks: { warningMs: 950, criticalMs: 1_450 },
  backtesting_daily_summary: { warningMs: 800, criticalMs: 1_200 },
  backtesting_compare: { warningMs: 900, criticalMs: 1_350 },
  backtesting_runs: { warningMs: 850, criticalMs: 1_250 },
  analytics_supporting_metrics: { warningMs: 850, criticalMs: 1_250 },
  analytics_options: { warningMs: 900, criticalMs: 1_350 },
  change_heatmap: { warningMs: 700, criticalMs: 1_050 },
  rsi_surface: { warningMs: 700, criticalMs: 1_050 },
  will_surface: { warningMs: 700, criticalMs: 1_050 },
  analytics_learn: { warningMs: 850, criticalMs: 1_250 },
  analytics_simulator: { warningMs: 1_200, criticalMs: 1_700 },
  analytics_indicator: { warningMs: 1_000, criticalMs: 1_500 },
  analytics_quality: { warningMs: 900, criticalMs: 1_350 },
  analytics_stock: { warningMs: 900, criticalMs: 1_400 },
  stock_page: { warningMs: 900, criticalMs: 1_400 },
  analytics_setups: { warningMs: 750, criticalMs: 1_150 },
  analytics_risk: { warningMs: 800, criticalMs: 1_200 },
  analytics_flows: { warningMs: 800, criticalMs: 1_200 }
};

let hydrated = false;
let performanceDebugSnapshot: PerformanceDebugSnapshot = {
  recentQueries: [],
  recentPages: [],
  recentRouteAlerts: [],
  routeSummaries: []
};

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function parseStoredEntries<T>(rawValue: string | null): T[] {
  if (!rawValue) return [];
  try {
    const parsed = JSON.parse(rawValue);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function pushRecentEntry<T>(collection: T[], entry: T, maxEntries: number) {
  collection.push(entry);
  if (collection.length > maxEntries) {
    collection.splice(0, collection.length - maxEntries);
  }
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function savePerformanceState() {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(PAGE_LOAD_STORAGE_KEY, JSON.stringify(recentPageLoads));
    window.localStorage.setItem(ROUTE_ALERT_STORAGE_KEY, JSON.stringify(recentRouteAlerts));
  } catch {
    // Persisting telemetry must never interrupt route rendering.
  }
}

function hydratePerformanceState() {
  if (hydrated) return;
  hydrated = true;
  if (!canUseStorage()) return;

  const storedPages = parseStoredEntries<PageLoadSnapshot>(window.localStorage.getItem(PAGE_LOAD_STORAGE_KEY));
  const storedAlerts = parseStoredEntries<RouteAlertSnapshot>(window.localStorage.getItem(ROUTE_ALERT_STORAGE_KEY));
  recentPageLoads.splice(0, recentPageLoads.length, ...storedPages.slice(-MAX_PAGE_LOAD_ENTRIES));
  recentRouteAlerts.splice(0, recentRouteAlerts.length, ...storedAlerts.slice(-MAX_ROUTE_ALERT_ENTRIES));
}

function buildRouteSummaries() {
  const buckets = new Map<string, PageLoadSnapshot[]>();
  for (const snapshot of recentPageLoads) {
    const bucket = buckets.get(snapshot.pageName) ?? [];
    bucket.push(snapshot);
    buckets.set(snapshot.pageName, bucket);
  }

  const alertCounts = new Map<string, number>();
  for (const alert of recentRouteAlerts) {
    alertCounts.set(alert.pageName, (alertCounts.get(alert.pageName) ?? 0) + 1);
  }

  return [...buckets.entries()]
    .map(([pageName, entries]) => {
      const latest = entries[entries.length - 1];
      const durations = entries.map((entry) => entry.totalDurationMs);
      const thresholds = ROUTE_PERFORMANCE_THRESHOLDS[pageName];
      return {
        pageName,
        latestPath: latest.pagePath,
        latestStatus: latest.status,
        latestDurationMs: latest.totalDurationMs,
        medianDurationMs: Math.round(median(durations)),
        averageDurationMs: Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length),
        sampleCount: entries.length,
        alertCount: alertCounts.get(pageName) ?? 0,
        warningThresholdMs: thresholds?.warningMs ?? null,
        criticalThresholdMs: thresholds?.criticalMs ?? null,
        lastRecordedAt: latest.recordedAt
      } satisfies RoutePerformanceSummary;
    })
    .sort((left, right) => {
      if (right.alertCount !== left.alertCount) return right.alertCount - left.alertCount;
      if (right.latestDurationMs !== left.latestDurationMs) return right.latestDurationMs - left.latestDurationMs;
      return right.lastRecordedAt - left.lastRecordedAt;
    });
}

function emitChange() {
  performanceDebugSnapshot = {
    recentQueries: [...recentQueryTimings].reverse(),
    recentPages: [...recentPageLoads].reverse(),
    recentRouteAlerts: [...recentRouteAlerts].reverse(),
    routeSummaries: buildRouteSummaries()
  };
  listeners.forEach((listener) => listener());
}

function evaluateRouteAlert(snapshot: PageLoadSnapshot): RouteAlertSnapshot | null {
  if (snapshot.status === "error") {
    return {
      pageName: snapshot.pageName,
      pagePath: snapshot.pagePath,
      status: snapshot.status,
      severity: "critical",
      reason: "route_error",
      totalDurationMs: snapshot.totalDurationMs,
      thresholdMs: null,
      bottleneckQuery: snapshot.bottleneckQuery,
      recordedAt: snapshot.recordedAt
    };
  }

  const thresholds = ROUTE_PERFORMANCE_THRESHOLDS[snapshot.pageName];
  if (!thresholds) return null;
  if (snapshot.totalDurationMs >= thresholds.criticalMs) {
    return {
      pageName: snapshot.pageName,
      pagePath: snapshot.pagePath,
      status: snapshot.status,
      severity: "critical",
      reason: "slow_route",
      totalDurationMs: snapshot.totalDurationMs,
      thresholdMs: thresholds.criticalMs,
      bottleneckQuery: snapshot.bottleneckQuery,
      recordedAt: snapshot.recordedAt
    };
  }
  if (snapshot.totalDurationMs >= thresholds.warningMs) {
    return {
      pageName: snapshot.pageName,
      pagePath: snapshot.pagePath,
      status: snapshot.status,
      severity: "warning",
      reason: "slow_route",
      totalDurationMs: snapshot.totalDurationMs,
      thresholdMs: thresholds.warningMs,
      bottleneckQuery: snapshot.bottleneckQuery,
      recordedAt: snapshot.recordedAt
    };
  }
  return null;
}

function recordRouteAlert(alert: RouteAlertSnapshot) {
  const alertKey = `${alert.pageName}:${alert.reason}:${alert.severity}`;
  const lastRecordedAt = recentAlertKeys.get(alertKey);
  if (lastRecordedAt && alert.recordedAt - lastRecordedAt < ROUTE_ALERT_COOLDOWN_MS) return;
  recentAlertKeys.set(alertKey, alert.recordedAt);

  pushRecentEntry(recentRouteAlerts, alert, MAX_ROUTE_ALERT_ENTRIES);
  analytics.track("route_performance_alert", {
    page_name: alert.pageName,
    page_path: alert.pagePath,
    status: alert.status,
    severity: alert.severity,
    alert_reason: alert.reason,
    total_duration_ms: alert.totalDurationMs,
    threshold_ms: alert.thresholdMs,
    bottleneck_query: alert.bottleneckQuery
  });
  analytics.trackError({
    type: "route_performance_alert",
    severity: alert.severity === "critical" ? "error" : "warning",
    page_name: alert.pageName,
    page_path: alert.pagePath,
    status: alert.status,
    alert_reason: alert.reason,
    total_duration_ms: alert.totalDurationMs,
    threshold_ms: alert.thresholdMs,
    bottleneck_query: alert.bottleneckQuery
  });
}

hydratePerformanceState();
emitChange();

export function recordQueryTiming(snapshot: QueryTimingSnapshot) {
  hydratePerformanceState();
  latestQueryTimings.set(snapshot.queryName, snapshot);
  pushRecentEntry(recentQueryTimings, snapshot, MAX_DEBUG_QUERIES);
  emitChange();
}

export function getLatestQueryTiming(queryName: string) {
  return latestQueryTimings.get(queryName) ?? null;
}

export function getSlowestQueryTiming(queryNames: string[]) {
  const timings = queryNames
    .map((queryName) => latestQueryTimings.get(queryName))
    .filter((item): item is QueryTimingSnapshot => Boolean(item));

  if (!timings.length) return null;
  return timings.reduce((slowest, current) => (current.durationMs > slowest.durationMs ? current : slowest));
}

export function getPerformanceDebugSnapshot() {
  hydratePerformanceState();
  return performanceDebugSnapshot;
}

export function subscribePerformanceDebug(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function trackQueryLoadProfile(params: AnalyticsParams) {
  analytics.track("query_load_profile", params);
}

export function trackPageLoadProfile(params: AnalyticsParams) {
  hydratePerformanceState();
  const snapshot: PageLoadSnapshot = {
    pageName: String(params.page_name ?? ""),
    pagePath: String(params.page_path ?? ""),
    status: params.status === "error" ? "error" : "ready",
    totalDurationMs: Number(params.total_duration_ms ?? 0),
    queryCount: Number(params.query_count ?? 0),
    bottleneckQuery: typeof params.bottleneck_query === "string" ? params.bottleneck_query : null,
    bottleneckDurationMs:
      typeof params.bottleneck_duration_ms === "number"
        ? params.bottleneck_duration_ms
        : Number.isFinite(Number(params.bottleneck_duration_ms))
          ? Number(params.bottleneck_duration_ms)
          : null,
    recordedAt: Date.now()
  };

  pushRecentEntry(recentPageLoads, snapshot, MAX_PAGE_LOAD_ENTRIES);
  const alert = evaluateRouteAlert(snapshot);
  if (alert) {
    recordRouteAlert(alert);
  }
  savePerformanceState();
  emitChange();
  analytics.track("page_load_profile", params);
}
