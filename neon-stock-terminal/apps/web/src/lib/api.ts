import type {
  AnalyticsBoardBriefResponse,
  AnalyticsDashboardResponse,
  AnalyticsDailySetupsResponse,
  AnalyticsEventContextResponse,
  AnalyticsEventsResponse,
  AnalyticsFiiFlowResponse,
  AnalyticsLeadershipResponse,
  AnalyticsMarketStateResponse,
  AnalyticsOptionsStructureResponse,
  AnalyticsStrategyEvaluationResponse,
  FiiReportsRunDetailResponse,
  FiiReportsRunsResponse,
  AnalyticsFlowsResponse,
  AnalyticsQualityResponse,
  SupportingMetricsResponse,
  IndicatorEducationResponse,
  IndicatorStrategyScenario,
  AnalyticsSimulatorResponse,
  AnalyticsSimulatorUniverseResponse,
  BacktestingCompareResponse,
  BacktestingDailySummaryResponse,
  BacktestingOverviewResponse,
  BacktestingRunsResponse,
  BacktestingStrategyDetailResponse,
  BacktestingStrategiesResponse,
  ChangeHeatmapResponse,
  DashboardSectionPayload,
  DashboardSummaryPayload,
  ExportManifestPayload,
  IntradayAnalyticsStockPayload,
  IntradayAnalyticsSummaryPayload,
  LeaderboardResponse,
  OpsQualityPayload,
  OptionChainAnalyticsResponse,
  OptionChainLatestResponse,
  OptionChainSeriesResponse,
  OpsRunsPayload,
  OverviewResponse,
  RsiSurfaceResponse,
  StockDetailResponse,
  WillSurfaceResponse,
  WatchlistHistoryPayload,
  WatchlistPayload,
  WatchlistsPayload
} from "./types";
import { trackAnalyticsError } from "./analytics";

const FALLBACK_API_BASE = "";
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? FALLBACK_API_BASE;

function shouldPreserveGatewayPath(path: string): boolean {
  return (
    path.startsWith("/api/v1/dashboard/") ||
    path.startsWith("/api/v1/watchlists") ||
    path.startsWith("/api/v1/ops/") ||
    path.startsWith("/api/v1/exports/") ||
    path.startsWith("/api/v1/intraday/")
  );
}

function resolveApiPath(path: string): string {
  if (!API_BASE_URL) return path;
  if (shouldPreserveGatewayPath(path)) return path;
  return path.startsWith("/api/v1/") ? path.replace("/api/v1/", "/v1/") : path;
}

async function getJson<T>(path: string): Promise<T> {
  const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
  const headers: Record<string, string> = {
    Accept: "application/json"
  };
  const resolvedPath = resolveApiPath(path);

  try {
    const res = await fetch(`${API_BASE_URL}${resolvedPath}`, {
      headers,
      credentials: "include"
    });
    const durationMs = Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt);
    if (!res.ok) {
      if ((res.status === 401 || res.status === 403) && typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("n50:auth-required", { detail: { status: res.status, path } }));
      }
      const text = await res.text();
      void trackAnalyticsError({
        type: "api_error",
        severity: "warning",
        path: resolvedPath,
        http_status: res.status,
        duration_ms: durationMs,
        message: text.slice(0, 240)
      });
      throw new Error(`API ${res.status}: ${text}`);
    }
    if (durationMs >= 1200) {
      void trackAnalyticsError({
        type: "slow_api_request",
        severity: "info",
        path: resolvedPath,
        duration_ms: durationMs,
        http_status: res.status
      });
    }
    return (await res.json()) as T;
  } catch (error) {
    void trackAnalyticsError({
      type: "api_request_failed",
      severity: "error",
      path: resolvedPath,
      duration_ms: Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt),
      message: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}

async function getRootJson<T>(path: string): Promise<T> {
  const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
  const headers: Record<string, string> = {
    Accept: "application/json"
  };

  try {
    const res = await fetch(path, {
      headers,
      credentials: "include"
    });
    const durationMs = Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt);
    if (!res.ok) {
      const text = await res.text();
      void trackAnalyticsError({
        type: "api_error",
        severity: "warning",
        path,
        http_status: res.status,
        duration_ms: durationMs,
        message: text.slice(0, 240)
      });
      throw new Error(`API ${res.status}: ${text}`);
    }
    if (durationMs >= 1200) {
      void trackAnalyticsError({
        type: "slow_api_request",
        severity: "info",
        path,
        duration_ms: durationMs,
        http_status: res.status
      });
    }
    return (await res.json()) as T;
  } catch (error) {
    void trackAnalyticsError({
      type: "api_request_failed",
      severity: "error",
      path,
      duration_ms: Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt),
      message: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}

export function fetchOverview(): Promise<OverviewResponse> {
  return getJson<OverviewResponse>("/v1/overview");
}

export type OiisLiveDashboard = {
  environment: "PAPER";
  policyId: string;
  tradeDate: string | null;
  availableDates: Array<{ trade_date: string }>;
  watchlist: Array<Record<string, any>>;
  entries: Array<Record<string, any>>;
  runs: Array<Record<string, any>>;
  diagnostics: Array<Record<string, any>>;
  errors: Array<Record<string, any>>;
  paper: Array<Record<string, any>>;
  freshness: Record<string, any>;
  queues: Record<string, any>;
};

export function fetchOiisLiveDashboard(tradeDate?: string): Promise<OiisLiveDashboard> {
  return getJson<OiisLiveDashboard>(`/v1/oiis-live/dashboard${tradeDate ? `?tradeDate=${encodeURIComponent(tradeDate)}` : ""}`);
}

export async function mutateOiisLive(path: string, method: "POST" | "PATCH" | "DELETE", body?: unknown) {
  const resolvedPath = resolveApiPath(`/v1/oiis-live${path}`);
  const response = await fetch(`${API_BASE_URL}${resolvedPath}`, {
    method,
    credentials: "include",
    headers: body == null ? undefined : { "Content-Type": "application/json" },
    body: body == null ? undefined : JSON.stringify(body)
  });
  if (!response.ok) throw new Error(`API ${response.status}: ${await response.text()}`);
  return response.status === 204 ? null : response.json();
}

export function fetchLeaderboard(limit = 25): Promise<LeaderboardResponse> {
  return getJson<LeaderboardResponse>(`/v1/leaderboard?limit=${encodeURIComponent(String(limit))}`);
}

export function fetchStock(symbol: string, range: "1D" | "5D" | "1M" | "6M" | "1Y"): Promise<StockDetailResponse> {
  return getJson<StockDetailResponse>(
    `/v1/stocks/${encodeURIComponent(symbol)}?range=${encodeURIComponent(range)}`
  );
}

export function fetchRsiSurface(): Promise<RsiSurfaceResponse> {
  return getJson<RsiSurfaceResponse>("/v1/rsi-surface");
}

export function fetchChangeHeatmap(): Promise<ChangeHeatmapResponse> {
  return getJson<ChangeHeatmapResponse>("/v1/change-heatmap");
}

export function fetchWillSurface(): Promise<WillSurfaceResponse> {
  return getJson<WillSurfaceResponse>("/v1/will-surface");
}

export function fetchAnalyticsDashboard(): Promise<AnalyticsDashboardResponse> {
  return getJson<AnalyticsDashboardResponse>("/v1/analytics/dashboard");
}

export function fetchAnalyticsBoardBrief(): Promise<AnalyticsBoardBriefResponse> {
  return getJson<AnalyticsBoardBriefResponse>("/v1/analytics/board-brief");
}

export function fetchIndicatorEducation(slug: string): Promise<IndicatorEducationResponse> {
  return getJson<IndicatorEducationResponse>(`/v1/analytics/indicators/${encodeURIComponent(slug)}`);
}

export function fetchIndicatorStrategySnapshot(slug: string, scenarioId: string): Promise<IndicatorStrategyScenario> {
  return getJson<IndicatorStrategyScenario>(
    `/v1/analytics/indicators/${encodeURIComponent(slug)}/strategies/${encodeURIComponent(scenarioId)}`
  );
}

export function fetchAnalyticsFlows(): Promise<AnalyticsFlowsResponse> {
  return getJson<AnalyticsFlowsResponse>("/v1/analytics/flows");
}

export function fetchAnalyticsEvents(): Promise<AnalyticsEventsResponse> {
  return getJson<AnalyticsEventsResponse>("/v1/analytics/events");
}

export function fetchAnalyticsEventContext(): Promise<AnalyticsEventContextResponse> {
  return getJson<AnalyticsEventContextResponse>("/v1/analytics/event-context");
}

export function fetchAnalyticsLeadership(): Promise<AnalyticsLeadershipResponse> {
  return getJson<AnalyticsLeadershipResponse>("/v1/analytics/leadership");
}

export function fetchAnalyticsDailySetups(): Promise<AnalyticsDailySetupsResponse> {
  return getJson<AnalyticsDailySetupsResponse>("/v1/analytics/daily-setups");
}

export function fetchAnalyticsFiiFlow(): Promise<AnalyticsFiiFlowResponse> {
  return getJson<AnalyticsFiiFlowResponse>("/v1/analytics/fii-flow");
}

export function fetchAnalyticsMarketState(): Promise<AnalyticsMarketStateResponse> {
  return getJson<AnalyticsMarketStateResponse>("/v1/analytics/market-state");
}

export function fetchAnalyticsOptionsStructure(): Promise<AnalyticsOptionsStructureResponse> {
  return getJson<AnalyticsOptionsStructureResponse>("/v1/analytics/options-structure");
}

export function fetchAnalyticsStrategyEvaluation(): Promise<AnalyticsStrategyEvaluationResponse> {
  return getJson<AnalyticsStrategyEvaluationResponse>("/v1/analytics/strategy-evaluation");
}

export function fetchFiiReportsRuns(): Promise<FiiReportsRunsResponse> {
  return getJson<FiiReportsRunsResponse>("/v1/fii-reports/runs");
}

export function fetchFiiReportsRunDetail(kind: "daily" | "backfill", runId: string): Promise<FiiReportsRunDetailResponse> {
  return getJson<FiiReportsRunDetailResponse>(`/v1/fii-reports/runs/${encodeURIComponent(kind)}/${encodeURIComponent(runId)}`);
}

export function fetchAnalyticsQuality(): Promise<AnalyticsQualityResponse> {
  return getJson<AnalyticsQualityResponse>("/v1/analytics/quality");
}

export function fetchSupportingMetrics(): Promise<SupportingMetricsResponse> {
  return getJson<SupportingMetricsResponse>("/v1/analytics/supporting-metrics");
}

export type AnalyticsSimulatorQuery = {
  symbol: string;
  instrumentType?: "equity" | "index" | "";
  lotAmount: number;
  dipPct: number;
  targetPct: number;
  fdRatePct: number;
  lookbackDays: number;
  capitalCaps: string;
  includeInfinite: boolean;
};

export function fetchAnalyticsSimulatorUniverse(): Promise<AnalyticsSimulatorUniverseResponse> {
  return getJson<AnalyticsSimulatorUniverseResponse>("/v1/analytics/simulator/universe");
}

export function fetchAnalyticsSimulator(query: AnalyticsSimulatorQuery): Promise<AnalyticsSimulatorResponse> {
  const params = new URLSearchParams();
  params.set("symbol", query.symbol);
  if (query.instrumentType) params.set("instrument_type", query.instrumentType);
  params.set("lot_amount", String(query.lotAmount));
  params.set("dip_pct", String(query.dipPct));
  params.set("target_pct", String(query.targetPct));
  params.set("fd_rate_pct", String(query.fdRatePct));
  params.set("lookback_days", String(query.lookbackDays));
  params.set("capital_caps", query.capitalCaps);
  params.set("include_infinite", query.includeInfinite ? "true" : "false");
  return getJson<AnalyticsSimulatorResponse>(`/v1/analytics/simulator?${params.toString()}`);
}

export function fetchBacktestingOverview(): Promise<BacktestingOverviewResponse> {
  return getJson<BacktestingOverviewResponse>("/v1/backtesting/overview");
}

export function fetchBacktestingStrategies(): Promise<BacktestingStrategiesResponse> {
  return getJson<BacktestingStrategiesResponse>("/v1/backtesting/strategies");
}

export function fetchBacktestingStrategy(strategyId: string, scenarioKey?: string | null): Promise<BacktestingStrategyDetailResponse> {
  const params = new URLSearchParams();
  if (scenarioKey) params.set("scenario", scenarioKey);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return getJson<BacktestingStrategyDetailResponse>(`/v1/backtesting/strategies/${encodeURIComponent(strategyId)}${suffix}`);
}

export function fetchBacktestingDailySummary(): Promise<BacktestingDailySummaryResponse> {
  return getJson<BacktestingDailySummaryResponse>("/v1/backtesting/daily-summary");
}

export function fetchBacktestingCompare(): Promise<BacktestingCompareResponse> {
  return getJson<BacktestingCompareResponse>("/v1/backtesting/compare");
}

export function fetchBacktestingRuns(): Promise<BacktestingRunsResponse> {
  return getJson<BacktestingRunsResponse>("/v1/backtesting/runs");
}

export function fetchDashboardSummary(): Promise<DashboardSummaryPayload> {
  return getJson<DashboardSummaryPayload>("/api/v1/dashboard/summary");
}

export function fetchDashboardSection(sectionSlug: string): Promise<DashboardSectionPayload> {
  return getJson<DashboardSectionPayload>(`/api/v1/dashboard/sections/${encodeURIComponent(sectionSlug)}`);
}

export function fetchWatchlists(): Promise<WatchlistsPayload> {
  return getJson<WatchlistsPayload>("/api/v1/watchlists");
}

export function fetchWatchlist(slug: string): Promise<WatchlistPayload> {
  return getJson<WatchlistPayload>(`/api/v1/watchlists/${encodeURIComponent(slug)}`);
}

export function fetchWatchlistHistory(slug: string, days = 30): Promise<WatchlistHistoryPayload> {
  return getJson<WatchlistHistoryPayload>(
    `/api/v1/watchlists/${encodeURIComponent(slug)}/history?days=${encodeURIComponent(String(days))}`
  );
}

export function fetchOpsRuns(limit = 20): Promise<OpsRunsPayload> {
  return getJson<OpsRunsPayload>(`/api/v1/ops/runs?limit=${encodeURIComponent(String(limit))}`);
}

export function fetchOpsQuality(limit = 20): Promise<OpsQualityPayload> {
  return getJson<OpsQualityPayload>(`/api/v1/ops/quality?limit=${encodeURIComponent(String(limit))}`);
}

export function fetchExportManifest(limit = 20): Promise<ExportManifestPayload> {
  return getJson<ExportManifestPayload>(`/api/v1/exports/manifest?limit=${encodeURIComponent(String(limit))}`);
}

export function fetchIntradayAnalyticsSummary(): Promise<IntradayAnalyticsSummaryPayload> {
  return getJson<IntradayAnalyticsSummaryPayload>("/api/v1/intraday/summary");
}

export function fetchIntradayAnalyticsStock(symbol: string): Promise<IntradayAnalyticsStockPayload> {
  return getJson<IntradayAnalyticsStockPayload>(`/api/v1/intraday/stocks/${encodeURIComponent(symbol)}`);
}

export function fetchOptionChainLatest(compareMinutes?: number): Promise<OptionChainLatestResponse> {
  const params = new URLSearchParams();
  if (Number.isFinite(compareMinutes)) {
    params.set("compareMinutes", String(compareMinutes));
  }
  const suffix = params.size ? `?${params.toString()}` : "";
  return getRootJson<OptionChainLatestResponse>(`/option-chain/api/latest${suffix}`);
}

export function fetchOptionChainSeries(minutes = 120): Promise<OptionChainSeriesResponse> {
  const params = new URLSearchParams();
  params.set("minutes", String(minutes));
  return getRootJson<OptionChainSeriesResponse>(`/option-chain/api/series?${params.toString()}`);
}

export function fetchOptionChainAnalytics(params: {
  expiry?: string | null;
  minutes?: number;
  compareMinutes?: number;
  strikesAround?: number;
} = {}): Promise<OptionChainAnalyticsResponse> {
  const query = new URLSearchParams();
  if (params.expiry) query.set("expiry", params.expiry);
  if (Number.isFinite(params.minutes)) query.set("minutes", String(params.minutes));
  if (Number.isFinite(params.compareMinutes)) query.set("compareMinutes", String(params.compareMinutes));
  if (Number.isFinite(params.strikesAround)) query.set("strikesAround", String(params.strikesAround));
  const suffix = query.size ? `?${query.toString()}` : "";
  return getRootJson<OptionChainAnalyticsResponse>(`/option-chain/api/analytics${suffix}`);
}

export function getWsBaseUrl() {
  const explicit = import.meta.env.VITE_WS_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  if (API_BASE_URL.startsWith("http://")) return API_BASE_URL.replace("http://", "ws://").replace(/\/$/, "");
  if (API_BASE_URL.startsWith("https://")) return API_BASE_URL.replace("https://", "wss://").replace(/\/$/, "");
  if (typeof window !== "undefined") {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${window.location.host}${API_BASE_URL}`.replace(/\/$/, "");
  }
  return "ws://localhost:8080";
}
