import { useEffect, useMemo, useRef, useState } from "react";
import { keepPreviousData, useQuery, type UseQueryOptions, type UseQueryResult } from "@tanstack/react-query";
import {
  fetchAnalyticsBoardBrief,
  fetchAnalyticsDashboard,
  fetchAnalyticsDailySetups,
  fetchAnalyticsEventContext,
  fetchAnalyticsEvents,
  fetchAnalyticsFiiFlow,
  fetchAnalyticsLeadership,
  fetchAnalyticsMarketState,
  fetchAnalyticsOptionsStructure,
  fetchAnalyticsStrategyEvaluation,
  fetchFiiReportsRunDetail,
  fetchFiiReportsRuns,
  fetchHeaderMarketSummary,
  fetchAnalyticsFlows,
  fetchAnalyticsQuality,
  fetchBacktestingCompare,
  fetchBacktestingDailySummary,
  fetchBacktestingOverview,
  fetchBacktestingRuns,
  fetchBacktestingStrategies,
  fetchBacktestingStrategy,
  fetchSupportingMetrics,
  fetchIndicatorEducation,
  fetchIndicatorStrategySnapshot,
  fetchAnalyticsSimulator,
  fetchAnalyticsSimulatorUniverse,
  fetchChangeHeatmap,
  fetchDashboardSection,
  fetchDashboardSummary,
  fetchExportManifest,
  fetchIntradayAnalyticsStock,
  fetchIntradayAnalyticsSummary,
  fetchOiisCandidateContext,
  fetchLeaderboard,
  fetchOpsQuality,
  fetchOpsRuns,
  fetchOverview,
  fetchRsiSurface,
  fetchStock,
  fetchWillSurface,
  fetchWatchlist,
  fetchWatchlistHistory,
  fetchWatchlists,
  getWsBaseUrl,
  type AnalyticsSimulatorQuery
} from "./api";
import type { LiveQuote } from "./types";
import { recordQueryTiming, trackQueryLoadProfile } from "../analytics/performance";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

function useSessionVersion() {
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const onSessionChanged = () => {
      setVersion((prev) => prev + 1);
    };
    if (typeof window === "undefined") return;
    window.addEventListener("n50:session-changed", onSessionChanged as EventListener);
    return () => window.removeEventListener("n50:session-changed", onSessionChanged as EventListener);
  }, []);

  return version;
}

function nowMs() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function useProfiledQuery<TQueryFnData, TError = Error, TData = TQueryFnData, TQueryKey extends readonly unknown[] = readonly unknown[]>(
  queryName: string,
  options: UseQueryOptions<TQueryFnData, TError, TData, TQueryKey>
): UseQueryResult<TData, TError> {
  const query = useQuery(options);
  const startedAtRef = useRef<number | null>(options.enabled === false ? null : nowMs());
  const fetchKindRef = useRef<"initial" | "refresh">(query.dataUpdatedAt ? "refresh" : "initial");
  const cycleRef = useRef(0);

  useEffect(() => {
    if (options.enabled === false) {
      startedAtRef.current = null;
      return;
    }
    if (query.fetchStatus === "fetching" && startedAtRef.current == null) {
      cycleRef.current += 1;
      fetchKindRef.current = query.dataUpdatedAt ? "refresh" : "initial";
      startedAtRef.current = nowMs();
    }
  }, [options.enabled, query.dataUpdatedAt, query.fetchStatus]);

  useEffect(() => {
    if (options.enabled === false || startedAtRef.current == null) return;
    if (query.status !== "success" && query.status !== "error") return;
    const durationMs = Math.round(nowMs() - startedAtRef.current);
    startedAtRef.current = null;
    recordQueryTiming({
      queryName,
      durationMs,
      status: query.status,
      fetchKind: fetchKindRef.current,
      recordedAt: Date.now()
    });
    trackQueryLoadProfile({
      query_name: queryName,
      status: query.status,
      duration_ms: durationMs,
      fetch_kind: fetchKindRef.current,
      query_cycle: cycleRef.current
    });
  }, [options.enabled, query.status, queryName]);

  return query;
}

export function useOverview(
  enabled = true,
  options?: {
    refetchInterval?: number | false;
    staleTime?: number;
  }
) {
  const tokenVersion = useSessionVersion();
  return useProfiledQuery("overview", {
    queryKey: ["overview", tokenVersion],
    queryFn: fetchOverview,
    enabled,
    refetchInterval: options?.refetchInterval ?? 10_000,
    staleTime: options?.staleTime
  });
}

export function useHeaderMarketSummary(enabled = true) {
  const tokenVersion = useSessionVersion();
  return useProfiledQuery("header-market-summary", {
    queryKey: ["header-market-summary", tokenVersion],
    queryFn: fetchHeaderMarketSummary,
    enabled,
    refetchInterval: 30_000,
    staleTime: 10_000
  });
}

export function useLeaderboard(limit = 25, enabled = true) {
  const tokenVersion = useSessionVersion();
  return useProfiledQuery(`leaderboard:${limit}`, {
    queryKey: ["leaderboard", limit, tokenVersion],
    queryFn: () => fetchLeaderboard(limit),
    enabled,
    refetchInterval: 10_000
  });
}

export function useStock(symbol: string, range: "1D" | "5D" | "1M" | "6M" | "1Y", enabled = true) {
  const tokenVersion = useSessionVersion();
  return useProfiledQuery(`stock:${symbol}:${range}`, {
    queryKey: ["stock", symbol, range, tokenVersion],
    queryFn: () => fetchStock(symbol, range),
    enabled: enabled && !!symbol && !!range,
    refetchInterval: range === "1D" ? 10_000 : 30_000
  });
}

export function useOiisCandidateContext(symbol: string, enabled = true) {
  const tokenVersion = useSessionVersion();
  return useProfiledQuery(`oiis-candidate-context:${symbol}`, {
    queryKey: ["oiis-candidate-context", symbol, tokenVersion],
    queryFn: () => fetchOiisCandidateContext(symbol),
    enabled: enabled && !!symbol,
    refetchInterval: 30_000
  });
}

export function useRsiSurface(enabled = true) {
  const tokenVersion = useSessionVersion();
  return useProfiledQuery("rsi-surface", {
    queryKey: ["rsi-surface", tokenVersion],
    queryFn: () => fetchRsiSurface(),
    enabled,
    refetchInterval: 60_000,
    placeholderData: keepPreviousData
  });
}

export function useChangeHeatmap(enabled = true) {
  const tokenVersion = useSessionVersion();
  return useProfiledQuery("change-heatmap", {
    queryKey: ["change-heatmap", tokenVersion],
    queryFn: () => fetchChangeHeatmap(),
    enabled,
    refetchInterval: 60_000,
    placeholderData: keepPreviousData
  });
}

export function useWillSurface(enabled = true) {
  const tokenVersion = useSessionVersion();
  return useProfiledQuery("will-surface", {
    queryKey: ["will-surface", tokenVersion],
    queryFn: () => fetchWillSurface(),
    enabled,
    refetchInterval: 60_000,
    placeholderData: keepPreviousData
  });
}

export function useAnalyticsDashboard(enabled = true) {
  const tokenVersion = useSessionVersion();
  return useProfiledQuery("analytics-dashboard", {
    queryKey: ["analytics-dashboard", tokenVersion],
    queryFn: fetchAnalyticsDashboard,
    enabled,
    refetchInterval: 60_000
  });
}

export function useAnalyticsBoardBrief(enabled = true) {
  const tokenVersion = useSessionVersion();
  return useProfiledQuery("analytics-board-brief", {
    queryKey: ["analytics-board-brief", tokenVersion],
    queryFn: fetchAnalyticsBoardBrief,
    enabled,
    refetchInterval: 60_000,
    staleTime: 60_000,
    placeholderData: keepPreviousData
  });
}

export function useIndicatorEducation(slug: string, enabled = true) {
  const tokenVersion = useSessionVersion();
  return useProfiledQuery(`indicator-education:${slug}`, {
    queryKey: ["indicator-education", slug, tokenVersion],
    queryFn: () => fetchIndicatorEducation(slug),
    enabled: enabled && !!slug,
    refetchInterval: 5 * 60_000,
    staleTime: 2 * 60_000
  });
}

export function useIndicatorStrategySnapshot(slug: string, scenarioId: string, enabled = true) {
  const tokenVersion = useSessionVersion();
  return useProfiledQuery(`indicator-strategy-snapshot:${slug}:${scenarioId}`, {
    queryKey: ["indicator-strategy-snapshot", slug, scenarioId, tokenVersion],
    queryFn: () => fetchIndicatorStrategySnapshot(slug, scenarioId),
    enabled: enabled && !!slug && !!scenarioId,
    refetchInterval: 5 * 60_000,
    staleTime: 2 * 60_000,
    placeholderData: keepPreviousData
  });
}

export function useAnalyticsFlows(enabled = true) {
  const tokenVersion = useSessionVersion();
  return useProfiledQuery("analytics-flows", {
    queryKey: ["analytics-flows", tokenVersion],
    queryFn: fetchAnalyticsFlows,
    enabled,
    refetchInterval: 60_000
  });
}

export function useAnalyticsEvents(enabled = true) {
  const tokenVersion = useSessionVersion();
  return useProfiledQuery("analytics-events", {
    queryKey: ["analytics-events", tokenVersion],
    queryFn: fetchAnalyticsEvents,
    enabled,
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
    placeholderData: keepPreviousData
  });
}

export function useAnalyticsEventContext(enabled = true) {
  const tokenVersion = useSessionVersion();
  return useProfiledQuery("analytics-event-context", {
    queryKey: ["analytics-event-context", tokenVersion],
    queryFn: fetchAnalyticsEventContext,
    enabled,
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
    placeholderData: keepPreviousData
  });
}

export function useAnalyticsLeadership(enabled = true) {
  const tokenVersion = useSessionVersion();
  return useProfiledQuery("analytics-leadership", {
    queryKey: ["analytics-leadership", tokenVersion],
    queryFn: fetchAnalyticsLeadership,
    enabled,
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
    placeholderData: keepPreviousData
  });
}

export function useAnalyticsDailySetups(enabled = true) {
  const tokenVersion = useSessionVersion();
  return useProfiledQuery("analytics-daily-setups", {
    queryKey: ["analytics-daily-setups", tokenVersion],
    queryFn: fetchAnalyticsDailySetups,
    enabled,
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
    placeholderData: keepPreviousData
  });
}

export function useAnalyticsFiiFlow(enabled = true) {
  const tokenVersion = useSessionVersion();
  return useProfiledQuery("analytics-fii-flow", {
    queryKey: ["analytics-fii-flow", tokenVersion],
    queryFn: fetchAnalyticsFiiFlow,
    enabled,
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
    placeholderData: keepPreviousData
  });
}

export function useAnalyticsMarketState(enabled = true) {
  const tokenVersion = useSessionVersion();
  return useProfiledQuery("analytics-market-state", {
    queryKey: ["analytics-market-state", tokenVersion],
    queryFn: fetchAnalyticsMarketState,
    enabled,
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
    placeholderData: keepPreviousData
  });
}

export function useAnalyticsOptionsStructure(enabled = true) {
  const tokenVersion = useSessionVersion();
  return useProfiledQuery("analytics-options-structure", {
    queryKey: ["analytics-options-structure", tokenVersion],
    queryFn: fetchAnalyticsOptionsStructure,
    enabled,
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
    placeholderData: keepPreviousData
  });
}

export function useAnalyticsStrategyEvaluation(enabled = true) {
  const tokenVersion = useSessionVersion();
  return useProfiledQuery("analytics-strategy-evaluation", {
    queryKey: ["analytics-strategy-evaluation", tokenVersion],
    queryFn: fetchAnalyticsStrategyEvaluation,
    enabled,
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
    placeholderData: keepPreviousData
  });
}

export function useFiiReportsRuns(enabled = true) {
  const tokenVersion = useSessionVersion();
  return useProfiledQuery("fii-reports-runs", {
    queryKey: ["fii-reports-runs", tokenVersion],
    queryFn: fetchFiiReportsRuns,
    enabled,
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
    placeholderData: keepPreviousData
  });
}

export function useFiiReportsRunDetail(kind: "daily" | "backfill", runId: string, enabled = true) {
  const tokenVersion = useSessionVersion();
  return useProfiledQuery(`fii-reports-run-detail:${kind}:${runId}`, {
    queryKey: ["fii-reports-run-detail", kind, runId, tokenVersion],
    queryFn: () => fetchFiiReportsRunDetail(kind, runId),
    enabled: enabled && !!kind && !!runId,
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
    placeholderData: keepPreviousData
  });
}

export function useAnalyticsQuality(enabled = true) {
  const tokenVersion = useSessionVersion();
  return useProfiledQuery("analytics-quality", {
    queryKey: ["analytics-quality", tokenVersion],
    queryFn: fetchAnalyticsQuality,
    enabled,
    refetchInterval: 60_000
  });
}

export function useSupportingMetrics(enabled = true) {
  const tokenVersion = useSessionVersion();
  return useProfiledQuery("analytics-supporting-metrics", {
    queryKey: ["analytics-supporting-metrics", tokenVersion],
    queryFn: fetchSupportingMetrics,
    enabled,
    refetchInterval: 90_000,
    placeholderData: keepPreviousData
  });
}

export function useAnalyticsSimulatorUniverse(enabled = true) {
  const tokenVersion = useSessionVersion();
  return useProfiledQuery("analytics-simulator-universe", {
    queryKey: ["analytics-simulator-universe", tokenVersion],
    queryFn: fetchAnalyticsSimulatorUniverse,
    enabled,
    staleTime: 5 * 60_000
  });
}

export function useAnalyticsSimulator(query: AnalyticsSimulatorQuery, enabled = true) {
  const tokenVersion = useSessionVersion();
  return useProfiledQuery(`analytics-simulator:${query.symbol}:${query.instrumentType}`, {
    queryKey: ["analytics-simulator", query, tokenVersion],
    queryFn: () => fetchAnalyticsSimulator(query),
    enabled: enabled && !!query.symbol,
    refetchInterval: false,
    staleTime: 15 * 60_000,
    gcTime: 30 * 60_000,
    placeholderData: keepPreviousData
  });
}

export function useBacktestingOverview(enabled = true) {
  const tokenVersion = useSessionVersion();
  return useProfiledQuery("backtesting-overview", {
    queryKey: ["backtesting-overview", tokenVersion],
    queryFn: fetchBacktestingOverview,
    enabled,
    refetchInterval: 5 * 60_000,
    staleTime: 60_000
  });
}

export function useBacktestingStrategies(enabled = true) {
  const tokenVersion = useSessionVersion();
  return useProfiledQuery("backtesting-strategies", {
    queryKey: ["backtesting-strategies", tokenVersion],
    queryFn: fetchBacktestingStrategies,
    enabled,
    refetchInterval: 5 * 60_000,
    staleTime: 60_000
  });
}

export function useBacktestingStrategy(strategyId: string, scenarioKey?: string | null, enabled = true) {
  const tokenVersion = useSessionVersion();
  return useProfiledQuery(`backtesting-strategy:${strategyId}:${scenarioKey ?? "default"}`, {
    queryKey: ["backtesting-strategy", strategyId, scenarioKey ?? "default", tokenVersion],
    queryFn: () => fetchBacktestingStrategy(strategyId, scenarioKey),
    enabled: enabled && !!strategyId,
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
    placeholderData: keepPreviousData
  });
}

export function useBacktestingDailySummary(enabled = true) {
  const tokenVersion = useSessionVersion();
  return useProfiledQuery("backtesting-daily-summary", {
    queryKey: ["backtesting-daily-summary", tokenVersion],
    queryFn: fetchBacktestingDailySummary,
    enabled,
    refetchInterval: 5 * 60_000,
    staleTime: 60_000
  });
}

export function useBacktestingCompare(enabled = true) {
  const tokenVersion = useSessionVersion();
  return useProfiledQuery("backtesting-compare", {
    queryKey: ["backtesting-compare", tokenVersion],
    queryFn: fetchBacktestingCompare,
    enabled,
    refetchInterval: 5 * 60_000,
    staleTime: 60_000
  });
}

export function useBacktestingRuns(enabled = true) {
  const tokenVersion = useSessionVersion();
  return useProfiledQuery("backtesting-runs", {
    queryKey: ["backtesting-runs", tokenVersion],
    queryFn: fetchBacktestingRuns,
    enabled,
    refetchInterval: 5 * 60_000,
    staleTime: 60_000
  });
}

export function useDashboardSummary(enabled = true) {
  const tokenVersion = useSessionVersion();
  return useProfiledQuery("dashboard-summary", {
    queryKey: ["dashboard-summary", tokenVersion],
    queryFn: fetchDashboardSummary,
    enabled,
    refetchInterval: 60_000,
    placeholderData: keepPreviousData
  });
}

export function useDashboardSection(sectionSlug: string, enabled = true) {
  const tokenVersion = useSessionVersion();
  return useProfiledQuery(`dashboard-section:${sectionSlug}`, {
    queryKey: ["dashboard-section", sectionSlug, tokenVersion],
    queryFn: () => fetchDashboardSection(sectionSlug),
    enabled: enabled && !!sectionSlug,
    refetchInterval: 60_000,
    placeholderData: keepPreviousData
  });
}

export function useWatchlists(enabled = true) {
  const tokenVersion = useSessionVersion();
  return useProfiledQuery("watchlists", {
    queryKey: ["watchlists", tokenVersion],
    queryFn: fetchWatchlists,
    enabled,
    refetchInterval: 60_000,
    placeholderData: keepPreviousData
  });
}

export function useWatchlist(slug: string, enabled = true) {
  const tokenVersion = useSessionVersion();
  return useProfiledQuery(`watchlist:${slug}`, {
    queryKey: ["watchlist", slug, tokenVersion],
    queryFn: () => fetchWatchlist(slug),
    enabled: enabled && !!slug,
    refetchInterval: 60_000,
    placeholderData: keepPreviousData
  });
}

export function useWatchlistHistory(slug: string, days = 30, enabled = true) {
  const tokenVersion = useSessionVersion();
  return useProfiledQuery(`watchlist-history:${slug}:${days}`, {
    queryKey: ["watchlist-history", slug, days, tokenVersion],
    queryFn: () => fetchWatchlistHistory(slug, days),
    enabled: enabled && !!slug,
    refetchInterval: 60_000,
    placeholderData: keepPreviousData
  });
}

export function useOpsRuns(limit = 20, enabled = true) {
  const tokenVersion = useSessionVersion();
  return useProfiledQuery(`ops-runs:${limit}`, {
    queryKey: ["ops-runs", limit, tokenVersion],
    queryFn: () => fetchOpsRuns(limit),
    enabled,
    refetchInterval: 60_000,
    placeholderData: keepPreviousData
  });
}

export function useOpsQuality(limit = 20, enabled = true) {
  const tokenVersion = useSessionVersion();
  return useProfiledQuery(`ops-quality:${limit}`, {
    queryKey: ["ops-quality", limit, tokenVersion],
    queryFn: () => fetchOpsQuality(limit),
    enabled,
    refetchInterval: 60_000,
    placeholderData: keepPreviousData
  });
}

export function useExportManifest(limit = 20, enabled = true) {
  const tokenVersion = useSessionVersion();
  return useProfiledQuery(`export-manifest:${limit}`, {
    queryKey: ["export-manifest", limit, tokenVersion],
    queryFn: () => fetchExportManifest(limit),
    enabled,
    refetchInterval: 60_000,
    placeholderData: keepPreviousData
  });
}

export function useIntradayAnalyticsSummary(enabled = true) {
  const tokenVersion = useSessionVersion();
  return useProfiledQuery("intraday-analytics-summary", {
    queryKey: ["intraday-analytics-summary", tokenVersion],
    queryFn: fetchIntradayAnalyticsSummary,
    enabled,
    refetchInterval: 60_000,
    placeholderData: keepPreviousData
  });
}

export function useIntradayAnalyticsStock(symbol: string, enabled = true) {
  const tokenVersion = useSessionVersion();
  return useProfiledQuery(`intraday-analytics-stock:${symbol}`, {
    queryKey: ["intraday-analytics-stock", symbol, tokenVersion],
    queryFn: () => fetchIntradayAnalyticsStock(symbol),
    enabled: enabled && !!symbol,
    refetchInterval: 60_000
  });
}

function normalizeIncoming(raw: unknown): LiveQuote | null {
  if (!raw || typeof raw !== "object") return null;
  const envelope = raw as Record<string, unknown>;
  const nestedData = envelope.type === "quote" && typeof envelope.data === "object" && envelope.data ? envelope.data : raw;
  const data = nestedData as Record<string, unknown>;
  if (!data || typeof data !== "object") return null;
  const symbol = String(data.symbol ?? "").toUpperCase();
  if (!symbol) return null;
  const price = Number(data.price ?? data.last);
  const rawChange = data.change ?? data.delta ?? data.netChange;
  const rawChangePct = data.changePct ?? data.change_pct ?? data.percentChange ?? data.pct_change;
  const parsedChange = Number(rawChange);
  let parsedChangePct = Number(rawChangePct);

  if (!Number.isFinite(parsedChangePct) && Number.isFinite(parsedChange)) {
    const previousClose = price - parsedChange;
    if (Math.abs(previousClose) > 1e-9) {
      parsedChangePct = (parsedChange / previousClose) * 100;
    }
  }

  let change = parsedChange;
  if (!Number.isFinite(change) && Number.isFinite(parsedChangePct)) {
    const denominator = 100 + parsedChangePct;
    if (Math.abs(denominator) > 1e-9) {
      change = (price * parsedChangePct) / denominator;
    }
  }
  const timestamp = String(data.timestamp ?? data.ts ?? new Date().toISOString());
  if (!Number.isFinite(price)) return null;
  return {
    symbol,
    price,
    change: Number.isFinite(change) ? change : 0,
    changePct: Number.isFinite(parsedChangePct) ? parsedChangePct : 0,
    timestamp
  };
}

export type LiveQuoteFeedState = {
  quotes: Record<string, LiveQuote>;
  transport: "CONNECTED" | "RECONNECTING" | "DISCONNECTED";
  lastReceivedAt?: string;
  sequence?: number;
  gapDetected: boolean;
};

export function useLiveQuotesWithStatus(symbols: string[], enabled = true): LiveQuoteFeedState {
  const [quotes, setQuotes] = useState<Record<string, LiveQuote>>({});
  const [transport, setTransport] = useState<LiveQuoteFeedState["transport"]>("DISCONNECTED");
  const [lastReceivedAt, setLastReceivedAt] = useState<string>();
  const [sequence, setSequence] = useState<number>();
  const [gapDetected, setGapDetected] = useState(false);
  const tokenVersion = useSessionVersion();
  const key = useMemo(
    () => [...new Set(symbols.map((s) => s.toUpperCase().trim()).filter(Boolean))].sort().join(","),
    [symbols]
  );

  useEffect(() => {
    if (!key || !enabled) return;

    let cancelled = false;
    let ws: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let reconnectAttempts = 0;
    let previousSequence: number | undefined;
    let recoveringFromGap = false;

    const connect = async () => {
      setTransport(reconnectAttempts > 0 ? "RECONNECTING" : "DISCONNECTED");
      const sessionResp = await fetch(`${API_BASE_URL}/auth/session`, {
        credentials: "include",
        headers: { Accept: "application/json" }
      }).catch(() => null);
      if (!sessionResp?.ok || cancelled) return;
      const session = (await sessionResp.json().catch(() => null)) as { authenticated?: boolean } | null;
      if (!session?.authenticated || cancelled) return;

      const wsBase = getWsBaseUrl();
      const url = `${wsBase}/v1/stream?symbols=${encodeURIComponent(key)}`;

      if (cancelled) return;
      ws = new WebSocket(url);
      ws.onopen = () => {
        reconnectAttempts = 0;
        previousSequence = undefined;
        setTransport("CONNECTED");
      };
      ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          const envelope = parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : null;
          const incomingSequence = Number(envelope?.sequence);
          if (Number.isFinite(incomingSequence)) {
            if (previousSequence != null && incomingSequence > previousSequence + 1) {
              recoveringFromGap = true;
              setGapDetected(true);
              ws?.close();
              return;
            }
            if (previousSequence == null || incomingSequence >= previousSequence) {
              previousSequence = incomingSequence;
              setSequence(incomingSequence);
            }
          }
          const live = normalizeIncoming(parsed);
          if (!live) return;
          if (recoveringFromGap) {
            recoveringFromGap = false;
            setGapDetected(false);
          }
          setLastReceivedAt(new Date().toISOString());
          setQuotes((prev) => ({ ...prev, [live.symbol]: live }));
        } catch {
          // Ignore malformed messages.
        }
      };
      ws.onclose = () => {
        if (cancelled) return;
        reconnectAttempts += 1;
        setTransport("RECONNECTING");
        const delay = Math.min(30_000, 1_000 * (2 ** Math.min(reconnectAttempts - 1, 5)));
        reconnectTimer = window.setTimeout(() => { void connect(); }, delay);
      };
      ws.onerror = () => ws?.close();
    };

    void connect();

    return () => {
      cancelled = true;
      if (reconnectTimer != null) window.clearTimeout(reconnectTimer);
      ws?.close();
      setTransport("DISCONNECTED");
    };
  }, [enabled, key, tokenVersion]);

  return { quotes, transport, lastReceivedAt, sequence, gapDetected };
}

export function useLiveQuotes(symbols: string[], enabled = true) {
  return useLiveQuotesWithStatus(symbols, enabled).quotes;
}
