import { useEffect, useMemo, useState } from "react";
import { liveRefreshHealth, type LiveRefreshInput } from "../lib/liveRefresh";
import styles from "./LiveRefreshStatus.module.css";

export type LiveRefreshSource = LiveRefreshInput & {
  id: string;
  label: string;
};

function timeLabel(timestamp: number | null): string {
  if (timestamp == null) return "waiting";
  return new Date(timestamp).toLocaleTimeString("en-IN", {
    hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Asia/Kolkata",
  });
}

export function LiveRefreshStatus({ sources, onRetry, className }: {
  sources: LiveRefreshSource[];
  onRetry?: () => void;
  className?: string;
}) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const health = useMemo(() => sources.map((source) => ({
    source,
    health: liveRefreshHealth({ ...source, nowMs }),
  })), [nowMs, sources]);
  const state = health.some(({ health: item }) => item.state === "error") ? "error"
    : health.some(({ health: item }) => item.state === "stale") ? "stale"
      : health.some(({ health: item }) => item.state === "refreshing") ? "refreshing"
        : health.some(({ health: item }) => item.state === "loading") ? "loading"
          : "fresh";
  const hasIssue = state === "error" || state === "stale";
  const title = state === "error" ? "Refresh issue · last good data retained"
    : state === "stale" ? "Data refresh is late · last good data retained"
      : state === "refreshing" ? "Refreshing in place"
        : state === "loading" ? "Loading live data"
          : "Live refresh active";

  return <section
    className={`${styles.status}${className ? ` ${className}` : ""}`}
    data-state={state}
    data-testid="live-refresh-health"
    role={hasIssue ? "alert" : "status"}
    aria-live={hasIssue ? "assertive" : "polite"}
  >
    <strong>{title}</strong>
    <span className={styles.sources}>{health.map(({ source, health: item }) => <span className={styles.source} data-state={item.state} key={source.id}>
      {source.label}: {timeLabel(item.lastSuccessAt)} · every {Math.round(source.intervalMs / 1_000)}s{item.state === "stale" ? " · late" : item.state === "error" ? " · failed" : ""}
    </span>)}</span>
    {hasIssue && onRetry ? <button type="button" onClick={onRetry}>Retry now</button> : null}
  </section>;
}
