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
  HeaderMarketSummaryResponse,
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
  WatchlistsPayload,
} from "./types";
import { trackAnalyticsError } from "./analytics";
import { getSessionCsrfToken, refreshCsrfToken } from "./session";
import type { PaperTradeNotificationResponse } from "../components/chrome/paperTradeNotifications";

const FALLBACK_API_BASE = "";
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? FALLBACK_API_BASE;

export type NseIntelligenceResponse = {
  tradeDate: string | null;
  dataAsOf: string | null;
  generatedAt: string;
  timezone: "Asia/Kolkata";
  featureVersion: string;
  quality: {
    readiness: "READY" | "DEGRADED" | "BLOCKED" | "NO_DATA";
    jobStatus: string;
    requiredInputs: number;
    availableInputs: number;
    missingInputs: string[];
    allExpectedInputs: number;
    allAvailableInputs: number;
    missingReportCount: number;
  };
  ingestion: null | {
    jobId: number;
    jobDate: string;
    sourceTradeDate: string;
    scheduledFor: string;
    startedAt: string;
    finishedAt: string | null;
    status: string;
    rowsLoaded: number;
    notification: { status: string; sentAt: string | null; error: string | null };
  };
  market: null | {
    tradeDate: string;
    securities: number;
    advancers: number;
    decliners: number;
    unchanged: number;
    totalVolume: string | number | null;
    totalValue: string | number | null;
  };
  breadthTrend: Array<{ tradeDate: string; securities: number; advancers: number; decliners: number; unchanged: number; breadthPct: number | null; totalVolume: string | number | null; totalValue: string | number | null }>;
  movers: Array<{ tradeDate: string; symbol: string; name: string | null; close: string | number; previousClose: string | number; changePct: string | number; volume: string | number; tradedValue: string | number; direction: "GAINER" | "LOSER" }>;
  events: Array<{ reportDate: string; eventType: string; symbol: string | null; headline: string | null; detail: string; sourceFile: string | null; loadedAt: string }>;
  reports: Array<{ reportId: string; report: string; priority: "CORE" | "ANCILLARY"; requiredForCashOverview: boolean; status: string; sourceDate: string; fileName: string; checksum: string | null; bytes: number | null; rows: number | null; loadedAt: string | null; message: string | null }>;
  unavailableModules: Array<{ module: string; reason: string }>;
  sources: Array<{ schema: string; dataset: string; role: string }>;
};

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
  const startedAt =
    typeof performance !== "undefined" ? performance.now() : Date.now();
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  const resolvedPath = resolveApiPath(path);

  try {
    const res = await fetch(`${API_BASE_URL}${resolvedPath}`, {
      headers,
      credentials: "include",
    });
    const durationMs = Math.round(
      (typeof performance !== "undefined" ? performance.now() : Date.now()) -
        startedAt,
    );
    if (!res.ok) {
      if (
        (res.status === 401 || res.status === 403) &&
        typeof window !== "undefined"
      ) {
        window.dispatchEvent(
          new CustomEvent("n50:auth-required", {
            detail: { status: res.status, path },
          }),
        );
      }
      const text = await res.text();
      void trackAnalyticsError({
        type: "api_error",
        severity: "warning",
        path: resolvedPath,
        http_status: res.status,
        duration_ms: durationMs,
        message: text.slice(0, 240),
      });
      throw new Error(`API ${res.status}: ${text}`);
    }
    if (durationMs >= 1200) {
      void trackAnalyticsError({
        type: "slow_api_request",
        severity: "info",
        path: resolvedPath,
        duration_ms: durationMs,
        http_status: res.status,
      });
    }
    return (await res.json()) as T;
  } catch (error) {
    void trackAnalyticsError({
      type: "api_request_failed",
      severity: "error",
      path: resolvedPath,
      duration_ms: Math.round(
        (typeof performance !== "undefined" ? performance.now() : Date.now()) -
          startedAt,
      ),
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

async function getRootJson<T>(path: string): Promise<T> {
  const startedAt =
    typeof performance !== "undefined" ? performance.now() : Date.now();
  const headers: Record<string, string> = {
    Accept: "application/json",
  };

  try {
    const res = await fetch(path, {
      headers,
      credentials: "include",
    });
    const durationMs = Math.round(
      (typeof performance !== "undefined" ? performance.now() : Date.now()) -
        startedAt,
    );
    if (!res.ok) {
      const text = await res.text();
      void trackAnalyticsError({
        type: "api_error",
        severity: "warning",
        path,
        http_status: res.status,
        duration_ms: durationMs,
        message: text.slice(0, 240),
      });
      throw new Error(`API ${res.status}: ${text}`);
    }
    if (durationMs >= 1200) {
      void trackAnalyticsError({
        type: "slow_api_request",
        severity: "info",
        path,
        duration_ms: durationMs,
        http_status: res.status,
      });
    }
    return (await res.json()) as T;
  } catch (error) {
    void trackAnalyticsError({
      type: "api_request_failed",
      severity: "error",
      path,
      duration_ms: Math.round(
        (typeof performance !== "undefined" ? performance.now() : Date.now()) -
          startedAt,
      ),
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export type BacktestingLabParameterSpec = {
  type: "number" | "integer" | "boolean";
  minimum?: number;
  maximum?: number;
  step?: number;
  default: number | boolean;
  label: string;
};

export type BacktestingLabCatalogue = {
  environment: "RESEARCH_ONLY";
  engineVersion: string;
  evaluationPolicyVersion: string;
  strategies: Array<{
    strategyVersionId: string;
    strategyId: string;
    displayName: string;
    entryKind: string;
    plainEnglish: string;
    authoritativeExit: string;
    parameters: Record<string, BacktestingLabParameterSpec>;
  }>;
  sourceBatches: Array<{
    batchRunId: number;
    dataAsOfDate: string;
    generatedAt: string;
    dateStart: string;
    dateEnd: string;
    symbolCount: number;
  }>;
  limits: { maximumCalendarDays: number; maximumSymbols: number };
  ladders: Record<string, Array<number | string>>;
};

export type BacktestingLabRun = {
  runId?: string;
  run_id?: string;
  strategyVersionId?: string;
  strategy_version_id?: string;
  sourceBatchRunId?: number;
  source_batch_run_id?: number;
  requestedDateStart?: string;
  requested_date_start?: string;
  requestedDateEnd?: string;
  requested_date_end?: string;
  actualDateStart?: string | null;
  actualDateEnd?: string | null;
  universeMode?: string;
  symbols: string[];
  parameters: Record<string, number | boolean>;
  capital: Record<string, unknown>;
  status: string;
  validationStatus?: string;
  validation_status?: string;
  totalWorkUnits?: number;
  completedWorkUnits?: number;
  heartbeatAt?: string | null;
  summary: Record<string, number | string | boolean | null>;
  resultHash?: string | null;
  errorCode?: string | null;
  errorDetail?: string | null;
  error_detail?: string | null;
  createdAt?: string;
  created_at?: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  events?: Array<Record<string, unknown>>;
  artifacts?: Array<Record<string, unknown>>;
};

export type BacktestingLabTrade = Record<string, unknown> & {
  trade_id: string;
  symbol: string;
  sector: string;
  signal_date: string;
  entry_date: string;
  entry_price: string | number;
  execution_status: string;
  net_liquidation_pnl: string | number;
  maximum_favourable_excursion_pct: string | number | null;
  maximum_adverse_excursion_pct: string | number | null;
  stock_regime: string | null;
  nifty_regime: string | null;
  india_vix_regime: string | null;
};

export function fetchBacktestingLabCatalogue(): Promise<BacktestingLabCatalogue> {
  return getJson<BacktestingLabCatalogue>("/v1/backtesting/lab/catalogue");
}

export function fetchBacktestingLabRuns(): Promise<{
  items: BacktestingLabRun[];
}> {
  return getJson<{ items: BacktestingLabRun[] }>(
    "/v1/backtesting/lab/runs?limit=50",
  );
}

export function fetchBacktestingLabRun(
  runId: string,
): Promise<BacktestingLabRun> {
  return getJson<BacktestingLabRun>(
    `/v1/backtesting/lab/runs/${encodeURIComponent(runId)}`,
  );
}

export function fetchBacktestingLabTrades(
  runId: string,
): Promise<{ items: BacktestingLabTrade[] }> {
  return getJson<{ items: BacktestingLabTrade[] }>(
    `/v1/backtesting/lab/runs/${encodeURIComponent(runId)}/trades?limit=500`,
  );
}

export function fetchBacktestingLabLadders(
  runId: string,
): Promise<{ items: Array<Record<string, unknown>> }> {
  return getJson<{ items: Array<Record<string, unknown>> }>(
    `/v1/backtesting/lab/runs/${encodeURIComponent(runId)}/ladders`,
  );
}

export function fetchBacktestingLabEquity(
  runId: string,
): Promise<{ items: Array<Record<string, unknown>> }> {
  return getJson<{ items: Array<Record<string, unknown>> }>(
    `/v1/backtesting/lab/runs/${encodeURIComponent(runId)}/equity`,
  );
}

async function mutateBacktestingLab<T>(
  path: string,
  body: unknown,
  idempotencyKey?: string,
): Promise<T> {
  const send = async () => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    const csrf = getSessionCsrfToken();
    if (csrf) headers["X-CSRF-Token"] = csrf;
    if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
    return fetch(`${API_BASE_URL}${resolveApiPath(path)}`, {
      method: "POST",
      credentials: "include",
      headers,
      body: JSON.stringify(body),
    });
  };
  let response = await send();
  if (response.status === 403) {
    await refreshCsrfToken().catch(() => null);
    response = await send();
  }
  if (!response.ok)
    throw new Error(`API ${response.status}: ${await response.text()}`);
  return response.json() as Promise<T>;
}

export function createBacktestingLabRun(
  payload: Record<string, unknown>,
  idempotencyKey: string,
): Promise<BacktestingLabRun> {
  return mutateBacktestingLab<BacktestingLabRun>(
    "/v1/backtesting/lab/runs",
    payload,
    idempotencyKey,
  );
}

export function cancelBacktestingLabRun(
  runId: string,
): Promise<BacktestingLabRun> {
  return mutateBacktestingLab<BacktestingLabRun>(
    `/v1/backtesting/lab/runs/${encodeURIComponent(runId)}/cancel`,
    {},
  );
}

export function getBacktestingLabCsvUrl(runId: string): string {
  return `${API_BASE_URL}${resolveApiPath(`/v1/backtesting/lab/runs/${encodeURIComponent(runId)}/trades.csv`)}`;
}

export function fetchOverview(): Promise<OverviewResponse> {
  return getJson<OverviewResponse>("/v1/overview");
}

export function fetchHeaderMarketSummary(): Promise<HeaderMarketSummaryResponse> {
  return getJson<HeaderMarketSummaryResponse>("/v1/overview/header");
}

export type OiisLiveDashboard = {
  environment: "PAPER";
  policyId: string;
  policyVersion: string | null;
  requestedUniverse: string;
  latestRun: Record<string, any> | null;
  selectionScheduleIst: string[];
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
  funnel: Record<string, any>;
  rejectionReasons: Array<{ reason: string; count: number }>;
  nearMisses: Array<Record<string, any>>;
  recommendations: Array<Record<string, any>>;
  failureBuckets: Array<{ failed_gate_count: number; count: number }>;
  gateBreakdown: Array<{ reason: string; direction: string; count: number }>;
  universe: Record<string, any>;
  historical: Record<string, any> | null;
  autoPaperPolicy: Record<string, any>;
};

export function fetchOiisLiveDashboard(
  tradeDate?: string,
): Promise<OiisLiveDashboard> {
  return getJson<OiisLiveDashboard>(
    `/v1/oiis-live/dashboard${tradeDate ? `?tradeDate=${encodeURIComponent(tradeDate)}` : ""}`,
  );
}

export type OissV1Dashboard = {
  strategy: { id: "OISS_V1_202608"; displayName: string; frameworkVersion: string };
  run: Record<string, any> & { run_id: string; scan_timestamp: string; sections: Record<string, any> };
  sectors: Array<Record<string, any>>;
  radar: Array<Record<string, any>>;
  changes: Array<Record<string, any>>;
  outcomes: Array<Record<string, any>>;
  priorRuns: Array<Record<string, any>>;
  paper: Array<Record<string, any>>;
  comparison: Array<Record<string, any>>;
};

export function fetchOissV1Dashboard(runId?: string): Promise<OissV1Dashboard> {
  return getJson<OissV1Dashboard>(`/v1/oiss-v1/dashboard${runId ? `?runId=${encodeURIComponent(runId)}` : ""}`);
}

export type OiisRunHistory = {
  environment: "PAPER";
  scheduleIst: string[];
  timezone: "Asia/Kolkata";
  qualityFormula: string;
  thresholdExclusive: number;
  runs: Array<Record<string, any> & { changes: Array<Record<string, any>> }>;
};

export function fetchOiisRunHistory(
  tradeDate?: string,
  limit = 24,
): Promise<OiisRunHistory> {
  const query = new URLSearchParams({ limit: String(limit) });
  if (tradeDate) query.set("tradeDate", tradeDate);
  return getJson<OiisRunHistory>(
    `/v1/oiis-live/run-history?${query.toString()}`,
  );
}

export type OiisLiveCandidates = {
  environment: "PAPER";
  tradeDate: string | null;
  runId: string | null;
  count: number;
  candidates: Array<Record<string, any>>;
};

export function fetchOiisLiveCandidates(
  tradeDate?: string,
  search?: string,
): Promise<OiisLiveCandidates> {
  const query = new URLSearchParams();
  if (tradeDate) query.set("tradeDate", tradeDate);
  if (search) query.set("search", search);
  return getJson<OiisLiveCandidates>(
    `/v1/oiis-live/candidates?${query.toString()}`,
  );
}

export type OiisCandidateContext = {
  environment: "PAPER";
  symbol: string;
  candidate: Record<string, any> | null;
  smartapi: {
    available: boolean;
    source: string;
    depthSource: string;
    capturedAt: string | null;
    optionCount: number;
    options: Array<Record<string, any>>;
    depthByToken: Array<Record<string, any>>;
    error: string | null;
  };
};

export function fetchOiisCandidateContext(
  symbol: string,
): Promise<OiisCandidateContext> {
  return getJson<OiisCandidateContext>(
    `/v1/oiis-live/candidates/${encodeURIComponent(symbol)}/context`,
  );
}

export async function mutateOiisLive(
  path: string,
  method: "POST" | "PATCH" | "DELETE",
  body?: unknown,
) {
  const resolvedPath = resolveApiPath(`/v1/oiis-live${path}`);
  const response = await fetch(`${API_BASE_URL}${resolvedPath}`, {
    method,
    credentials: "include",
    headers: body == null ? undefined : { "Content-Type": "application/json" },
    body: body == null ? undefined : JSON.stringify(body),
  });
  if (!response.ok)
    throw new Error(`API ${response.status}: ${await response.text()}`);
  return response.status === 204 ? null : response.json();
}

export function fetchLeaderboard(limit = 25): Promise<LeaderboardResponse> {
  return getJson<LeaderboardResponse>(
    `/v1/leaderboard?limit=${encodeURIComponent(String(limit))}`,
  );
}

export function fetchStock(
  symbol: string,
  range: "1D" | "5D" | "1M" | "6M" | "1Y",
): Promise<StockDetailResponse> {
  return getJson<StockDetailResponse>(
    `/v1/stocks/${encodeURIComponent(symbol)}?range=${encodeURIComponent(range)}`,
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

export function fetchIndicatorEducation(
  slug: string,
): Promise<IndicatorEducationResponse> {
  return getJson<IndicatorEducationResponse>(
    `/v1/analytics/indicators/${encodeURIComponent(slug)}`,
  );
}

export function fetchIndicatorStrategySnapshot(
  slug: string,
  scenarioId: string,
): Promise<IndicatorStrategyScenario> {
  return getJson<IndicatorStrategyScenario>(
    `/v1/analytics/indicators/${encodeURIComponent(slug)}/strategies/${encodeURIComponent(scenarioId)}`,
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
  return getJson<AnalyticsOptionsStructureResponse>(
    "/v1/analytics/options-structure",
  );
}

export type FnoVolatilityDashboard = {
  environment: "PAPER";
  strategyId: string;
  strategyVersion: string;
  modelKind: string;
  premarketRun: Record<string, any> | null;
  liveRun: Record<string, any> | null;
  universe: Record<string, any> | null;
  premarket: Array<Record<string, any>>;
  live: Array<Record<string, any>>;
  heartbeats: Array<Record<string, any>>;
};

export function fetchFnoVolatilityDashboard(): Promise<FnoVolatilityDashboard> {
  return getJson<FnoVolatilityDashboard>("/v1/fno-volatility/dashboard");
}

export type RollingMonthlyDashboard = {
  strategyFamily: "ROLLING_MONTHLY";
  independentFromOiis: true;
  paperTradingConnected: false;
  factorId: string;
  factorVersion: string;
  latestRun: Record<string, any> | null;
  availableDates: Array<{ signal_date: string }>;
  candidates: Array<Record<string, any>>;
  qualifyingCandidates: Array<Record<string, any>>;
  strategies: Array<Record<string, any>>;
  referenceMetrics: Array<Record<string, any>>;
  backtestHistory: {
    sourceLabel: string;
    sourceAsOf: string;
    periodStart: string;
    periodEnd: string;
    successDefinition: string;
    bandSummary: Array<Record<string, any>>;
    conditionEvidence: Array<Record<string, any>>;
    correlations: Array<Record<string, any>>;
    monthlySummary: Array<Record<string, any>>;
    governance: {
      factor_version: string;
      status: "APPROVED" | "DEGRADED" | "BLOCKED_DATA_QUALITY_REBUILD" | "SUPERSEDED";
      source_label: string;
      source_sha256?: string | null;
      evaluated_through?: string | null;
      maturity_policy: string;
      audit_metrics: Record<string, unknown>;
      blocking_reasons: string[];
      audited_at: string;
      approved_at?: string | null;
    } | null;
  };
  expiryHistory: {
    anchor: "LAST_TUESDAY_MONTHLY_EXPIRY";
    entryRule: string;
    cohortWindowRule: string;
    cohortAverageRule: string;
    outcomeRule: string;
    months: Array<Record<string, any>>;
    candidates: Array<Record<string, any>>;
  };
  serviceHeartbeat: Record<string, any> | null;
  warnings: string[];
};

export function fetchRollingMonthlyDashboard(
  signalDate?: string,
): Promise<RollingMonthlyDashboard> {
  const suffix = signalDate
    ? `?signalDate=${encodeURIComponent(signalDate)}`
    : "";
  return getJson<RollingMonthlyDashboard>(
    `/v1/rolling-monthly/dashboard${suffix}`,
  );
}

export type RollingWindowDashboard = {
  strategyFamily: "ROLLING_5_30_60";
  independentFromMonthlyAnchors: true;
  independentFromOiis: true;
  universeRule: string;
  refreshCadence: string;
  methodology: Record<string, string>;
  summary: Record<string, any> & { targets: Array<Record<string, any>> };
  rows: Array<Record<string, any>>;
  historyLimited?: boolean;
  historyLimit?: number | null;
  evaluations: Array<Record<string, any>>;
  warnings: string[];
};

export function fetchRollingWindowDashboard(year?: string, month?: string, historyLimit?: number) {
  const params = new URLSearchParams();
  if (year) params.set("year", year);
  if (month) params.set("month", month);
  if (historyLimit) params.set("historyLimit", String(historyLimit));
  const suffix = params.size ? `?${params.toString()}` : "";
  return getJson<RollingWindowDashboard>(`/v1/rolling-strategy/dashboard${suffix}`);
}

export type TrendlyneSummaryDashboard = {
  strategyFamily: "TRENDLYNE_RESEARCH_SUMMARY";
  source: string;
  window: "TRAILING_SIX_MONTHS";
  methodology: Record<string, string>;
  summary: Record<string, any>;
  rows: Array<Record<string, any>>;
  houseSummary: Array<Record<string, any>>;
  stockSummary: Array<Record<string, any>>;
  monthlySummary: Array<Record<string, any>>;
  scraperRuns: Array<Record<string, any>>;
  warnings: string[];
};

export function fetchTrendlyneSummaryDashboard() {
  return getJson<TrendlyneSummaryDashboard>("/v1/trendlyne-summary/dashboard");
}

export type RollingMonthlyWeeklyChart = {
  candidate: {
    candidateId: string;
    symbol: string;
    side: "LONG" | "SHORT";
    qualityBand: "HIGH" | "MEDIUM" | "LOW";
    qualityScore: string | number | null;
    entryEligible: boolean;
    entryRejectionReason: string | null;
    componentSnapshot: Record<string, unknown>;
    signalExpiryDate: string;
    signalDate: string;
    entryDate: string;
    entryPrice: string | number | null;
    nextExpiryDate: string;
  };
  timeframe: "1W";
  source: string;
  bars: Array<{
    weekStart: string;
    firstSession: string;
    lastSession: string;
    open: string | number;
    high: string | number;
    low: string | number;
    close: string | number;
    volume: string | number;
  }>;
  qualificationEvents: Array<{
    candidateId: string;
    signalDate: string;
    entryDate: string;
    signalClose: string | number | null;
    entryPrice: string | number | null;
    side: "LONG" | "SHORT";
    qualityBand: "HIGH" | "MEDIUM" | "LOW";
    qualityScore: string | number | null;
    entryEligible: boolean;
    entryRejectionReason: string | null;
    deploymentAction: string | null;
    maturityState: string | null;
    selected: boolean;
  }>;
};

export function fetchRollingMonthlyWeeklyChart(candidateId: string) {
  return getJson<RollingMonthlyWeeklyChart>(
    `/v1/rolling-monthly/expiry-candidates/${encodeURIComponent(candidateId)}/chart`,
  );
}

export type AbsoluteMonthlyDashboard = {
  strategyFamily: "ROLLING_MONTHLY";
  variant: "ABSOLUTE_MONTHLY_CLOSURE";
  strategyVersion: string;
  independentFromOiis: true;
  paperTradingConnected: false;
  researchNotionalPerOpportunity: number;
  methodology: Record<string, any> | null;
  runs: Array<Record<string, any>>;
  monthlySummary: Array<Record<string, any>>;
  yearlySummary: Array<Record<string, any>>;
  candidates: Array<Record<string, any>>;
  evaluations: Array<Record<string, any>>;
  warnings: string[];
};

export type AbsoluteMonthlyChart = {
  candidate: Record<string, any>;
  timeframe: "1D";
  source: string;
  bars: Array<Record<string, any>>;
};

export function fetchAbsoluteMonthlyDashboard(year?: string, month?: string, includeEvaluations = true) {
  const params = new URLSearchParams();
  if (year) params.set("year", year);
  if (month) params.set("month", month);
  if (!includeEvaluations) params.set("includeEvaluations", "false");
  const suffix = params.size ? `?${params.toString()}` : "";
  return getJson<AbsoluteMonthlyDashboard>(`/v1/rolling-monthly/absolute-months${suffix}`);
}

export function fetchAbsoluteMonthlyChart(candidateId: string) {
  return getJson<AbsoluteMonthlyChart>(
    `/v1/rolling-monthly/absolute-month-candidates/${encodeURIComponent(candidateId)}/chart`,
  );
}

export function absoluteMonthlyExportUrl(format: "csv" | "xls", year?: string, month?: string) {
  const params = new URLSearchParams({ format });
  if (year) params.set("year", year);
  if (month) params.set("month", month);
  return `${API_BASE_URL}/v1/rolling-monthly/absolute-months/export?${params.toString()}`;
}

export type AbsoluteFirstSessionDashboard = {
  generatedAt: string;
  strategyVersion: string;
  gapThresholdPct: number;
  researchNotionalPerOpportunity: number;
  performanceThresholdsPct: number[];
  runs: Array<Record<string, any>>;
  candidates: Array<Record<string, any>>;
  monthlySummary: Array<Record<string, any>>;
  yearlySummary: Array<Record<string, any>>;
  totals: Record<string, any>;
  warnings: string[];
};

export type AbsoluteFirstSessionChart = {
  candidate: Record<string, any>;
  timeframe: "1D";
  source: string;
  bars: Array<Record<string, any>>;
};

export function fetchAbsoluteFirstSessionDashboard(year?: string, month?: string, threshold = "0.50") {
  const params = new URLSearchParams({ threshold });
  if (year) params.set("year", year);
  if (month) params.set("month", month);
  return getJson<AbsoluteFirstSessionDashboard>(`/v1/rolling-monthly/absolute-first-session?${params.toString()}`);
}

export function fetchAbsoluteFirstSessionChart(candidateId: string) {
  return getJson<AbsoluteFirstSessionChart>(
    `/v1/rolling-monthly/absolute-first-session/${encodeURIComponent(candidateId)}/chart`,
  );
}

export function absoluteFirstSessionExportUrl(
  format: "csv" | "xls", year?: string, month?: string, threshold = "0.50",
) {
  const params = new URLSearchParams({ format, threshold });
  if (year) params.set("year", year);
  if (month) params.set("month", month);
  return `${API_BASE_URL}/v1/rolling-monthly/absolute-first-session/export?${params.toString()}`;
}

export type OptionsIntelligenceSummary = {
  environment: "PAPER";
  pageMode: "LIVE_ACTUAL_DATA";
  strategyId: string;
  strategyVersion: string;
  scoringVersion: string;
  modelKind: string;
  generatedAt: string;
  policy: Record<string, number>;
  premarketRun: Record<string, any> | null;
  liveRun: Record<string, any> | null;
  universe: Record<string, any> | null;
  chainHealth: Record<string, any> | null;
  heartbeats: Array<Record<string, any>>;
  funnel: Record<string, number>;
  rejectionDistribution: Array<{ reason: string; count: number }>;
  candidates: Array<Record<string, any>>;
};

export type OptionsIntelligenceDetail = {
  environment: "PAPER";
  pageMode: "LIVE_ACTUAL_DATA";
  symbol: string;
  scoringVersion: string;
  policy: Record<string, number>;
  prediction: Record<string, any>;
  decisionSnapshot: Record<string, any> | null;
  currentSnapshot: Record<string, any>;
  chain: Array<Record<string, any>>;
  history: Array<Record<string, any>>;
  provenance: Record<string, any>;
};

export function fetchOptionsIntelligenceSummary(): Promise<OptionsIntelligenceSummary> {
  return getJson<OptionsIntelligenceSummary>(
    "/v1/options-intelligence/summary",
  );
}

export function fetchOptionsIntelligenceDetail(
  symbol: string,
): Promise<OptionsIntelligenceDetail> {
  return getJson<OptionsIntelligenceDetail>(
    `/v1/options-intelligence/candidates/${encodeURIComponent(symbol)}`,
  );
}

export type LongOptionsSummary = {
  strategyFamily: "LONG_ONLY_OPTIONS_ROUTER";
  strategyVersion: string;
  environment: "PAPER";
  generatedAt: string;
  liveOrdersEnabled: false;
  sourceStrategyFamily: string;
  latestRun: Record<string, any> | null;
  evidenceRun: Record<string, any> | null;
  policy: Record<string, any>;
  candidates: Array<Record<string, any>>;
  directionalShadow: Array<Record<string, any>>;
  summary: {
    evaluatedStructures: number;
    readyStructures: number;
    rejectedStructures: number;
    underlyings: number;
    fullFnoUniverse: number;
    premarketEvaluated: number;
    premarketShortlist: number;
    liveEvaluated: number;
    liveShortlist: number;
    callPutPromotionState: string;
    straddleState: string;
    strangleState: string;
  };
  rejectionDistribution: Array<{ reason: string; count: number }>;
  provenance: Record<string, string>;
};

export function fetchLongOptionsSummary(): Promise<LongOptionsSummary> {
  return getJson<LongOptionsSummary>("/v1/long-options/summary");
}

export type NiftyWeeklyOptionsSummary = {
  strategyFamily: "NIFTY_WEEKLY_LONG_OPTIONS";
  strategyVersion: string;
  environment: "PAPER_RESEARCH";
  generatedAt: string;
  state: "READY" | "NO_TRADE" | "NO_DATA";
  liveOrdersEnabled: false;
  policy: Record<string, any>;
  snapshot: {
    id: string;
    capturedAt: string;
    source: string;
    expiryDate: string;
    spot: number;
    atmStrike: number;
    snapshotAgeSeconds: number;
    sessionPhase: string;
    sessionsRemaining: number;
    strikeCount: number;
    twoSidedLegCount: number;
    totalLegCount: number;
    lotSize: number;
  } | null;
  movementModel?: Record<string, any>;
  oiAnalytics?: {
    source: string;
    scope: "PERSISTED_ATM_WINDOW";
    dataAsOf: string | null;
    coverage: { callLegs: number; putLegs: number; callOiPresent: number; putOiPresent: number; callChangeOiPresent: number; putChangeOiPresent: number };
    totals: { ceOi: number | null; peOi: number | null; pcr: number | null; ceDayChange: number | null; peDayChange: number | null; netDayChange: number | null };
    walls: {
      call: { strike: number | null; oi: number | null; dayChange: number | null } | null;
      put: { strike: number | null; oi: number | null; dayChange: number | null } | null;
    };
    comparison: {
      requestedMinutes: number;
      previousCapturedAt: string | null;
      actualMinutes: number;
      ceOiChange: number | null;
      peOiChange: number | null;
      pcrChange: number | null;
    } | null;
    interpretation: "PUT_OI_DOMINANT" | "CALL_OI_DOMINANT" | "BALANCED_OI" | "UNAVAILABLE";
    limitation: string;
  };
  structures: Array<Record<string, any>>;
  strikeLadder?: Array<Record<string, any>>;
  provenance?: Record<string, string>;
  hardGateFailures?: string[];
};

export function fetchNiftyWeeklyOptionsSummary(): Promise<NiftyWeeklyOptionsSummary> {
  return getJson<NiftyWeeklyOptionsSummary>("/v1/nifty-weekly-options/summary");
}

export type NiftyOptionsSurface = NiftyWeeklyOptionsSummary & {
  expiryRole: "W0" | "M0";
  expiryDate: string | null;
  alsoNearestWeekly: boolean;
};

export type NiftyOptionsSummary = {
  strategyFamily: "NIFTY_WEEKLY_MONTHLY_LONG_OPTIONS";
  strategyVersion: string;
  environment: "SHADOW_NO_TRADE";
  generatedAt: string;
  state: "NO_TRADE" | "INCOMPLETE" | "NO_DATA";
  liveOrdersEnabled: false;
  paperSubmissionEnabled: false;
  safety: { openingSide: "BUY"; closingSide: "SELL_TO_CLOSE_ONLY"; prohibited: string[] };
  expiryRegistry: { W0: string | null; M0: string | null; alsoNearestWeekly: boolean; contracts: Array<{ expiryDate: string; lotSize: number; contractCount: number }> };
  weekly: NiftyOptionsSurface;
  monthly: NiftyOptionsSurface | null;
  scorecard: Record<string, unknown> & { calibrationStatus: string; reason: string };
  paperBook: { state: string; groups: unknown[]; message: string };
  validation: { state: string; snapshotCount: number; expiryCycles: number; firstCapturedAt: string | null; lastCapturedAt: string | null; minimumForwardPaperSessions: number; minimumWeeklyCycles: number; minimumMonthlyCycles: number; minimumEvaluatedStructures: number };
  sources: Array<{ id: string; role: string; status: string; dataAsOf: string | null }>;
};

export function fetchNiftyOptionsSummary(): Promise<NiftyOptionsSummary> {
  return getJson<NiftyOptionsSummary>("/v1/nifty-options/summary");
}

export function fetchAnalyticsStrategyEvaluation(): Promise<AnalyticsStrategyEvaluationResponse> {
  return getJson<AnalyticsStrategyEvaluationResponse>(
    "/v1/analytics/strategy-evaluation",
  );
}

export function fetchFiiReportsRuns(): Promise<FiiReportsRunsResponse> {
  return getJson<FiiReportsRunsResponse>("/v1/fii-reports/runs");
}

export function fetchFiiReportsRunDetail(
  kind: "daily" | "backfill",
  runId: string,
): Promise<FiiReportsRunDetailResponse> {
  return getJson<FiiReportsRunDetailResponse>(
    `/v1/fii-reports/runs/${encodeURIComponent(kind)}/${encodeURIComponent(runId)}`,
  );
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
  return getJson<AnalyticsSimulatorUniverseResponse>(
    "/v1/analytics/simulator/universe",
  );
}

export function fetchAnalyticsSimulator(
  query: AnalyticsSimulatorQuery,
): Promise<AnalyticsSimulatorResponse> {
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
  return getJson<AnalyticsSimulatorResponse>(
    `/v1/analytics/simulator?${params.toString()}`,
  );
}

export function fetchBacktestingOverview(): Promise<BacktestingOverviewResponse> {
  return getJson<BacktestingOverviewResponse>("/v1/backtesting/overview");
}

export function fetchBacktestingStrategies(): Promise<BacktestingStrategiesResponse> {
  return getJson<BacktestingStrategiesResponse>("/v1/backtesting/strategies");
}

export function fetchBacktestingStrategy(
  strategyId: string,
  scenarioKey?: string | null,
): Promise<BacktestingStrategyDetailResponse> {
  const params = new URLSearchParams();
  if (scenarioKey) params.set("scenario", scenarioKey);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return getJson<BacktestingStrategyDetailResponse>(
    `/v1/backtesting/strategies/${encodeURIComponent(strategyId)}${suffix}`,
  );
}

export function fetchBacktestingDailySummary(): Promise<BacktestingDailySummaryResponse> {
  return getJson<BacktestingDailySummaryResponse>(
    "/v1/backtesting/daily-summary",
  );
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

export function fetchDashboardSection(
  sectionSlug: string,
): Promise<DashboardSectionPayload> {
  return getJson<DashboardSectionPayload>(
    `/api/v1/dashboard/sections/${encodeURIComponent(sectionSlug)}`,
  );
}

export function fetchWatchlists(): Promise<WatchlistsPayload> {
  return getJson<WatchlistsPayload>("/api/v1/watchlists");
}

export function fetchWatchlist(slug: string): Promise<WatchlistPayload> {
  return getJson<WatchlistPayload>(
    `/api/v1/watchlists/${encodeURIComponent(slug)}`,
  );
}

export function fetchWatchlistHistory(
  slug: string,
  days = 30,
): Promise<WatchlistHistoryPayload> {
  return getJson<WatchlistHistoryPayload>(
    `/api/v1/watchlists/${encodeURIComponent(slug)}/history?days=${encodeURIComponent(String(days))}`,
  );
}

export function fetchOpsRuns(limit = 20): Promise<OpsRunsPayload> {
  return getJson<OpsRunsPayload>(
    `/api/v1/ops/runs?limit=${encodeURIComponent(String(limit))}`,
  );
}

export function fetchOpsQuality(limit = 20): Promise<OpsQualityPayload> {
  return getJson<OpsQualityPayload>(
    `/api/v1/ops/quality?limit=${encodeURIComponent(String(limit))}`,
  );
}

export function fetchExportManifest(
  limit = 20,
): Promise<ExportManifestPayload> {
  return getJson<ExportManifestPayload>(
    `/api/v1/exports/manifest?limit=${encodeURIComponent(String(limit))}`,
  );
}

export function fetchIntradayAnalyticsSummary(): Promise<IntradayAnalyticsSummaryPayload> {
  return getJson<IntradayAnalyticsSummaryPayload>("/api/v1/intraday/summary");
}

export function fetchIntradayAnalyticsStock(
  symbol: string,
): Promise<IntradayAnalyticsStockPayload> {
  return getJson<IntradayAnalyticsStockPayload>(
    `/api/v1/intraday/stocks/${encodeURIComponent(symbol)}`,
  );
}

export function fetchOptionChainLatest(
  compareMinutes?: number,
): Promise<OptionChainLatestResponse> {
  const params = new URLSearchParams();
  if (Number.isFinite(compareMinutes)) {
    params.set("compareMinutes", String(compareMinutes));
  }
  const suffix = params.size ? `?${params.toString()}` : "";
  return getRootJson<OptionChainLatestResponse>(
    `/option-chain/api/latest${suffix}`,
  );
}

export function fetchOptionChainSeries(
  minutes = 120,
): Promise<OptionChainSeriesResponse> {
  const params = new URLSearchParams();
  params.set("minutes", String(minutes));
  return getRootJson<OptionChainSeriesResponse>(
    `/option-chain/api/series?${params.toString()}`,
  );
}

export function fetchOptionChainAnalytics(
  params: {
    expiry?: string | null;
    minutes?: number;
    compareMinutes?: number;
    strikesAround?: number;
  } = {},
): Promise<OptionChainAnalyticsResponse> {
  const query = new URLSearchParams();
  if (params.expiry) query.set("expiry", params.expiry);
  if (Number.isFinite(params.minutes))
    query.set("minutes", String(params.minutes));
  if (Number.isFinite(params.compareMinutes))
    query.set("compareMinutes", String(params.compareMinutes));
  if (Number.isFinite(params.strikesAround))
    query.set("strikesAround", String(params.strikesAround));
  const suffix = query.size ? `?${query.toString()}` : "";
  return getRootJson<OptionChainAnalyticsResponse>(
    `/option-chain/api/analytics${suffix}`,
  );
}

export function fetchNseIntelligence(): Promise<NseIntelligenceResponse> {
  return getJson<NseIntelligenceResponse>("/v1/nse-intelligence/overview");
}

export function fetchPaperTradeNotifications(): Promise<PaperTradeNotificationResponse> {
  return getJson<PaperTradeNotificationResponse>("/v1/paper/notifications?limit=5");
}

export function getWsBaseUrl() {
  const explicit = import.meta.env.VITE_WS_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  if (API_BASE_URL.startsWith("http://"))
    return API_BASE_URL.replace("http://", "ws://").replace(/\/$/, "");
  if (API_BASE_URL.startsWith("https://"))
    return API_BASE_URL.replace("https://", "wss://").replace(/\/$/, "");
  if (typeof window !== "undefined") {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${window.location.host}${API_BASE_URL}`.replace(
      /\/$/,
      "",
    );
  }
  return "ws://localhost:8080";
}
