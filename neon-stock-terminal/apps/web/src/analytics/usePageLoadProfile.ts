import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { getSlowestQueryTiming, recordQueryTiming, trackPageLoadProfile, trackQueryLoadProfile } from "./performance";

type QueryProfileState = {
  name: string;
  isLoading: boolean;
  isError: boolean;
};

type PageLoadProfileOptions = {
  pageName: string;
  enabled: boolean;
  queries: QueryProfileState[];
  extra?: Record<string, string | number | boolean | null | undefined>;
};

function nowMs() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

type ObservedQueryState = {
  fetchStatus: "fetching" | "paused" | "idle";
  status: "pending" | "error" | "success";
  dataUpdatedAt: number;
};

export function useObservedQueryTiming(queryName: string, query: ObservedQueryState, enabled: boolean) {
  const startedAtRef = useRef<number | null>(enabled ? nowMs() : null);
  const fetchKindRef = useRef<"initial" | "refresh">(query.dataUpdatedAt ? "refresh" : "initial");
  const cycleRef = useRef(0);

  useEffect(() => {
    if (!enabled) {
      startedAtRef.current = null;
      return;
    }
    if (query.fetchStatus === "fetching" && startedAtRef.current == null) {
      cycleRef.current += 1;
      fetchKindRef.current = query.dataUpdatedAt ? "refresh" : "initial";
      startedAtRef.current = nowMs();
    }
  }, [enabled, query.dataUpdatedAt, query.fetchStatus]);

  useEffect(() => {
    if (!enabled || startedAtRef.current == null) return;
    if (query.status !== "success" && query.status !== "error") return;
    const durationMs = Math.round(nowMs() - startedAtRef.current);
    startedAtRef.current = null;
    const status = query.status === "success" ? "success" : "error";
    recordQueryTiming({
      queryName,
      durationMs,
      status,
      fetchKind: fetchKindRef.current,
      recordedAt: Date.now()
    });
    trackQueryLoadProfile({
      query_name: queryName,
      status,
      duration_ms: durationMs,
      fetch_kind: fetchKindRef.current,
      query_cycle: cycleRef.current
    });
  }, [enabled, query.status, queryName]);
}

export function usePageLoadProfile({ pageName, enabled, queries, extra }: PageLoadProfileOptions) {
  const location = useLocation();
  const startedAtRef = useRef(nowMs());
  const sentRef = useRef(false);

  useEffect(() => {
    startedAtRef.current = nowMs();
    sentRef.current = false;
  }, [location.pathname, location.search, pageName]);

  useEffect(() => {
    if (!enabled || sentRef.current || !queries.length) return;
    const anyLoading = queries.some((query) => query.isLoading);
    if (anyLoading) return;

    sentRef.current = true;
    const anyError = queries.some((query) => query.isError);
    const slowest = getSlowestQueryTiming(queries.map((query) => query.name));
    trackPageLoadProfile({
      page_name: pageName,
      page_path: `${location.pathname}${location.search}`,
      status: anyError ? "error" : "ready",
      total_duration_ms: Math.round(nowMs() - startedAtRef.current),
      query_count: queries.length,
      bottleneck_query: slowest?.queryName,
      bottleneck_duration_ms: slowest?.durationMs,
      ...extra
    });
  }, [enabled, extra, location.pathname, location.search, pageName, queries]);
}
