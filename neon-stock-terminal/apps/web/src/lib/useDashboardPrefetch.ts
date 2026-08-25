import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import {
  fetchAnalyticsDashboard,
  fetchAnalyticsDailySetups,
  fetchAnalyticsEventContext,
  fetchAnalyticsEvents,
  fetchAnalyticsFiiFlow,
  fetchAnalyticsLeadership,
  fetchAnalyticsMarketState,
  fetchAnalyticsOptionsStructure,
  fetchFiiReportsRunDetail,
  fetchFiiReportsRuns,
  fetchAnalyticsQuality,
  fetchAnalyticsSimulatorUniverse,
  fetchBacktestingCompare,
  fetchBacktestingDailySummary,
  fetchBacktestingOverview,
  fetchBacktestingRuns,
  fetchBacktestingStrategies,
  fetchBacktestingStrategy,
  fetchChangeHeatmap,
  fetchDashboardSection,
  fetchDashboardSummary,
  fetchIndicatorEducation,
  fetchIntradayAnalyticsStock,
  fetchIntradayAnalyticsSummary,
  fetchOptionChainLatest,
  fetchOptionChainSeries,
  fetchRsiSurface,
  fetchSupportingMetrics,
  fetchWatchlists,
  fetchWillSurface
} from "./api";
import {
  preloadAnalyticsIndicatorsPage,
  preloadAnalyticsDailySetupsPage,
  preloadAnalyticsEventContextPage,
  preloadAnalyticsFiiFlowPage,
  preloadAnalyticsLearnPage,
  preloadAnalyticsLeadershipPage,
  preloadAnalyticsMarketStatePage,
  preloadAnalyticsOptionsPage,
  preloadAnalyticsOptionsStructurePage,
  preloadAnalyticsEventsPage,
  preloadAnalyticsFiiReportsPage,
  preloadAnalyticsOverviewPage,
  preloadAnalyticsQualityPage,
  preloadAnalyticsSystemMapPage,
  preloadAnalyticsRegimePage,
  preloadAnalyticsStockPage,
  preloadAnalyticsSimulatorPage,
  preloadAnalyticsSupportingMetricsPage,
  preloadBacktestingComparePage,
  preloadBacktestingDailySummaryPage,
  preloadBacktestingOverviewPage,
  preloadBacktestingPortfolioResultsPage,
  preloadBacktestingRegimeAnalysisPage,
  preloadBacktestingRunsPage,
  preloadBacktestingStockInsightsPage,
  preloadBacktestingStrategyDetailPage,
  preloadBacktestingStrategyLibraryPage,
  preloadChangeHeatmapPage,
  preloadRsiSurfacePage,
  preloadWillSurfacePage
} from "../routePreloads";

type PrefetchTask = {
  id: string;
  run: () => Promise<unknown> | void;
};

function useSessionVersion() {
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onSessionChanged = () => setVersion((current) => current + 1);
    window.addEventListener("n50:session-changed", onSessionChanged as EventListener);
    return () => window.removeEventListener("n50:session-changed", onSessionChanged as EventListener);
  }, []);

  return version;
}

function schedulePrefetch(callback: () => void, delayMs: number) {
  if (typeof window === "undefined") return () => undefined;
  let idleId: number | null = null;
  const timeoutId = window.setTimeout(() => {
    if ("requestIdleCallback" in window) {
      idleId = window.requestIdleCallback(() => callback(), { timeout: 1200 });
      return;
    }
    callback();
  }, delayMs);

  return () => {
    window.clearTimeout(timeoutId);
    if (idleId != null && "cancelIdleCallback" in window) {
      window.cancelIdleCallback(idleId);
    }
  };
}

function resolvePrefetchProfile(pathname: string) {
  const normalizedPath = pathname.split("?")[0] ?? pathname;
  if (normalizedPath.startsWith("/analytics/indicators")) return "indicator";
  if (
    normalizedPath.startsWith("/heatmap/") ||
    normalizedPath === "/change-heatmap" ||
    normalizedPath === "/rsi-surface" ||
    normalizedPath === "/will-surface"
  ) {
    return "heatmap";
  }
  if (normalizedPath.startsWith("/options") || normalizedPath.startsWith("/option-chain")) return "options";
  if (normalizedPath.startsWith("/backtesting")) return "backtesting";
  return "core";
}

function runTasks(tasks: PrefetchTask[]) {
  void Promise.allSettled(tasks.map((task) => Promise.resolve(task.run())));
}

function normalizePrefetchPath(pathname: string) {
  return pathname.trim().split("#")[0] ?? pathname.trim();
}

function isHeavyDashboardPath(pathname: string) {
  const normalizedPath = normalizePrefetchPath(pathname).split("?")[0] ?? pathname;
  return (
    normalizedPath.startsWith("/analytics/indicators") ||
    normalizedPath.startsWith("/institutional/") ||
    normalizedPath.startsWith("/options") ||
    normalizedPath.startsWith("/option-chain") ||
    normalizedPath.startsWith("/analytics/simulator") ||
    normalizedPath.startsWith("/analytics/supporting-metrics") ||
    normalizedPath.startsWith("/analytics/system/quality") ||
    normalizedPath.startsWith("/analytics/quality") ||
    normalizedPath.startsWith("/analytics/stock/") ||
    normalizedPath.startsWith("/backtesting")
  );
}

function createRoutePrefetchTasks(pathname: string, tokenVersion: number, queryClient: ReturnType<typeof useQueryClient>): PrefetchTask[] {
  const normalizedPath = normalizePrefetchPath(pathname).split("?")[0] ?? pathname;
  const coreTasks: PrefetchTask[] = [
    {
      id: "summary",
      run: () =>
        queryClient.prefetchQuery({
          queryKey: ["dashboard-summary", tokenVersion],
          queryFn: fetchDashboardSummary,
          staleTime: 60_000
        })
    },
    {
      id: "regime",
      run: () =>
        queryClient.prefetchQuery({
          queryKey: ["dashboard-section", "regime-breadth", tokenVersion],
          queryFn: () => fetchDashboardSection("regime-breadth"),
          staleTime: 60_000
        })
    }
  ];

  if (normalizedPath === "/" || normalizedPath === "/analytics") {
    return [
      { id: "route-overview", run: () => preloadAnalyticsOverviewPage() },
      ...coreTasks,
      {
        id: "analytics-dashboard",
        run: () =>
          queryClient.prefetchQuery({
            queryKey: ["analytics-dashboard", tokenVersion],
            queryFn: fetchAnalyticsDashboard,
            staleTime: 60_000
          })
      }
    ];
  }

  if (normalizedPath === "/analytics/market-state") {
    return [
      { id: "route-analytics-market-state", run: () => preloadAnalyticsMarketStatePage() },
      ...coreTasks,
      {
        id: "analytics-market-state",
        run: () =>
          queryClient.prefetchQuery({
            queryKey: ["analytics-market-state", tokenVersion],
            queryFn: fetchAnalyticsMarketState,
            staleTime: 60_000
          })
      }
    ];
  }

  if (normalizedPath === "/analytics/events" || normalizedPath === "/catalysts/events") {
    return [
      { id: "route-analytics-events", run: () => preloadAnalyticsEventsPage() },
      ...coreTasks,
      {
        id: "analytics-events",
        run: () =>
          queryClient.prefetchQuery({
            queryKey: ["analytics-events", tokenVersion],
            queryFn: fetchAnalyticsEvents,
            staleTime: 60_000
          })
      }
    ];
  }

  if (normalizedPath === "/catalysts/context") {
    return [
      { id: "route-analytics-event-context", run: () => preloadAnalyticsEventContextPage() },
      ...coreTasks,
      {
        id: "analytics-event-context",
        run: () =>
          queryClient.prefetchQuery({
            queryKey: ["analytics-event-context", tokenVersion],
            queryFn: fetchAnalyticsEventContext,
            staleTime: 60_000
          })
      }
    ];
  }

  if (normalizedPath === "/analytics/leadership") {
    return [
      { id: "route-analytics-leadership", run: () => preloadAnalyticsLeadershipPage() },
      ...coreTasks,
      {
        id: "analytics-leadership",
        run: () =>
          queryClient.prefetchQuery({
            queryKey: ["analytics-leadership", tokenVersion],
            queryFn: fetchAnalyticsLeadership,
            staleTime: 60_000
          })
      }
    ];
  }

  if (normalizedPath === "/analytics/daily-setups" || normalizedPath === "/analytics/setups") {
    return [
      { id: "route-analytics-daily-setups", run: () => preloadAnalyticsDailySetupsPage() },
      ...coreTasks,
      {
        id: "analytics-daily-setups",
        run: () =>
          queryClient.prefetchQuery({
            queryKey: ["analytics-daily-setups", tokenVersion],
            queryFn: fetchAnalyticsDailySetups,
            staleTime: 60_000
          })
      }
    ];
  }

  if (normalizedPath === "/analytics/fii-reports") {
    return createRoutePrefetchTasks("/institutional/reports", tokenVersion, queryClient);
  }

  if (normalizedPath === "/institutional/flow") {
    return [
      { id: "route-analytics-fii-flow", run: () => preloadAnalyticsFiiFlowPage() },
      ...coreTasks,
      {
        id: "analytics-fii-flow",
        run: () =>
          queryClient.prefetchQuery({
            queryKey: ["analytics-fii-flow", tokenVersion],
            queryFn: fetchAnalyticsFiiFlow,
            staleTime: 60_000
          })
      }
    ];
  }

  if (normalizedPath === "/institutional/reports") {
    return [
      { id: "route-analytics-fii-reports", run: () => preloadAnalyticsFiiReportsPage() },
      ...coreTasks,
      {
        id: "fii-reports-runs",
        run: () =>
          queryClient.prefetchQuery({
            queryKey: ["fii-reports-runs", tokenVersion],
            queryFn: fetchFiiReportsRuns,
            staleTime: 60_000
          })
      },
      {
        id: "fii-reports-latest-backfill",
        run: async () => {
          const catalog = await queryClient.fetchQuery({
            queryKey: ["fii-reports-runs", tokenVersion],
            queryFn: fetchFiiReportsRuns,
            staleTime: 60_000
          });
          const candidate = catalog.backfill_runs[0] ?? catalog.daily_runs[0];
          if (!candidate) return null;
          return queryClient.prefetchQuery({
            queryKey: ["fii-reports-run-detail", candidate.kind, candidate.run_id, tokenVersion],
            queryFn: () => fetchFiiReportsRunDetail(candidate.kind, candidate.run_id),
            staleTime: 60_000
          });
        }
      }
    ];
  }

  if (normalizedPath === "/backtesting") {
    return [
      { id: "route-backtesting-overview", run: () => preloadBacktestingOverviewPage() },
      {
        id: "backtesting-overview",
        run: () =>
          queryClient.prefetchQuery({
            queryKey: ["backtesting-overview", tokenVersion],
            queryFn: fetchBacktestingOverview,
            staleTime: 60_000
          })
      }
    ];
  }

  if (normalizedPath === "/backtesting/strategies") {
    return [
      { id: "route-backtesting-library", run: () => preloadBacktestingStrategyLibraryPage() },
      {
        id: "backtesting-strategies",
        run: () =>
          queryClient.prefetchQuery({
            queryKey: ["backtesting-strategies", tokenVersion],
            queryFn: fetchBacktestingStrategies,
            staleTime: 60_000
          })
      }
    ];
  }

  if (normalizedPath.startsWith("/backtesting/strategies/")) {
    const strategyId = decodeURIComponent(normalizedPath.slice("/backtesting/strategies/".length));
    if (!strategyId) return [];
    return [
      { id: "route-backtesting-detail", run: () => preloadBacktestingStrategyDetailPage() },
      {
        id: `backtesting-strategy:${strategyId}`,
        run: () =>
          queryClient.prefetchQuery({
            queryKey: ["backtesting-strategy", strategyId, tokenVersion],
            queryFn: () => fetchBacktestingStrategy(strategyId),
            staleTime: 60_000
          })
      }
    ];
  }

  if (normalizedPath.startsWith("/backtesting/results")) {
    return [
      { id: "route-backtesting-results", run: () => preloadBacktestingPortfolioResultsPage() },
      {
        id: `backtesting-strategy:${"rsi30_willr80_closegtprev_tp125"}`,
        run: () =>
          queryClient.prefetchQuery({
            queryKey: ["backtesting-strategy", "rsi30_willr80_closegtprev_tp125", tokenVersion],
            queryFn: () => fetchBacktestingStrategy("rsi30_willr80_closegtprev_tp125"),
            staleTime: 60_000
          })
      }
    ];
  }

  if (normalizedPath.startsWith("/backtesting/regimes")) {
    return [
      { id: "route-backtesting-regimes", run: () => preloadBacktestingRegimeAnalysisPage() },
      {
        id: `backtesting-strategy:${"rsi30_willr80_closegtprev_tp125"}`,
        run: () =>
          queryClient.prefetchQuery({
            queryKey: ["backtesting-strategy", "rsi30_willr80_closegtprev_tp125", tokenVersion],
            queryFn: () => fetchBacktestingStrategy("rsi30_willr80_closegtprev_tp125"),
            staleTime: 60_000
          })
      }
    ];
  }

  if (normalizedPath.startsWith("/backtesting/stocks")) {
    return [
      { id: "route-backtesting-stocks", run: () => preloadBacktestingStockInsightsPage() },
      {
        id: `backtesting-strategy:${"rsi30_willr80_closegtprev_tp125"}`,
        run: () =>
          queryClient.prefetchQuery({
            queryKey: ["backtesting-strategy", "rsi30_willr80_closegtprev_tp125", tokenVersion],
            queryFn: () => fetchBacktestingStrategy("rsi30_willr80_closegtprev_tp125"),
            staleTime: 60_000
          })
      }
    ];
  }

  if (normalizedPath.startsWith("/backtesting/daily-summary")) {
    return [
      { id: "route-backtesting-daily", run: () => preloadBacktestingDailySummaryPage() },
      {
        id: "backtesting-daily-summary",
        run: () =>
          queryClient.prefetchQuery({
            queryKey: ["backtesting-daily-summary", tokenVersion],
            queryFn: fetchBacktestingDailySummary,
            staleTime: 60_000
          })
      }
    ];
  }

  if (normalizedPath.startsWith("/backtesting/compare")) {
    return [
      { id: "route-backtesting-compare", run: () => preloadBacktestingComparePage() },
      {
        id: "backtesting-compare",
        run: () =>
          queryClient.prefetchQuery({
            queryKey: ["backtesting-compare", tokenVersion],
            queryFn: fetchBacktestingCompare,
            staleTime: 60_000
          })
      }
    ];
  }

  if (normalizedPath.startsWith("/backtesting/runs")) {
    return [
      { id: "route-backtesting-runs", run: () => preloadBacktestingRunsPage() },
      {
        id: "backtesting-runs",
        run: () =>
          queryClient.prefetchQuery({
            queryKey: ["backtesting-runs", tokenVersion],
            queryFn: fetchBacktestingRuns,
            staleTime: 60_000
          })
      }
    ];
  }

  if (normalizedPath.startsWith("/analytics/regime")) {
    return [
      { id: "route-regime", run: () => preloadAnalyticsRegimePage() },
      ...coreTasks,
      {
        id: "analytics-dashboard",
        run: () =>
          queryClient.prefetchQuery({
            queryKey: ["analytics-dashboard", tokenVersion],
            queryFn: fetchAnalyticsDashboard,
            staleTime: 60_000
          })
      }
    ];
  }

  if (normalizedPath.startsWith("/analytics/supporting-metrics")) {
    return [
      { id: "route-supporting-metrics", run: () => preloadAnalyticsSupportingMetricsPage() },
      {
        id: "supporting-metrics",
        run: () =>
          queryClient.prefetchQuery({
            queryKey: ["analytics-supporting-metrics", tokenVersion],
            queryFn: fetchSupportingMetrics,
            staleTime: 90_000
          })
      }
    ];
  }

  if (normalizedPath.startsWith("/options") || normalizedPath.startsWith("/option-chain")) {
    return [
      {
        id: "route-options",
        run: () =>
          normalizedPath.startsWith("/options/snapshot")
            ? preloadAnalyticsOptionsPage()
            : preloadAnalyticsOptionsStructurePage()
      },
      {
        id: "options-structure",
        run: () =>
          queryClient.prefetchQuery({
            queryKey: ["analytics-options-structure", tokenVersion],
            queryFn: fetchAnalyticsOptionsStructure,
            staleTime: 60_000
          })
      },
      {
        id: "options-latest",
        run: () =>
          queryClient.prefetchQuery({
            queryKey: ["option-chain-latest", true],
            queryFn: () => fetchOptionChainLatest(10),
            staleTime: 30_000
          })
      },
      {
        id: "options-series",
        run: () =>
          queryClient.prefetchQuery({
            queryKey: ["option-chain-series", 120],
            queryFn: () => fetchOptionChainSeries(120),
            staleTime: 30_000
          })
      }
    ];
  }

  if (normalizedPath === "/heatmap/change" || normalizedPath === "/change-heatmap") {
    return [
      { id: "route-change", run: () => preloadChangeHeatmapPage() },
      ...coreTasks,
      {
        id: "change-surface",
        run: () =>
          queryClient.prefetchQuery({
            queryKey: ["change-heatmap", tokenVersion],
            queryFn: fetchChangeHeatmap,
            staleTime: 60_000
          })
      }
    ];
  }

  if (normalizedPath === "/heatmap/rsi" || normalizedPath === "/rsi-surface") {
    return [
      { id: "route-rsi", run: () => preloadRsiSurfacePage() },
      {
        id: "rsi-surface",
        run: () =>
          queryClient.prefetchQuery({
            queryKey: ["rsi-surface", tokenVersion],
            queryFn: fetchRsiSurface,
            staleTime: 60_000
          })
      },
      {
        id: "indicator-rsi",
        run: () =>
          queryClient.prefetchQuery({
            queryKey: ["indicator-education", "rsi", tokenVersion],
            queryFn: () => fetchIndicatorEducation("rsi"),
            staleTime: 2 * 60_000
          })
      }
    ];
  }

  if (normalizedPath === "/heatmap/will" || normalizedPath === "/will-surface") {
    return [
      { id: "route-willr", run: () => preloadWillSurfacePage() },
      {
        id: "willr-surface",
        run: () =>
          queryClient.prefetchQuery({
            queryKey: ["will-surface", tokenVersion],
            queryFn: fetchWillSurface,
            staleTime: 60_000
          })
      }
    ];
  }

  if (normalizedPath.startsWith("/analytics/learn")) {
    return [
      { id: "route-learn", run: () => preloadAnalyticsLearnPage() },
      ...coreTasks,
      {
        id: "historical-learner",
        run: () =>
          queryClient.prefetchQuery({
            queryKey: ["dashboard-section", "historical-learner", tokenVersion],
            queryFn: () => fetchDashboardSection("historical-learner"),
            staleTime: 60_000
          })
      },
      {
        id: "watchlists",
        run: () =>
          queryClient.prefetchQuery({
            queryKey: ["watchlists", tokenVersion],
            queryFn: fetchWatchlists,
            staleTime: 60_000
          })
      }
    ];
  }

  if (normalizedPath.startsWith("/analytics/simulator")) {
    return [
      { id: "route-simulator", run: () => preloadAnalyticsSimulatorPage() },
      {
        id: "simulator-universe",
        run: () =>
          queryClient.prefetchQuery({
            queryKey: ["analytics-simulator-universe", tokenVersion],
            queryFn: fetchAnalyticsSimulatorUniverse,
            staleTime: 5 * 60_000
          })
      }
    ];
  }

  if (normalizedPath.startsWith("/analytics/indicators")) {
    return [
      { id: "route-indicators", run: () => preloadAnalyticsIndicatorsPage() },
      {
        id: "indicator-rsi",
        run: () =>
          queryClient.prefetchQuery({
            queryKey: ["indicator-education", "rsi", tokenVersion],
            queryFn: () => fetchIndicatorEducation("rsi"),
            staleTime: 2 * 60_000
          })
      }
    ];
  }

  if (normalizedPath.startsWith("/analytics/stock/")) {
    const symbol = decodeURIComponent(normalizedPath.slice("/analytics/stock/".length)).toUpperCase();
    if (!symbol) return [];
    return [
      { id: "route-stock", run: () => preloadAnalyticsStockPage() },
      {
        id: "stock-summary",
        run: () =>
          queryClient.prefetchQuery({
            queryKey: ["intraday-analytics-summary", tokenVersion],
            queryFn: fetchIntradayAnalyticsSummary,
            staleTime: 60_000
          })
      },
      {
        id: `stock:${symbol}`,
        run: () =>
          queryClient.prefetchQuery({
            queryKey: ["intraday-analytics-stock", symbol, tokenVersion],
            queryFn: () => fetchIntradayAnalyticsStock(symbol),
            staleTime: 60_000
          })
      }
    ];
  }

  if (normalizedPath.startsWith("/analytics/system/map")) {
    return [{ id: "route-system-map", run: () => preloadAnalyticsSystemMapPage() }];
  }

  if (normalizedPath.startsWith("/analytics/system/quality") || normalizedPath.startsWith("/analytics/quality")) {
    return [
      { id: "route-quality", run: () => preloadAnalyticsQualityPage() },
      {
        id: "analytics-quality",
        run: () =>
          queryClient.prefetchQuery({
            queryKey: ["analytics-quality", tokenVersion],
            queryFn: fetchAnalyticsQuality,
            staleTime: 60_000
          })
      }
    ];
  }

  return coreTasks;
}

export function useDashboardPrefetch(enabled: boolean) {
  const queryClient = useQueryClient();
  const location = useLocation();
  const tokenVersion = useSessionVersion();
  const warmedProfilesRef = useRef<Set<string>>(new Set());
  const hoveredRoutesRef = useRef<Set<string>>(new Set());
  const searchParams = new URLSearchParams(location.search);
  const prefetchMode = searchParams.get("prefetch")?.toLowerCase();
  const prefetchEnabled = enabled && prefetchMode !== "off";

  const prefetchRoute = useCallback((pathname: string) => {
    if (!prefetchEnabled) return;
    const normalized = normalizePrefetchPath(pathname);
    if (!normalized || !isHeavyDashboardPath(normalized)) return;
    if (hoveredRoutesRef.current.has(`${tokenVersion}:${normalized}`)) return;
    hoveredRoutesRef.current.add(`${tokenVersion}:${normalized}`);
    runTasks(createRoutePrefetchTasks(normalized, tokenVersion, queryClient));
  }, [prefetchEnabled, queryClient, tokenVersion]);

  useEffect(() => {
    if (!prefetchEnabled) return;
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;

    const warmedKey = `${tokenVersion}:${normalizePrefetchPath(location.pathname)}`;
    if (warmedProfilesRef.current.has(warmedKey)) return;
    warmedProfilesRef.current.add(warmedKey);

    // Warm only the active route. The prior implementation eagerly loaded every
    // heavy workspace after each profile change, creating avoidable API bursts.
    // Adjacent workspaces remain intent-prefetched on pointer, focus or touch.
    const activeTasks = createRoutePrefetchTasks(location.pathname, tokenVersion, queryClient);
    return schedulePrefetch(() => runTasks(activeTasks), 500);
  }, [prefetchEnabled, location.pathname, queryClient, tokenVersion]);

  useEffect(() => {
    if (!prefetchEnabled || typeof document === "undefined" || typeof window === "undefined") return;

    const resolveInternalPath = (href: string | null) => {
      if (!href) return null;
      if (href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return null;
      try {
        const url = new URL(href, window.location.href);
        if (url.origin !== window.location.origin) return null;
        return `${url.pathname}${url.search}`;
      } catch {
        return null;
      }
    };

    const prefetchFromTarget = (target: EventTarget | null) => {
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      const nextPath = resolveInternalPath(anchor.getAttribute("href"));
      if (!nextPath) return;
      prefetchRoute(nextPath);
    };

    const onMouseOver = (event: MouseEvent) => prefetchFromTarget(event.target);
    const onFocusIn = (event: FocusEvent) => prefetchFromTarget(event.target);
    const onTouchStart = (event: TouchEvent) => prefetchFromTarget(event.target);

    document.addEventListener("mouseover", onMouseOver, { passive: true });
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("touchstart", onTouchStart, { passive: true });

    return () => {
      document.removeEventListener("mouseover", onMouseOver);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("touchstart", onTouchStart);
    };
  }, [prefetchEnabled, prefetchRoute]);

  return prefetchRoute;
}
