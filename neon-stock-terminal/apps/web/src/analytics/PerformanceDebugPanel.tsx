import { useSyncExternalStore } from "react";
import { formatTime as formatLocaleTime } from "../lib/format";
import { getPerformanceDebugSnapshot, subscribePerformanceDebug } from "./performance";
import styles from "./PerformanceDebugPanel.module.css";

function formatDuration(durationMs: number | null | undefined) {
  if (durationMs == null || !Number.isFinite(durationMs)) return "—";
  return `${Math.round(durationMs)} ms`;
}

function formatTime(timestamp: number) {
  return formatLocaleTime(new Date(timestamp).toISOString());
}

export function isPerformanceDebugEnabled() {
  if (!import.meta.env.DEV || typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  return params.get("perf_debug") === "1" || window.localStorage.getItem("perf_debug") === "1";
}

export function PerformanceDebugPanel() {
  const snapshot = useSyncExternalStore(subscribePerformanceDebug, getPerformanceDebugSnapshot, getPerformanceDebugSnapshot);

  if (!isPerformanceDebugEnabled()) return null;

  return (
    <aside className={styles.panel} aria-label="Performance debug panel">
      <div className={styles.header}>Perf debug</div>
      <div className={styles.section}>
        <div className={styles.label}>Recent pages</div>
        {snapshot.recentPages.length ? (
          snapshot.recentPages.slice(0, 4).map((page) => (
            <div key={`${page.pageName}:${page.recordedAt}`} className={styles.row}>
              <div className={styles.title}>{page.pageName}</div>
              <div className={styles.meta}>
                <span>{formatDuration(page.totalDurationMs)}</span>
                <span>{page.bottleneckQuery ?? "no bottleneck"}</span>
                <span>{formatTime(page.recordedAt)}</span>
              </div>
            </div>
          ))
        ) : (
          <div className={styles.empty}>No page profiles yet.</div>
        )}
      </div>
      <div className={styles.section}>
        <div className={styles.label}>Route alerts</div>
        {snapshot.recentRouteAlerts.length ? (
          snapshot.recentRouteAlerts.slice(0, 4).map((alert) => (
            <div key={`${alert.pageName}:${alert.recordedAt}:${alert.severity}`} className={styles.row}>
              <div className={styles.title}>{alert.pageName}</div>
              <div className={styles.meta}>
                <span>{formatDuration(alert.totalDurationMs)}</span>
                <span>{alert.severity}</span>
                <span>{formatTime(alert.recordedAt)}</span>
              </div>
            </div>
          ))
        ) : (
          <div className={styles.empty}>No route alerts yet.</div>
        )}
      </div>
      <div className={styles.section}>
        <div className={styles.label}>Recent queries</div>
        {snapshot.recentQueries.length ? (
          snapshot.recentQueries.slice(0, 6).map((query) => (
            <div key={`${query.queryName}:${query.recordedAt}:${query.fetchKind}`} className={styles.row}>
              <div className={styles.title}>{query.queryName}</div>
              <div className={styles.meta}>
                <span>{formatDuration(query.durationMs)}</span>
                <span>{query.fetchKind}</span>
                <span>{query.status}</span>
              </div>
            </div>
          ))
        ) : (
          <div className={styles.empty}>No query timings yet.</div>
        )}
      </div>
    </aside>
  );
}
