import { useEffect, useRef } from "react";
import { getAnalyticsAttributionParams, captureAttribution } from "../lib/attribution";
import type { AuthState } from "./types";
import { analytics } from "./index";
import { resolveRouteMeta } from "./routeMap";

function deriveAnalysisInstrument(pathname: string) {
  if (pathname.startsWith("/analytics/stock/")) {
    const parts = pathname.split("/");
    return decodeURIComponent(parts[parts.length - 1] ?? "unknown");
  }
  if (pathname.startsWith("/options") || pathname.startsWith("/option-chain")) return "NIFTY50";
  if (pathname.startsWith("/heatmap/")) return "NIFTY50_UNIVERSE";
  if (pathname.startsWith("/backtesting/")) return "NIFTY100_UNIVERSE";
  return "NIFTY50";
}

function deriveAnalysisTimeframe(pathname: string) {
  if (pathname.startsWith("/options") || pathname.startsWith("/heatmap/")) return "intraday";
  if (pathname.startsWith("/backtesting/") || pathname.startsWith("/analytics/simulator")) return "daily";
  return "daily";
}

export function useTrackPageViews({
  pathname,
  search,
  mode,
  authState,
  trackingReady
}: {
  pathname: string;
  search: string;
  mode: string;
  authState: AuthState;
  trackingReady?: boolean;
}) {
  const previousPathRef = useRef<string | null>(null);
  const routeStartedAtRef = useRef<number>(Date.now());

  useEffect(() => {
    analytics.init();
  }, []);

  useEffect(() => {
    captureAttribution();
    analytics.setContext({
      mode,
      auth_state: authState,
      ...getAnalyticsAttributionParams()
    });
  }, [authState, mode]);

  useEffect(() => {
    if (!trackingReady) return;
    captureAttribution();
    const previous = previousPathRef.current;
    const now = Date.now();

    if (previous) {
      const durationSec = Number(((now - routeStartedAtRef.current) / 1000).toFixed(2));
      analytics.track("page_dwell", {
        page_path: previous,
        duration_sec: durationSec
      });
    }

    previousPathRef.current = pathname;
    routeStartedAtRef.current = now;

    const routeMeta = resolveRouteMeta(pathname);
    const attributionParams = getAnalyticsAttributionParams();
    analytics.pageView(pathname, search, {
      mode,
      auth_state: authState,
      ...attributionParams
    });
    analytics.track("view_analysis", {
      analysis_type: routeMeta.pageName,
      content_id: pathname,
      instrument: deriveAnalysisInstrument(pathname),
      timeframe: deriveAnalysisTimeframe(pathname),
      page_section: routeMeta.section ?? routeMeta.module,
      ...attributionParams
    });
  }, [authState, mode, pathname, search, trackingReady]);

  useEffect(() => {
    return () => {
      if (!previousPathRef.current) return;
      const durationSec = Number(((Date.now() - routeStartedAtRef.current) / 1000).toFixed(2));
      analytics.track("page_dwell", {
        page_path: previousPathRef.current,
        duration_sec: durationSec,
        reason: "app_unmount"
      });
    };
  }, []);
}
