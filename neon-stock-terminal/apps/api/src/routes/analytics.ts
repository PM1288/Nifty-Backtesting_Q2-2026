import type { Express } from "express";
import { Prisma, type PrismaClient } from "@prisma/client";
import { toNumber } from "../lib/num";
import { getLatestStoredSnapshot, getStoredSnapshot, serveSnapshotRoute } from "../lib/dashboardSnapshots";
import { getPublicBoardBriefSlug, getPublicMacroBriefSlug } from "../lib/runtimeConfig";
import { marketDayIso } from "../lib/time";
import { getAnalyticsDailySetups } from "./analyticsDailySetups";
import { getAnalyticsFiiFlow } from "./analyticsFiiFlow";
import { getAnalyticsLeadership } from "./analyticsLeadership";
import { getAnalyticsMarketState } from "./analyticsMarketState";
import { getAnalyticsOptionsStructure, getAnalyticsOptionsStructureForSymbol } from "./analyticsOptionsStructure";
import { getAnalyticsStrategyEvaluation } from "./analyticsStrategyEvaluation";
import { getOverview } from "./overview";
import { getSupportingMetricsSnapshot } from "./supportingMetrics";

type DashboardSummaryRow = {
  trade_date: Date | string | null;
  securities_count: number | null;
  advancers: number | null;
  decliners: number | null;
  unchanged: number | null;
  positive_ratio: number | null;
  avg_daily_return: number | null;
  median_daily_return: number | null;
  total_turnover_lacs: number | null;
  avg_volume_rel_20: number | null;
  avg_delivery_rel_20: number | null;
  breakout_count: number | null;
  breakdown_count: number | null;
  accumulation_count: number | null;
  distribution_count: number | null;
  event_count: number | null;
  anomaly_count: number | null;
  risk_count: number | null;
  market_regime: string | null;
  nifty_close: number | null;
  nifty_return: number | null;
  updated_at: Date | string | null;
};

type RegimeHistoryRow = {
  trade_date: Date | string | null;
  market_regime: string | null;
  positive_ratio: number | null;
  avg_daily_return: number | null;
  breakout_count: number | null;
  breakdown_count: number | null;
  event_count: number | null;
  anomaly_count: number | null;
};

type WatchlistRow = {
  trade_date: Date | string | null;
  symbol: string;
  series: string;
  security_name: string | null;
  close_price: number | null;
  daily_return: number | null;
  volume_rel_20: number | null;
  delivery_rel_20: number | null;
  composite_trend_score: number | null;
  composite_anomaly_score: number | null;
  composite_risk_score: number | null;
  max_signal_strength: number | null;
  signals: string | null;
};

type SignalSummaryRow = {
  analysis_type: string;
  signal_name: string;
  signal_direction: string;
  signal_count: number | null;
  avg_signal_strength: number | null;
  max_signal_strength: number | null;
};

type SignalPerformanceRow = {
  analysis_type: string;
  signal_name: string;
  signal_direction: string;
  sample_size: number | null;
  hit_rate_5d: number | null;
  avg_fwd_return_5d: number | null;
  median_fwd_return_5d: number | null;
};

type FlowLeaderRow = {
  trade_date: Date | string | null;
  symbol: string;
  series: string;
  security_name: string | null;
  close_price: number | null;
  daily_return: number | null;
  volume_rel_20: number | null;
  delivery_rel_20: number | null;
  short_sell_qty: bigint | number | null;
  margin_financed_qty: bigint | number | null;
  avg_applicable_margin_rate: number | null;
  has_announcement: boolean;
};

type EventRow = {
  report_date: Date | string | null;
  event_type: string;
  symbol: string | null;
  headline: string | null;
};

type DealRow = {
  trade_date: Date | string | null;
  symbol: string;
  client_name: string | null;
  side: string | null;
  quantity_traded: bigint | number | null;
  trade_price: number | null;
};

type JobRunRow = {
  job_run_id: bigint | number;
  job_name: string;
  started_at: Date | string | null;
  finished_at: Date | string | null;
  status: string;
  notes: string | null;
};

type QualityCheckRow = {
  check_name: string;
  severity: string;
  status: string;
  observed_value: number | null;
  operator: string;
  threshold: number | null;
  checked_at: Date | string | null;
};

type PipelineAuditRow = {
  report_name: string;
  latest_source_date: Date | string | null;
  latest_loaded_at: Date | string | null;
  loaded_files_15d: number | null;
  failed_files_15d: number | null;
  rows_loaded_15d: bigint | number | null;
};

const RECO_API_BASE_URL = (process.env.NSE_RECO_API_BASE_URL ?? "http://nse-reco-api:8010").replace(/\/$/, "");
const SIMULATOR_UNIVERSE_TTL_MS = 60 * 60_000;
const SIMULATOR_RESPONSE_TTL_MS = 15 * 60_000;
const RECO_API_TIMEOUT_MS = Number(process.env.NSE_RECO_API_TIMEOUT_MS ?? 20_000);
const MAX_RECO_CACHE_ENTRIES = Number(process.env.NSE_RECO_CACHE_MAX_ENTRIES ?? 256);
const SIMULATOR_PREWARM_RETRY_MS = Number(process.env.NSE_SIMULATOR_PREWARM_RETRY_MS ?? 5_000);
const SIMULATOR_PREWARM_MAX_ATTEMPTS = Number(process.env.NSE_SIMULATOR_PREWARM_MAX_ATTEMPTS ?? 8);
const DEFAULT_SIMULATOR_QUERY = {
  symbol: "NIFTY 50",
  instrument_type: "index",
  lot_amount: "100000",
  dip_pct: "1",
  target_pct: "1.25",
  fd_rate_pct: "7",
  lookback_days: "365",
  capital_caps: "1000000,2500000,5000000",
  include_infinite: "true",
  end_date: undefined
} as const;

type CacheEntry<T> = {
  createdAt: number;
  expiresAt: number;
  promise: Promise<T>;
};

class RecoApiError extends Error {
  status: number;
  detail: string | null;
  url: string;
  timedOut: boolean;

  constructor({
    status,
    message,
    detail,
    url,
    timedOut = false
  }: {
    status: number;
    message: string;
    detail?: string | null;
    url: string;
    timedOut?: boolean;
  }) {
    super(message);
    this.name = "RecoApiError";
    this.status = status;
    this.detail = detail ?? null;
    this.url = url;
    this.timedOut = timedOut;
  }
}

const recoCache = new Map<string, CacheEntry<unknown>>();
let simulatorWarmStarted = false;

function logAnalyticsEvent(level: "info" | "warn" | "error", event: string, data: Record<string, unknown>) {
  const payload = {
    ts: new Date().toISOString(),
    level,
    event,
    ...data
  };

  const line = JSON.stringify(payload);
  if (level === "error") {
    console.error(line);
    return;
  }
  if (level === "warn") {
    console.warn(line);
    return;
  }
  console.info(line);
}

function queryStringValue(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (Array.isArray(value)) {
    const first = value.find((item) => typeof item === "string" && item.trim()) as string | undefined;
    return first?.trim();
  }
  return undefined;
}

function toRecoUrl(pathname: string, params?: Record<string, string | undefined>) {
  const url = new URL(pathname, `${RECO_API_BASE_URL}/`);
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value != null && value !== "") {
      url.searchParams.set(key, value);
    }
  }
  return url;
}

function parseRecoErrorDetail(text: string): string | null {
  if (!text.trim()) return null;
  try {
    const payload = JSON.parse(text) as { detail?: unknown; error?: { message?: unknown } };
    if (typeof payload.detail === "string" && payload.detail.trim()) return payload.detail.trim();
    if (typeof payload.error?.message === "string" && payload.error.message.trim()) return payload.error.message.trim();
  } catch {
    // Fall back to plain text handling below.
  }
  return text.trim();
}

function cleanupRecoCache(now = Date.now()) {
  for (const [key, value] of recoCache.entries()) {
    if (value.expiresAt <= now) {
      recoCache.delete(key);
    }
  }

  if (recoCache.size <= MAX_RECO_CACHE_ENTRIES) return;

  const oldestEntries = [...recoCache.entries()].sort((left, right) => left[1].createdAt - right[1].createdAt);
  const excess = recoCache.size - MAX_RECO_CACHE_ENTRIES;
  for (let index = 0; index < excess; index += 1) {
    const key = oldestEntries[index]?.[0];
    if (key) recoCache.delete(key);
  }
}

async function fetchRecoJson<T>(pathname: string, params?: Record<string, string | undefined>): Promise<T> {
  const url = toRecoUrl(pathname, params);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RECO_API_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        Accept: "application/json"
      },
      signal: controller.signal
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    throw new RecoApiError({
      status: timedOut ? 504 : 502,
      message: timedOut ? "Reco upstream timed out." : "Reco upstream is unreachable.",
      detail: timedOut ? "upstream_timeout" : "upstream_unreachable",
      url: url.toString(),
      timedOut
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const text = await response.text();
    const detail = parseRecoErrorDetail(text);
    throw new RecoApiError({
      status: response.status,
      message: detail ?? `Reco API returned ${response.status}.`,
      detail,
      url: url.toString()
    });
  }

  return (await response.json()) as T;
}

function fetchCachedRecoJson<T>(pathname: string, params: Record<string, string | undefined> | undefined, ttlMs: number): Promise<T> {
  const cacheKey = toRecoUrl(pathname, params).toString();
  const now = Date.now();
  cleanupRecoCache(now);
  const cached = recoCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.promise as Promise<T>;
  }

  const promise = fetchRecoJson<T>(pathname, params).catch((error) => {
    const current = recoCache.get(cacheKey);
    if (current?.promise === promise) {
      recoCache.delete(cacheKey);
    }
    throw error;
  });

  recoCache.set(cacheKey, {
    createdAt: now,
    expiresAt: now + ttlMs,
    promise
  });
  cleanupRecoCache(now);
  return promise;
}

function buildSimulatorRequestParams(query: Record<string, unknown>) {
  return {
    symbol: queryStringValue(query.symbol) ?? DEFAULT_SIMULATOR_QUERY.symbol,
    instrument_type: queryStringValue(query.instrument_type) ?? DEFAULT_SIMULATOR_QUERY.instrument_type,
    lot_amount: queryStringValue(query.lot_amount) ?? DEFAULT_SIMULATOR_QUERY.lot_amount,
    dip_pct: queryStringValue(query.dip_pct) ?? DEFAULT_SIMULATOR_QUERY.dip_pct,
    target_pct: queryStringValue(query.target_pct) ?? DEFAULT_SIMULATOR_QUERY.target_pct,
    fd_rate_pct: queryStringValue(query.fd_rate_pct) ?? DEFAULT_SIMULATOR_QUERY.fd_rate_pct,
    lookback_days: DEFAULT_SIMULATOR_QUERY.lookback_days,
    capital_caps: queryStringValue(query.capital_caps) ?? DEFAULT_SIMULATOR_QUERY.capital_caps,
    include_infinite: queryStringValue(query.include_infinite) ?? DEFAULT_SIMULATOR_QUERY.include_infinite,
    end_date: queryStringValue(query.end_date)
  };
}

function isDefaultSimulatorRequest(params: ReturnType<typeof buildSimulatorRequestParams>) {
  return (
    params.symbol === DEFAULT_SIMULATOR_QUERY.symbol &&
    params.instrument_type === DEFAULT_SIMULATOR_QUERY.instrument_type &&
    params.lot_amount === DEFAULT_SIMULATOR_QUERY.lot_amount &&
    params.dip_pct === DEFAULT_SIMULATOR_QUERY.dip_pct &&
    params.target_pct === DEFAULT_SIMULATOR_QUERY.target_pct &&
    params.fd_rate_pct === DEFAULT_SIMULATOR_QUERY.fd_rate_pct &&
    params.lookback_days === DEFAULT_SIMULATOR_QUERY.lookback_days &&
    params.capital_caps === DEFAULT_SIMULATOR_QUERY.capital_caps &&
    params.include_infinite === DEFAULT_SIMULATOR_QUERY.include_infinite &&
    (params.end_date ?? undefined) === DEFAULT_SIMULATOR_QUERY.end_date
  );
}

export async function getAnalyticsSimulatorUniverseSnapshot() {
  return fetchRecoJson("/api/v1/reco/simulator/universe");
}

export async function getAnalyticsSimulatorDefaultSnapshot() {
  return fetchRecoJson("/api/v1/reco/simulator", { ...DEFAULT_SIMULATOR_QUERY });
}

export async function warmSimulatorCachesOnce() {
  const universePromise = fetchCachedRecoJson("/api/v1/reco/simulator/universe", undefined, SIMULATOR_UNIVERSE_TTL_MS);
  const defaultPromise = fetchCachedRecoJson(
    "/api/v1/reco/simulator",
    { ...DEFAULT_SIMULATOR_QUERY },
    SIMULATOR_RESPONSE_TTL_MS
  );

  const [universe, defaultScenario] = await Promise.allSettled([universePromise, defaultPromise]);
  const failures = [universe, defaultScenario].filter((result) => result.status === "rejected");
  return {
    success: failures.length === 0,
    failures: failures.map((result) => (result as PromiseRejectedResult).reason)
  };
}

function scheduleSimulatorPrewarm(attempt = 1) {
  void warmSimulatorCachesOnce()
    .then(({ success, failures }) => {
      if (success) {
        logAnalyticsEvent("info", "analytics_simulator_prewarm_ok", { attempt });
        return;
      }

      for (const failure of failures) {
        logAnalyticsEvent("warn", "analytics_simulator_prewarm_attempt_failed", {
          attempt,
          error: failure instanceof Error ? failure.message : String(failure)
        });
      }

      if (attempt >= SIMULATOR_PREWARM_MAX_ATTEMPTS) {
        logAnalyticsEvent("warn", "analytics_simulator_prewarm_abandoned", { attempt });
        return;
      }

      setTimeout(() => {
        scheduleSimulatorPrewarm(attempt + 1);
      }, SIMULATOR_PREWARM_RETRY_MS);
    })
    .catch((error) => {
      logAnalyticsEvent("warn", "analytics_simulator_prewarm_attempt_failed", {
        attempt,
        error: error instanceof Error ? error.message : String(error)
      });
      if (attempt >= SIMULATOR_PREWARM_MAX_ATTEMPTS) {
        logAnalyticsEvent("warn", "analytics_simulator_prewarm_abandoned", { attempt });
        return;
      }
      setTimeout(() => {
        scheduleSimulatorPrewarm(attempt + 1);
      }, SIMULATOR_PREWARM_RETRY_MS);
    });
}

function toPublicRecoError(
  error: unknown,
  code: string,
  fallbackMessage: string
): { status: number; body: { error: { code: string; message: string } } } {
  if (error instanceof RecoApiError) {
    if (error.timedOut) {
      return {
        status: 504,
        body: {
          error: {
            code,
            message: "The upstream simulator service timed out."
          }
        }
      };
    }

    if (error.status >= 400 && error.status < 500) {
      return {
        status: error.status,
        body: {
          error: {
            code,
            message: error.detail ?? fallbackMessage
          }
        }
      };
    }

    return {
      status: 502,
      body: {
        error: {
          code,
          message: "The upstream simulator service failed."
        }
      }
    };
  }

  return {
    status: 500,
    body: {
      error: {
        code,
        message: fallbackMessage
      }
    }
  };
}

function toDateKey(value: Date | string | null | undefined): string {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function toIso(value: Date | string | null | undefined): string {
  if (!value) return new Date().toISOString();
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function toNullableIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function toInt(value: number | bigint | null | undefined): number {
  if (typeof value === "bigint") return Number(value);
  return Math.trunc(toNumber(value ?? 0));
}

function trimText(value: string | null | undefined, max = 220): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1).trimEnd()}…`;
}

function parseDateKey(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addUtcDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function isBusinessDay(date: Date): boolean {
  const isoDow = date.getUTCDay();
  return isoDow !== 0 && isoDow !== 6;
}

function getIndiaDateKey(now = new Date()): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  return formatter.format(now);
}

function getExpectedTradeDateKey(now = new Date()): string {
  let cursor = parseDateKey(getIndiaDateKey(now)) ?? new Date();
  while (!isBusinessDay(cursor)) {
    cursor = addUtcDays(cursor, -1);
  }
  return formatDateKey(cursor);
}

function businessDayLag(lastSeenDate: string | null, expectedTradeDate: string | null): number | null {
  if (!lastSeenDate || !expectedTradeDate) return null;
  const start = parseDateKey(lastSeenDate);
  const end = parseDateKey(expectedTradeDate);
  if (!start || !end) return null;
  if (start >= end) return 0;
  let lag = 0;
  for (let cursor = addUtcDays(start, 1); cursor <= end; cursor = addUtcDays(cursor, 1)) {
    if (isBusinessDay(cursor)) lag += 1;
  }
  return lag;
}

function pickLatestDateKey(candidates: Array<string | null | undefined>): string | null {
  const values = candidates.filter((value): value is string => Boolean(value));
  if (values.length === 0) return null;
  values.sort((left, right) => left.localeCompare(right));
  return values.at(-1) ?? null;
}

function ratio(actual: number | null | undefined, expected: number | null | undefined): number | null {
  if (actual == null || expected == null || expected <= 0) return null;
  return Math.max(0, Math.min(1, actual / expected));
}

function roundTo(value: number | null | undefined, digits = 1): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

type QualitySourceRow = {
  source_key: string;
  label: string;
  last_seen_date: Date | string | null;
  last_loaded_at: Date | string | null;
  recent_rows: bigint | number | null;
};

type QualityCoverageRow = {
  expected_count: number | null;
  eod_latest_date: Date | string | null;
  eod_actual_count: number | null;
  feature_latest_date: Date | string | null;
  feature_actual_count: number | null;
  signal_latest_date: Date | string | null;
  signal_actual_count: number | null;
  reco_latest_date: Date | string | null;
  reco_actual_count: number | null;
  intraday_latest_date: Date | string | null;
  intraday_actual_count: number | null;
  intraday_expected_bars: number | null;
  intraday_latest_minute_symbols: number | null;
  intraday_partial_symbols: number | null;
  bars_latest_date: Date | string | null;
  bars_actual_count: number | null;
  option_latest_date: Date | string | null;
  option_snapshot_count: number | null;
  pcr_latest_date: Date | string | null;
  max_pain_latest_date: Date | string | null;
  equilibrium_latest_date: Date | string | null;
  fii_latest_date: Date | string | null;
  fii_actual_count: number | null;
  event_latest_date: Date | string | null;
  event_recent_count: number | null;
  fin_latest_date: Date | string | null;
  fin_recent_count: number | null;
  corp_latest_date: Date | string | null;
  corp_recent_count: number | null;
  bucket_latest_date: Date | string | null;
  bucket_count: number | null;
};

type QualityPresenceRow = {
  trade_date: Date | string | null;
  eod_present: boolean;
  feature_present: boolean;
  signal_present: boolean;
  reco_present: boolean;
  intraday_present: boolean;
  options_present: boolean;
  fii_present: boolean;
  catalyst_present: boolean;
  strategy_present: boolean;
};

type QualityMissingBarRow = {
  trade_date: Date | string | null;
  symbol: string;
  bars_seen: number | null;
  bars_expected: number | null;
  missing_bars: number | null;
};

type QualityJobTimelineRow = {
  job_date: Date | string | null;
  job_name: string;
  status: string;
  count: number | null;
};

type QualityBoundaryRow = {
  latest_pre_date: Date | string | null;
  earliest_post_date: Date | string | null;
  latest_post_date: Date | string | null;
  overlap_dates: string[] | null;
};

const QUALITY_SOURCE_SQL = Prisma.sql`
  SELECT *
  FROM (
    SELECT
      'raw_eod'::text AS source_key,
      'EOD prices'::text AS label,
      (SELECT MAX(trade_date) FROM nse.fact_eod_prices) AS last_seen_date,
      (SELECT MAX(loaded_at) FROM nse.fact_eod_prices) AS last_loaded_at,
      (SELECT COUNT(*)::bigint FROM nse.fact_eod_prices WHERE trade_date >= CURRENT_DATE - INTERVAL '20 days') AS recent_rows
    UNION ALL
    SELECT
      'daily_features',
      'Daily features',
      (SELECT MAX(trade_date) FROM nse_app.security_daily_features),
      (SELECT MAX(trade_date)::timestamp FROM nse_app.security_daily_features),
      (SELECT COUNT(*)::bigint FROM nse_app.security_daily_features WHERE trade_date >= CURRENT_DATE - INTERVAL '20 days')
    UNION ALL
    SELECT
      'daily_signals',
      'Daily signals',
      (SELECT MAX(trade_date) FROM nse_app.stock_analysis_signals_daily),
      (SELECT MAX(trade_date)::timestamp FROM nse_app.stock_analysis_signals_daily),
      (SELECT COUNT(*)::bigint FROM nse_app.stock_analysis_signals_daily WHERE trade_date >= CURRENT_DATE - INTERVAL '20 days')
    UNION ALL
    SELECT
      'intraday_features',
      'Intraday features',
      (SELECT MAX(trade_date) FROM nse_intraday.security_minute_feature),
      (SELECT MAX(generated_at) FROM nse_intraday.security_minute_feature),
      (SELECT COUNT(*)::bigint FROM nse_intraday.security_minute_feature WHERE trade_date >= CURRENT_DATE - INTERVAL '5 days')
    UNION ALL
    SELECT
      'market_session_summary',
      'Market session summary',
      (SELECT MAX(trade_date) FROM nse_intraday.market_session_summary),
      (SELECT MAX(generated_at) FROM nse_intraday.market_session_summary),
      (SELECT COUNT(*)::bigint FROM nse_intraday.market_session_summary WHERE trade_date >= CURRENT_DATE - INTERVAL '20 days')
    UNION ALL
    SELECT
      'recommendations',
      'Recommendation snapshots',
      (SELECT MAX(trade_date) FROM nse_reco.recommendation_snapshot),
      (SELECT MAX(updated_at) FROM nse_reco.recommendation_snapshot),
      (SELECT COUNT(*)::bigint FROM nse_reco.recommendation_snapshot WHERE trade_date >= CURRENT_DATE - INTERVAL '20 days')
    UNION ALL
    SELECT
      'option_chain',
      'Option chain snapshots',
      (SELECT MAX(captured_at)::date FROM public.option_chain_snapshots),
      (SELECT MAX(captured_at) FROM public.option_chain_snapshots),
      (SELECT COUNT(*)::bigint FROM public.option_chain_snapshots WHERE captured_at >= NOW() - INTERVAL '1 day')
    UNION ALL
    SELECT
      'pcr',
      'PCR snapshots',
      (SELECT MAX(ts)::date FROM public.pcr_snapshots),
      (SELECT MAX(ts) FROM public.pcr_snapshots),
      (SELECT COUNT(*)::bigint FROM public.pcr_snapshots WHERE ts >= NOW() - INTERVAL '10 days')
    UNION ALL
    SELECT
      'max_pain',
      'Max pain summary',
      (SELECT MAX(updated_at)::date FROM public.max_pain_summary),
      (SELECT MAX(updated_at) FROM public.max_pain_summary),
      (SELECT COUNT(*)::bigint FROM public.max_pain_summary WHERE updated_at >= NOW() - INTERVAL '10 days')
    UNION ALL
    SELECT
      'equilibrium',
      'Equilibrium summary',
      (SELECT MAX(updated_at)::date FROM public.equilibrium_summary),
      (SELECT MAX(updated_at) FROM public.equilibrium_summary),
      (SELECT COUNT(*)::bigint FROM public.equilibrium_summary WHERE updated_at >= NOW() - INTERVAL '10 days')
    UNION ALL
    SELECT
      'fii_oi',
      'FII participant OI',
      (SELECT MAX(trade_date) FROM market_data.nse_fii_participant_open_interest),
      (SELECT MAX(loaded_at) FROM market_data.nse_fii_participant_open_interest),
      (SELECT COUNT(*)::bigint FROM market_data.nse_fii_participant_open_interest WHERE trade_date >= CURRENT_DATE - INTERVAL '20 days')
    UNION ALL
    SELECT
      'event_calendar',
      'NSE event calendar',
      (SELECT MAX(event_date) FROM market_data.nse_event_calendar),
      (SELECT MAX(fetched_at) FROM market_data.nse_event_calendar),
      (SELECT COUNT(*)::bigint FROM market_data.nse_event_calendar WHERE event_date >= CURRENT_DATE - INTERVAL '30 days')
    UNION ALL
    SELECT
      'financial_results',
      'NSE financial results',
      (SELECT MAX(board_meeting_date) FROM market_data.nse_financial_results),
      (SELECT MAX(fetched_at) FROM market_data.nse_financial_results),
      (SELECT COUNT(*)::bigint FROM market_data.nse_financial_results WHERE board_meeting_date >= CURRENT_DATE - INTERVAL '30 days')
    UNION ALL
    SELECT
      'corporate_actions',
      'NSE corporate actions',
      (SELECT MAX(ex_date) FROM market_data.nse_corporate_actions),
      (SELECT MAX(fetched_at) FROM market_data.nse_corporate_actions),
      (SELECT COUNT(*)::bigint FROM market_data.nse_corporate_actions WHERE ex_date >= CURRENT_DATE - INTERVAL '30 days')
  ) sources
  ORDER BY label ASC
`;

const QUALITY_COVERAGE_SQL = Prisma.sql`
  SELECT
    (SELECT COUNT(*)::int
     FROM public.instrument_universe
     WHERE universe_name = 'nifty100_equity'
       AND COALESCE(active_from, DATE '1900-01-01') <= CURRENT_DATE
       AND COALESCE(active_to, DATE '2999-12-31') >= CURRENT_DATE) AS expected_count,
    (SELECT MAX(trade_date) FROM nse.fact_eod_prices) AS eod_latest_date,
    (SELECT COUNT(DISTINCT symbol)::int FROM nse.fact_eod_prices WHERE trade_date = (SELECT MAX(trade_date) FROM nse.fact_eod_prices)) AS eod_actual_count,
    (SELECT MAX(trade_date) FROM nse_app.security_daily_features) AS feature_latest_date,
    (SELECT COUNT(DISTINCT symbol)::int FROM nse_app.security_daily_features WHERE trade_date = (SELECT MAX(trade_date) FROM nse_app.security_daily_features)) AS feature_actual_count,
    (SELECT MAX(trade_date) FROM nse_app.stock_analysis_signals_daily) AS signal_latest_date,
    (SELECT COUNT(DISTINCT symbol)::int FROM nse_app.stock_analysis_signals_daily WHERE trade_date = (SELECT MAX(trade_date) FROM nse_app.stock_analysis_signals_daily)) AS signal_actual_count,
    (SELECT MAX(trade_date) FROM nse_reco.recommendation_snapshot) AS reco_latest_date,
    (SELECT COUNT(DISTINCT symbol)::int FROM nse_reco.recommendation_snapshot WHERE trade_date = (SELECT MAX(trade_date) FROM nse_reco.recommendation_snapshot)) AS reco_actual_count,
    (SELECT MAX(trade_date) FROM nse_intraday.security_minute_feature) AS intraday_latest_date,
    (SELECT COUNT(DISTINCT symbol)::int FROM nse_intraday.security_minute_feature WHERE trade_date = (SELECT MAX(trade_date) FROM nse_intraday.security_minute_feature)) AS intraday_actual_count,
    (SELECT MAX(minute_no)::int FROM nse_intraday.security_minute_feature WHERE trade_date = (SELECT MAX(trade_date) FROM nse_intraday.security_minute_feature)) AS intraday_expected_bars,
    (SELECT COUNT(DISTINCT symbol)::int
     FROM nse_intraday.security_minute_feature
     WHERE trade_date = (SELECT MAX(trade_date) FROM nse_intraday.security_minute_feature)
       AND minute_no = (
         SELECT MAX(minute_no)
         FROM nse_intraday.security_minute_feature
         WHERE trade_date = (SELECT MAX(trade_date) FROM nse_intraday.security_minute_feature)
       )) AS intraday_latest_minute_symbols,
    (SELECT COUNT(*)::int
     FROM (
       SELECT symbol
       FROM nse_intraday.security_minute_feature
       WHERE trade_date = (SELECT MAX(trade_date) FROM nse_intraday.security_minute_feature)
       GROUP BY symbol
       HAVING COUNT(DISTINCT minute_no) < (
         SELECT MAX(minute_no)
         FROM nse_intraday.security_minute_feature
         WHERE trade_date = (SELECT MAX(trade_date) FROM nse_intraday.security_minute_feature)
       )
     ) gaps) AS intraday_partial_symbols,
    (SELECT MAX(trade_date) FROM public.bars_1d) AS bars_latest_date,
    (SELECT COUNT(DISTINCT symbol_token)::int FROM public.bars_1d WHERE trade_date = (SELECT MAX(trade_date) FROM public.bars_1d)) AS bars_actual_count,
    (SELECT MAX(captured_at)::date FROM public.option_chain_snapshots) AS option_latest_date,
    (SELECT COUNT(*)::int FROM public.option_chain_snapshots WHERE captured_at::date = (SELECT MAX(captured_at)::date FROM public.option_chain_snapshots)) AS option_snapshot_count,
    (SELECT MAX(ts)::date FROM public.pcr_snapshots) AS pcr_latest_date,
    (SELECT MAX(updated_at)::date FROM public.max_pain_summary) AS max_pain_latest_date,
    (SELECT MAX(updated_at)::date FROM public.equilibrium_summary) AS equilibrium_latest_date,
    (SELECT MAX(trade_date) FROM market_data.nse_fii_participant_open_interest) AS fii_latest_date,
    (SELECT COUNT(*)::int FROM market_data.nse_fii_participant_open_interest WHERE trade_date = (SELECT MAX(trade_date) FROM market_data.nse_fii_participant_open_interest)) AS fii_actual_count,
    (SELECT MAX(event_date) FROM market_data.nse_event_calendar) AS event_latest_date,
    (SELECT COUNT(*)::int FROM market_data.nse_event_calendar WHERE event_date >= CURRENT_DATE - INTERVAL '30 days') AS event_recent_count,
    (SELECT MAX(board_meeting_date) FROM market_data.nse_financial_results) AS fin_latest_date,
    (SELECT COUNT(*)::int FROM market_data.nse_financial_results WHERE board_meeting_date >= CURRENT_DATE - INTERVAL '30 days') AS fin_recent_count,
    (SELECT MAX(ex_date) FROM market_data.nse_corporate_actions) AS corp_latest_date,
    (SELECT COUNT(*)::int FROM market_data.nse_corporate_actions WHERE ex_date >= CURRENT_DATE - INTERVAL '30 days') AS corp_recent_count,
    (SELECT MAX(updated_at)::date FROM nse_reco.bucket_scorecard) AS bucket_latest_date,
    (SELECT COUNT(*)::int FROM nse_reco.bucket_scorecard) AS bucket_count
`;

const QUALITY_PRESENCE_SQL = Prisma.sql`
  WITH session_dates AS (
    SELECT gs::date AS trade_date
    FROM generate_series(CURRENT_DATE - INTERVAL '20 days', CURRENT_DATE, INTERVAL '1 day') gs
    WHERE EXTRACT(ISODOW FROM gs) < 6
  )
  SELECT
    d.trade_date,
    EXISTS(SELECT 1 FROM nse.fact_eod_prices p WHERE p.trade_date = d.trade_date) AS eod_present,
    EXISTS(SELECT 1 FROM nse_app.security_daily_features f WHERE f.trade_date = d.trade_date) AS feature_present,
    EXISTS(SELECT 1 FROM nse_app.stock_analysis_signals_daily s WHERE s.trade_date = d.trade_date) AS signal_present,
    EXISTS(SELECT 1 FROM nse_reco.recommendation_snapshot r WHERE r.trade_date = d.trade_date) AS reco_present,
    EXISTS(SELECT 1 FROM nse_intraday.security_minute_feature m WHERE m.trade_date = d.trade_date) AS intraday_present,
    EXISTS(SELECT 1 FROM public.option_chain_snapshots o WHERE o.captured_at::date = d.trade_date) AS options_present,
    EXISTS(SELECT 1 FROM market_data.nse_fii_participant_open_interest fi WHERE fi.trade_date = d.trade_date) AS fii_present,
    (
      EXISTS(SELECT 1 FROM market_data.nse_event_calendar e WHERE e.event_date = d.trade_date) OR
      EXISTS(SELECT 1 FROM market_data.nse_financial_results fr WHERE fr.board_meeting_date = d.trade_date) OR
      EXISTS(SELECT 1 FROM market_data.nse_corporate_actions ca WHERE ca.ex_date = d.trade_date)
    ) AS catalyst_present,
    (
      EXISTS(SELECT 1 FROM nse_reco.recommendation_snapshot r WHERE r.trade_date = d.trade_date) AND
      EXISTS(SELECT 1 FROM nse_reco.market_regime_snapshot mr WHERE mr.trade_date = d.trade_date)
    ) AS strategy_present
  FROM session_dates d
  ORDER BY d.trade_date DESC
`;

const QUALITY_MISSING_BARS_SQL = Prisma.sql`
  WITH latest_day AS (
    SELECT MAX(trade_date) AS trade_date
    FROM nse_intraday.security_minute_feature
  ),
  expected_bars AS (
    SELECT MAX(minute_no)::int AS bars_expected
    FROM nse_intraday.security_minute_feature
    WHERE trade_date = (SELECT trade_date FROM latest_day)
  )
  SELECT
    ld.trade_date,
    m.symbol,
    MAX(m.minute_no)::int AS bars_seen,
    eb.bars_expected,
    (eb.bars_expected - MAX(m.minute_no)::int) AS missing_bars
  FROM nse_intraday.security_minute_feature m
  CROSS JOIN latest_day ld
  CROSS JOIN expected_bars eb
  WHERE m.trade_date = ld.trade_date
  GROUP BY ld.trade_date, m.symbol, eb.bars_expected
  HAVING MAX(m.minute_no)::int < eb.bars_expected
  ORDER BY missing_bars DESC, m.symbol ASC
  LIMIT 40
`;

const QUALITY_FAILED_JOBS_SQL = Prisma.sql`
  SELECT
    started_at::date AS job_date,
    job_name,
    status,
    COUNT(*)::int AS count
  FROM nse_app.job_runs
  WHERE started_at >= CURRENT_DATE - INTERVAL '30 days'
  GROUP BY 1, 2, 3
  HAVING status <> 'success'
  ORDER BY job_date DESC, job_name ASC
`;

const QUALITY_BOUNDARY_SQL = Prisma.sql`
  WITH overlap AS (
    SELECT p.trade_date
    FROM nse.fact_eod_prices p
    INNER JOIN nse.fact_bhavcopy_udiff u ON u.trade_date = p.trade_date
    WHERE p.trade_date >= DATE '2024-07-08'
    ORDER BY p.trade_date
    LIMIT 10
  )
  SELECT
    (SELECT MAX(trade_date) FROM nse.fact_eod_prices WHERE trade_date < DATE '2024-07-08') AS latest_pre_date,
    (SELECT MIN(trade_date) FROM nse.fact_bhavcopy_udiff WHERE trade_date >= DATE '2024-07-08') AS earliest_post_date,
    (SELECT MAX(trade_date) FROM nse.fact_bhavcopy_udiff WHERE trade_date >= DATE '2024-07-08') AS latest_post_date,
    (SELECT ARRAY_AGG(TO_CHAR(trade_date, 'YYYY-MM-DD')) FROM overlap) AS overlap_dates
`;

const QUALITY_LATEST_JOBS_SQL = Prisma.sql`
  SELECT
    job_run_id,
    job_name,
    started_at,
    finished_at,
    status,
    notes
  FROM nse_app.job_runs
  ORDER BY started_at DESC
  LIMIT 12
`;

const QUALITY_CHECKS_SQL = Prisma.sql`
  SELECT
    check_name,
    severity,
    status,
    observed_value,
    operator,
    threshold,
    checked_at
  FROM nse_app.quality_check_results
  ORDER BY checked_at DESC, check_name ASC
  LIMIT 20
`;

const QUALITY_PIPELINE_AUDIT_SQL = Prisma.sql`
  SELECT
    report_name,
    MAX(source_date) AS latest_source_date,
    MAX(loaded_at) AS latest_loaded_at,
    COUNT(*) FILTER (WHERE source_date >= CURRENT_DATE - INTERVAL '15 days' AND load_status = 'loaded')::int AS loaded_files_15d,
    COUNT(*) FILTER (WHERE source_date >= CURRENT_DATE - INTERVAL '15 days' AND load_status <> 'loaded')::int AS failed_files_15d,
    COALESCE(SUM(rows_loaded) FILTER (WHERE source_date >= CURRENT_DATE - INTERVAL '15 days'), 0)::bigint AS rows_loaded_15d
  FROM nse.file_registry
  GROUP BY report_name
  ORDER BY latest_source_date DESC NULLS LAST, report_name ASC
`;

const QUALITY_ROUTE_DEPENDENCIES = [
  {
    moduleKey: "market-state",
    label: "Market State",
    route: "/analytics/market-state",
    dependencies: [
      "nse_intraday.security_minute_feature",
      "nse_intraday.market_session_summary",
      "nse_app.vw_latest_market_summary",
      "nse_app.vw_market_state_history_stats",
      "public.index_constituents",
      "nse_intraday.universe_membership"
    ]
  },
  {
    moduleKey: "stock-leadership",
    label: "Stock Leadership",
    route: "/analytics/leadership",
    dependencies: [
      "nse_intraday.security_minute_feature",
      "public.stock_intraday_live",
      "public.vw_stock_alpha_latest",
      "nse_app.security_daily_features",
      "nse_app.stock_analysis_signals_daily"
    ]
  },
  {
    moduleKey: "daily-setups",
    label: "Daily Setups",
    route: "/analytics/daily-setups",
    dependencies: [
      "nse_app.security_daily_features",
      "nse_app.stock_analysis_signals_daily",
      "nse_app.signal_performance_summary",
      "nse.fact_text_events",
      "market_data.nse_corporate_actions"
    ]
  },
  {
    moduleKey: "options-structure",
    label: "Options Structure",
    route: "/options/structure",
    dependencies: [
      "public.option_chain_snapshots",
      "public.option_chain_legs",
      "public.option_greeks",
      "public.pcr_snapshots",
      "public.max_pain_summary",
      "public.equilibrium_summary"
    ]
  },
  {
    moduleKey: "participant-flow",
    label: "Participant Flow",
    route: "/institutional/flow",
    dependencies: [
      "market_data.nse_fii_participant_open_interest",
      "market_data.nse_fii_participant_volume",
      "market_data.nse_fii_derivatives_stats"
    ]
  },
  {
    moduleKey: "event-context",
    label: "Event Context",
    route: "/catalysts/context",
    dependencies: [
      "nse.fact_text_events",
      "market_data.nse_event_calendar",
      "market_data.nse_financial_results",
      "market_data.nse_corporate_actions",
      "nse.fact_block_deals",
      "nse.fact_bulk_deals"
    ]
  },
  {
    moduleKey: "strategy-evaluation",
    label: "Strategy Evaluation",
    route: "/strategy/evaluation",
    dependencies: [
      "nse_reco.recommendation_snapshot",
      "nse_reco.market_regime_snapshot",
      "nse_reco.bucket_scorecard",
      "nse_reco.v_reco_outcomes",
      "nse_reco.trade_log",
      "nse_reco.daily_equity"
    ]
  }
] as const;

function buildAnalyticsQualityPayload(args: {
  sourceRows: QualitySourceRow[];
  coverage: QualityCoverageRow;
  presenceRows: QualityPresenceRow[];
  missingBarRows: QualityMissingBarRow[];
  failedJobRows: QualityJobTimelineRow[];
  boundary: QualityBoundaryRow | undefined;
  jobRows: JobRunRow[];
  checkRows: QualityCheckRow[];
  pipelineRows: PipelineAuditRow[];
}) {
  const { sourceRows, coverage, presenceRows, missingBarRows, failedJobRows, boundary, jobRows, checkRows, pipelineRows } = args;
  const expectedTradeDate =
    pickLatestDateKey([
      toDateKey(coverage.intraday_latest_date),
      toDateKey(coverage.reco_latest_date),
      toDateKey(coverage.signal_latest_date),
      toDateKey(coverage.bars_latest_date),
      toDateKey(coverage.feature_latest_date),
      toDateKey(coverage.eod_latest_date)
    ]) ?? getExpectedTradeDateKey();
  const expectedCount = toInt(coverage.expected_count);
  const intradayLatestDate = toDateKey(coverage.intraday_latest_date);
  const intradayMinuteSymbols = toInt(coverage.intraday_latest_minute_symbols);
  const intradayCoverageRatio = ratio(intradayMinuteSymbols, expectedCount);
  const signalCoverageRatio = ratio(toInt(coverage.signal_actual_count), expectedCount);
  const recoCoverageRatio = ratio(toInt(coverage.reco_actual_count), expectedCount);
  const barsCoverageRatio = ratio(toInt(coverage.bars_actual_count), expectedCount);
  const latestRecoDate = toDateKey(coverage.reco_latest_date);
  const latestBarsDate = toDateKey(coverage.bars_latest_date);
  const latestPcrDate = toDateKey(coverage.pcr_latest_date);
  const latestMaxPainDate = toDateKey(coverage.max_pain_latest_date);
  const latestEquilibriumDate = toDateKey(coverage.equilibrium_latest_date);
  const latestFiiDate = toDateKey(coverage.fii_latest_date);
  const fiiLag = businessDayLag(latestFiiDate, expectedTradeDate);
  const optionLag = businessDayLag(toDateKey(coverage.option_latest_date), expectedTradeDate);
  const pcrLag = businessDayLag(latestPcrDate, expectedTradeDate);
  const maxPainLag = businessDayLag(latestMaxPainDate, expectedTradeDate);
  const equilibriumLag = businessDayLag(latestEquilibriumDate, expectedTradeDate);
  const eventRecentCount = toInt(coverage.event_recent_count);
  const finRecentCount = toInt(coverage.fin_recent_count);
  const corpRecentCount = toInt(coverage.corp_recent_count);
  const catalystRecentCount = eventRecentCount + finRecentCount + corpRecentCount;
  const bucketLatestDate = toDateKey(coverage.bucket_latest_date);
  const bucketCount = toInt(coverage.bucket_count);
  const catalystLatestDate =
    toDateKey(coverage.event_latest_date) || toDateKey(coverage.fin_latest_date) || toDateKey(coverage.corp_latest_date) || null;

  type FreshnessStatus = "fresh" | "delayed" | "stale";
  type ModuleQualityStatus = "safe" | "downgraded" | "hidden";
  type ModuleQualityItem = {
    moduleKey: string;
    label: string;
    route: string;
    status: ModuleQualityStatus;
    trustScore: number;
    lastSeenDate: string | null;
    expectedTradeDate: string | null;
    expectedCount: number | null;
    actualCount: number | null;
    coverageRatio: number | null;
    reason: string;
    staleNote: string;
    safeToTrust: boolean;
    visible: boolean;
    dependencies: string[];
  };

  const freshnessBySource = sourceRows.map((row) => {
    const lastSeenDate = toDateKey(row.last_seen_date) || null;
    const lagSessions = businessDayLag(lastSeenDate, expectedTradeDate);
    const recentRows = toInt(row.recent_rows);
    const status: FreshnessStatus =
      recentRows === 0 || (lagSessions != null && lagSessions >= 2)
        ? "stale"
        : lagSessions != null && lagSessions >= 1
          ? "delayed"
          : "fresh";
    const note =
      status === "fresh"
        ? "Fresh enough for interpretation."
        : status === "delayed"
          ? "Running behind the latest expected session."
          : recentRows === 0
            ? "Stale but non-empty: historical rows exist, recent rows do not."
            : "Missed multiple expected sessions.";

    return {
      sourceKey: row.source_key,
      label: row.label,
      lastSeenDate,
      lastLoadedAt: toNullableIso(row.last_loaded_at),
      lagSessions,
      recentRows,
      status,
      note
    };
  });

  const marketStateStatus: ModuleQualityStatus =
    intradayLatestDate !== expectedTradeDate ? "hidden" : (intradayCoverageRatio ?? 1) < 0.95 || toInt(coverage.intraday_partial_symbols) > 0 ? "downgraded" : "safe";
  const stockLeadershipStatus: ModuleQualityStatus =
    intradayLatestDate !== expectedTradeDate ? "hidden" : (intradayCoverageRatio ?? 1) < 0.95 ? "downgraded" : "safe";
  const dailySetupsStatus: ModuleQualityStatus =
    latestBarsDate !== expectedTradeDate || (barsCoverageRatio ?? 0) === 0 ? "hidden" : latestRecoDate !== expectedTradeDate || (signalCoverageRatio ?? 1) < 0.8 ? "downgraded" : "safe";
  const optionsStatus: ModuleQualityStatus =
    (optionLag ?? 99) > 1 ? "hidden" : (pcrLag ?? 99) > 1 || (maxPainLag ?? 99) > 5 || (equilibriumLag ?? 99) > 5 ? "downgraded" : "safe";
  const participantFlowStatus: ModuleQualityStatus =
    latestFiiDate == null ? "hidden" : (fiiLag ?? 99) > 10 ? "hidden" : (fiiLag ?? 99) > 1 ? "downgraded" : "safe";
  const eventContextStatus: ModuleQualityStatus =
    catalystRecentCount === 0 ? "hidden" : catalystRecentCount < 10 ? "downgraded" : "safe";
  const strategyStatus: ModuleQualityStatus =
    latestRecoDate == null ? "hidden" : (businessDayLag(latestRecoDate, expectedTradeDate) ?? 99) > 2 ? "hidden" : latestRecoDate !== expectedTradeDate || bucketCount === 0 || bucketLatestDate !== latestRecoDate ? "downgraded" : "safe";

  const moduleStatus: ModuleQualityItem[] = [
    {
      moduleKey: "market-state",
      label: "Market State",
      route: "/analytics/market-state",
      status: marketStateStatus,
      trustScore: Math.max(0, 100 - (intradayLatestDate !== expectedTradeDate ? 45 : 0) - ((intradayCoverageRatio ?? 1) < 0.95 ? 20 : 0) - (toInt(coverage.intraday_partial_symbols) > 0 ? 10 : 0)),
      lastSeenDate: intradayLatestDate || null,
      expectedTradeDate,
      expectedCount,
      actualCount: intradayMinuteSymbols,
      coverageRatio: roundTo(intradayCoverageRatio, 2),
      reason:
        intradayLatestDate !== expectedTradeDate
          ? "Same-session market-state data is missing."
          : (intradayCoverageRatio ?? 1) < 0.95 || toInt(coverage.intraday_partial_symbols) > 0
            ? "Latest-minute breadth is partial, so trend-state calls are degraded."
            : "Current and broad enough to trust.",
      staleNote: `Latest minute coverage ${intradayMinuteSymbols}/${expectedCount}; partial symbols ${toInt(coverage.intraday_partial_symbols)}.`,
      safeToTrust: intradayLatestDate === expectedTradeDate && (intradayCoverageRatio ?? 1) >= 0.95 && toInt(coverage.intraday_partial_symbols) === 0,
      visible: intradayLatestDate === expectedTradeDate,
      dependencies: [...QUALITY_ROUTE_DEPENDENCIES[0].dependencies]
    },
    {
      moduleKey: "stock-leadership",
      label: "Stock Leadership",
      route: "/analytics/leadership",
      status: stockLeadershipStatus,
      trustScore: Math.max(0, 100 - (intradayLatestDate !== expectedTradeDate ? 45 : 0) - ((intradayCoverageRatio ?? 1) < 0.95 ? 20 : 0)),
      lastSeenDate: intradayLatestDate || null,
      expectedTradeDate,
      expectedCount,
      actualCount: intradayMinuteSymbols,
      coverageRatio: roundTo(intradayCoverageRatio, 2),
      reason:
        intradayLatestDate !== expectedTradeDate
          ? "Leadership residuals are stale."
          : (intradayCoverageRatio ?? 1) < 0.95
            ? "Leadership ranks are based on incomplete live coverage."
            : "Leadership inputs are current.",
      staleNote: `Latest-minute symbols ${intradayMinuteSymbols}/${expectedCount}.`,
      safeToTrust: intradayLatestDate === expectedTradeDate && (intradayCoverageRatio ?? 1) >= 0.95,
      visible: intradayLatestDate === expectedTradeDate,
      dependencies: [...QUALITY_ROUTE_DEPENDENCIES[1].dependencies]
    },
    {
      moduleKey: "daily-setups",
      label: "Daily Setups",
      route: "/analytics/daily-setups",
      status: dailySetupsStatus,
      trustScore: Math.max(0, 100 - (latestRecoDate !== expectedTradeDate ? 25 : 0) - (latestBarsDate !== expectedTradeDate || (barsCoverageRatio ?? 0) === 0 ? 40 : 0) - ((signalCoverageRatio ?? 1) < 0.8 ? 15 : 0)),
      lastSeenDate: latestRecoDate || toDateKey(coverage.signal_latest_date) || null,
      expectedTradeDate,
      expectedCount,
      actualCount: Math.min(toInt(coverage.signal_actual_count), toInt(coverage.reco_actual_count) || toInt(coverage.signal_actual_count)),
      coverageRatio: roundTo(Math.min(signalCoverageRatio ?? 1, recoCoverageRatio ?? 1), 2),
      reason:
        latestBarsDate !== expectedTradeDate || (barsCoverageRatio ?? 0) === 0
          ? "Daily bar backbone is missing, so setup expectancy should be suppressed."
          : latestRecoDate !== expectedTradeDate
            ? "Recommendation layer is stale."
            : (signalCoverageRatio ?? 1) < 0.8
              ? "Signal coverage is partial."
              : "Daily setup inputs are aligned.",
      staleNote: `Signals ${toInt(coverage.signal_actual_count)}/${expectedCount}; reco ${toInt(coverage.reco_actual_count)}/${expectedCount}; bars ${toInt(coverage.bars_actual_count)}/${expectedCount}.`,
      safeToTrust: latestBarsDate === expectedTradeDate && latestRecoDate === expectedTradeDate && (signalCoverageRatio ?? 1) >= 0.8,
      visible: latestBarsDate === expectedTradeDate && (barsCoverageRatio ?? 0) > 0,
      dependencies: [...QUALITY_ROUTE_DEPENDENCIES[2].dependencies]
    },
    {
      moduleKey: "options-structure",
      label: "Options Structure",
      route: "/options/structure",
      status: optionsStatus,
      trustScore: Math.max(0, 100 - ((optionLag ?? 99) > 1 ? 30 : 0) - ((pcrLag ?? 99) > 1 ? 10 : 0) - ((maxPainLag ?? 99) > 5 ? 10 : 0) - ((equilibriumLag ?? 99) > 5 ? 10 : 0)),
      lastSeenDate: toDateKey(coverage.option_latest_date) || null,
      expectedTradeDate,
      expectedCount: null,
      actualCount: toInt(coverage.option_snapshot_count),
      coverageRatio: null,
      reason:
        (optionLag ?? 99) > 1
          ? "Chain snapshots themselves are stale."
          : (pcrLag ?? 99) > 1 || (maxPainLag ?? 99) > 5 || (equilibriumLag ?? 99) > 5
            ? "Core chain is fresh, but overlays are lagged and should be treated as secondary."
            : "Core chain and overlays are aligned.",
      staleNote: `Chain lag ${optionLag ?? "—"}, PCR lag ${pcrLag ?? "—"}, max pain lag ${maxPainLag ?? "—"}, equilibrium lag ${equilibriumLag ?? "—"}.`,
      safeToTrust: (optionLag ?? 99) <= 1 && (pcrLag ?? 99) <= 1 && (maxPainLag ?? 99) <= 5 && (equilibriumLag ?? 99) <= 5,
      visible: (optionLag ?? 99) <= 1,
      dependencies: [...QUALITY_ROUTE_DEPENDENCIES[3].dependencies]
    },
    {
      moduleKey: "participant-flow",
      label: "Participant Flow",
      route: "/institutional/flow",
      status: participantFlowStatus,
      trustScore: Math.max(0, 100 - ((fiiLag ?? 99) > 10 ? 60 : 0) - ((fiiLag ?? 99) > 1 ? 25 : 0)),
      lastSeenDate: latestFiiDate || null,
      expectedTradeDate,
      expectedCount: null,
      actualCount: toInt(coverage.fii_actual_count),
      coverageRatio: null,
      reason:
        latestFiiDate == null
          ? "Participant flow reports are absent."
          : (fiiLag ?? 99) > 10
            ? "Institutional context is too old to trust."
            : (fiiLag ?? 99) > 1
              ? "Official participant reports are lagged, so treat them as context only."
              : "Latest official participant report is fresh enough for next-session context.",
      staleNote: `Latest official FII/participant trade date ${latestFiiDate ?? "—"} with ${fiiLag ?? "—"} business-day lag.`,
      safeToTrust: (fiiLag ?? 99) <= 1,
      visible: latestFiiDate != null && (fiiLag ?? 99) <= 10,
      dependencies: [...QUALITY_ROUTE_DEPENDENCIES[4].dependencies]
    },
    {
      moduleKey: "event-context",
      label: "Event Context",
      route: "/catalysts/context",
      status: eventContextStatus,
      trustScore: Math.max(0, 100 - (catalystRecentCount === 0 ? 70 : 0) - (catalystRecentCount > 0 && catalystRecentCount < 10 ? 25 : 0)),
      lastSeenDate: catalystLatestDate,
      expectedTradeDate,
      expectedCount: null,
      actualCount: catalystRecentCount,
      coverageRatio: null,
      reason:
        catalystRecentCount === 0
          ? "Catalyst tables are non-empty but not producing recent board meetings, event dates, or ex-dates."
          : catalystRecentCount < 10
            ? "Catalyst coverage is sparse enough that event clustering can mislead."
            : "Catalyst tables are recent enough for interpretation.",
      staleNote: `Recent rows over 30 days: events ${eventRecentCount}, results ${finRecentCount}, corporate actions ${corpRecentCount}.`,
      safeToTrust: catalystRecentCount >= 10,
      visible: catalystRecentCount > 0,
      dependencies: [...QUALITY_ROUTE_DEPENDENCIES[5].dependencies]
    },
    {
      moduleKey: "strategy-evaluation",
      label: "Strategy Evaluation",
      route: "/strategy/evaluation",
      status: strategyStatus,
      trustScore: Math.max(0, 100 - (latestRecoDate == null ? 55 : 0) - ((businessDayLag(latestRecoDate, expectedTradeDate) ?? 99) > 2 ? 35 : 0) - (latestRecoDate !== expectedTradeDate ? 15 : 0) - (bucketCount === 0 ? 20 : 0) - (bucketLatestDate !== latestRecoDate ? 10 : 0)),
      lastSeenDate: latestRecoDate || bucketLatestDate || null,
      expectedTradeDate,
      expectedCount,
      actualCount: toInt(coverage.reco_actual_count),
      coverageRatio: roundTo(recoCoverageRatio, 2),
      reason:
        latestRecoDate == null
          ? "Recommendation layer has no current snapshot."
          : (businessDayLag(latestRecoDate, expectedTradeDate) ?? 99) > 2
            ? "Recommendation and backtest context are too stale to trust."
            : latestRecoDate !== expectedTradeDate
              ? "Recommendations are one session behind the expected close."
              : bucketCount === 0 || bucketLatestDate !== latestRecoDate
                ? "Recommendation scores exist, but compare/backtest marts are incomplete for quality grading."
                : "Recommendation and evaluation marts are aligned.",
      staleNote: `Reco date ${latestRecoDate ?? "—"}, bucket scorecard rows ${bucketCount}, bucket latest ${bucketLatestDate ?? "—"}.`,
      safeToTrust: latestRecoDate === expectedTradeDate && bucketCount > 0 && bucketLatestDate === latestRecoDate,
      visible: latestRecoDate != null && (businessDayLag(latestRecoDate, expectedTradeDate) ?? 99) <= 2,
      dependencies: [...QUALITY_ROUTE_DEPENDENCIES[6].dependencies]
    }
  ];

  const safeModules = moduleStatus.filter((item) => item.status === "safe").map((item) => item.label);
  const downgradedModules = moduleStatus.filter((item) => item.status === "downgraded").map((item) => item.label);
  const hiddenModules = moduleStatus.filter((item) => item.status === "hidden").map((item) => item.label);

  const overlapDates = (boundary?.overlap_dates ?? []).filter((value): value is string => Boolean(value));
  const latestPreDate = toDateKey(boundary?.latest_pre_date);
  const earliestPostDate = toDateKey(boundary?.earliest_post_date);
  const latestPostDate = toDateKey(boundary?.latest_post_date);
  const schemaBoundaryRisk: "low" | "medium" | "high" =
    !latestPreDate || !earliestPostDate
      ? "high"
      : overlapDates.length > 0
        ? "medium"
        : "low";
  const schemaBoundaryMessage =
    schemaBoundaryRisk === "high"
      ? "Pre/post-UDiFF continuity is broken or missing around the 2024-07-08 cutover."
      : schemaBoundaryRisk === "medium"
        ? `Pre/post-UDiFF overlap exists after 2024-07-08 (${overlapDates.slice(0, 4).join(", ")}), so historical joins need explicit guardrails.`
        : "Pre/post-UDiFF boundary is aligned cleanly across the 2024-07-08 schema change.";

  const averageTrust =
    moduleStatus.length > 0
      ? Math.round(moduleStatus.reduce((sum, item) => sum + item.trustScore, 0) / moduleStatus.length)
      : 0;
  const trustScore = Math.max(0, Math.min(100, averageTrust - (schemaBoundaryRisk === "high" ? 10 : schemaBoundaryRisk === "medium" ? 5 : 0)));
  const verdict: "healthy" | "mixed" | "fragile" =
    trustScore >= 75 && hiddenModules.length === 0 ? "healthy" : trustScore >= 55 ? "mixed" : "fragile";
  const synopsis =
    verdict === "healthy"
      ? "Most analytical modules are current enough to trust, with explicit boundary metadata kept in view."
      : verdict === "mixed"
        ? "Some modules remain usable, but freshness gaps and partial coverage mean conclusions need downgrade tags."
        : "Trust is fragile: stale, partial, or boundary-risky modules should be hidden or heavily suppressed.";

  const presenceMatrix = [
    { moduleKey: "market-state", label: "Market State", accessor: (row: QualityPresenceRow) => Boolean(row.intraday_present), reason: "Missing intraday minute/state inputs for that session." },
    { moduleKey: "stock-leadership", label: "Stock Leadership", accessor: (row: QualityPresenceRow) => Boolean(row.intraday_present), reason: "Missing stock-level intraday alpha inputs for that session." },
    { moduleKey: "daily-setups", label: "Daily Setups", accessor: (row: QualityPresenceRow) => Boolean(row.eod_present && row.signal_present && row.reco_present), reason: "EOD, signal, or recommendation layers are absent for that session." },
    { moduleKey: "options-structure", label: "Options Structure", accessor: (row: QualityPresenceRow) => Boolean(row.options_present), reason: "Option-chain snapshots were not persisted for that session." },
    { moduleKey: "participant-flow", label: "Participant Flow", accessor: (row: QualityPresenceRow) => Boolean(row.fii_present), reason: "Official participant flow report is missing for that trade date." },
    { moduleKey: "event-context", label: "Event Context", accessor: (row: QualityPresenceRow) => Boolean(row.catalyst_present), reason: "No recent catalyst rows were found for that session." },
    { moduleKey: "strategy-evaluation", label: "Strategy Evaluation", accessor: (row: QualityPresenceRow) => Boolean(row.strategy_present), reason: "Strategy snapshot and regime context did not align on that session." }
  ] as const;

  const missingDateLedger = presenceRows.flatMap((row) =>
    presenceMatrix.map((entry) => ({
      tradeDate: toDateKey(row.trade_date) || "",
      moduleKey: entry.moduleKey,
      label: entry.label,
      present: entry.accessor(row),
      reason: entry.accessor(row) ? "Present" : entry.reason
    }))
  );

  return {
    asOf: new Date().toISOString(),
    expectedTradeDate,
    summary: {
      trustScore,
      verdict,
      safeModuleCount: safeModules.length,
      downgradedModuleCount: downgradedModules.length,
      hiddenModuleCount: hiddenModules.length,
      synopsis,
      schemaBoundaryRisk: schemaBoundaryMessage
    },
    freshnessBySource,
    moduleStatus,
    safeModules,
    downgradedModules,
    hiddenModules,
    schemaBoundary: {
      cutoverDate: "2024-07-08",
      latestPreDate,
      earliestPostDate,
      latestPostDate,
      overlapDates,
      riskLabel: schemaBoundaryRisk,
      message: schemaBoundaryMessage
    },
    routeDependencies: QUALITY_ROUTE_DEPENDENCIES.map((entry) => ({
      moduleKey: entry.moduleKey,
      label: entry.label,
      route: entry.route,
      dependencies: [...entry.dependencies]
    })),
    charts: {
      freshnessBySource: freshnessBySource.map((row) => ({
        sourceKey: row.sourceKey,
        label: row.label,
        lagSessions: row.lagSessions,
        recentRows: row.recentRows,
        status: row.status
      })),
      coverageByModule: moduleStatus.map((item) => ({
        moduleKey: item.moduleKey,
        label: item.label,
        coverageRatio: item.coverageRatio,
        expectedCount: item.expectedCount,
        actualCount: item.actualCount,
        status: item.status
      })),
      missingBarHeatmap: missingBarRows.map((row) => ({
        tradeDate: toDateKey(row.trade_date),
        symbol: row.symbol,
        barsSeen: toInt(row.bars_seen),
        barsExpected: toInt(row.bars_expected),
        missingBars: toInt(row.missing_bars)
      })),
      failedJobsTimeline: failedJobRows.map((row) => ({
        jobDate: toDateKey(row.job_date),
        jobName: row.job_name,
        status: row.status,
        count: toInt(row.count)
      })),
      expectedVsSeenInstruments: moduleStatus
        .filter((item) => item.expectedCount != null)
        .map((item) => ({
          moduleKey: item.moduleKey,
          label: item.label,
          expectedCount: item.expectedCount,
          actualCount: item.actualCount
        })),
      missingDateLedger
    },
    diagnostics: {
      latestJobRuns: jobRows.map((row) => ({
        jobName: row.job_name,
        startedAt: toNullableIso(row.started_at),
        finishedAt: toNullableIso(row.finished_at),
        status: row.status,
        notes: trimText(row.notes, 180) ?? null
      })),
      latestQualityChecks: checkRows.map((row) => ({
        checkName: row.check_name,
        severity: row.severity,
        status: row.status,
        observedValue: row.observed_value == null ? null : toNumber(row.observed_value),
        threshold: row.threshold == null ? null : toNumber(row.threshold),
        checkedAt: toNullableIso(row.checked_at)
      })),
      pipelineAudit: pipelineRows.map((row) => ({
        reportName: row.report_name,
        latestSourceDate: toDateKey(row.latest_source_date),
        latestLoadedAt: toNullableIso(row.latest_loaded_at),
        loadedFiles15d: toInt(row.loaded_files_15d),
        failedFiles15d: toInt(row.failed_files_15d),
        rowsLoaded15d: toInt(row.rows_loaded_15d)
      }))
    }
  };
}

function groupSignalRows(rows: SignalSummaryRow[]) {
  const buckets = new Map<
    string,
    Array<{
      signalName: string;
      signalDirection: string;
      signalCount: number;
      avgSignalStrength: number;
      maxSignalStrength: number;
    }>
  >();

  for (const row of rows) {
    const key = row.analysis_type;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push({
      signalName: row.signal_name,
      signalDirection: row.signal_direction,
      signalCount: toInt(row.signal_count),
      avgSignalStrength: toNumber(row.avg_signal_strength),
      maxSignalStrength: toNumber(row.max_signal_strength)
    });
  }

  return [...buckets.entries()].map(([analysisType, items]) => ({
    analysisType,
    items: items
      .sort((a, b) => b.signalCount - a.signalCount || b.maxSignalStrength - a.maxSignalStrength)
      .slice(0, 6)
  }));
}

export async function getAnalyticsDashboard(prisma: PrismaClient) {
  const [summaryRows, historyRows, watchlistRows, signalRows, performanceRows] = await Promise.all([
    prisma.$queryRaw<DashboardSummaryRow[]>(Prisma.sql`
      SELECT *
      FROM nse_app.vw_latest_market_summary
    `),
    prisma.$queryRaw<RegimeHistoryRow[]>(Prisma.sql`
      SELECT
        trade_date,
        market_regime,
        positive_ratio,
        avg_daily_return,
        breakout_count,
        breakdown_count,
        event_count,
        anomaly_count
      FROM nse_app.market_summary_daily
      ORDER BY trade_date DESC
      LIMIT 15
    `),
    prisma.$queryRaw<WatchlistRow[]>(Prisma.sql`
      SELECT *
      FROM nse_app.vw_latest_watchlist
      LIMIT 24
    `),
    prisma.$queryRaw<SignalSummaryRow[]>(Prisma.sql`
      WITH latest_date AS (
        SELECT MAX(trade_date) AS trade_date
        FROM nse_app.stock_analysis_signals_daily
      )
      SELECT
        s.analysis_type,
        s.signal_name,
        s.signal_direction,
        COUNT(*)::int AS signal_count,
        AVG(s.signal_strength)::double precision AS avg_signal_strength,
        MAX(s.signal_strength)::double precision AS max_signal_strength
      FROM nse_app.stock_analysis_signals_daily s
      JOIN latest_date ld ON s.trade_date = ld.trade_date
      GROUP BY 1, 2, 3
      ORDER BY s.analysis_type ASC, signal_count DESC, max_signal_strength DESC NULLS LAST
    `),
    prisma.$queryRaw<SignalPerformanceRow[]>(Prisma.sql`
      SELECT
        analysis_type,
        signal_name,
        signal_direction,
        sample_size,
        hit_rate_5d,
        avg_fwd_return_5d,
        median_fwd_return_5d
      FROM nse_app.vw_latest_signal_performance
      ORDER BY sample_size DESC NULLS LAST, avg_fwd_return_5d DESC NULLS LAST
      LIMIT 12
    `)
  ]);

  const summary = summaryRows[0];
  if (!summary) {
    throw new Error("Analytics market summary is empty.");
  }

  return {
    asOf: toIso(summary.updated_at),
    tradeDate: toDateKey(summary.trade_date),
    marketSummary: {
      tradeDate: toDateKey(summary.trade_date),
      marketRegime: summary.market_regime ?? "unknown",
      securitiesCount: toInt(summary.securities_count),
      advancers: toInt(summary.advancers),
      decliners: toInt(summary.decliners),
      unchanged: toInt(summary.unchanged),
      positiveRatio: toNumber(summary.positive_ratio),
      avgDailyReturn: toNumber(summary.avg_daily_return),
      medianDailyReturn: toNumber(summary.median_daily_return),
      totalTurnoverLacs: toNumber(summary.total_turnover_lacs),
      avgVolumeRel20: toNumber(summary.avg_volume_rel_20),
      avgDeliveryRel20: toNumber(summary.avg_delivery_rel_20),
      breakoutCount: toInt(summary.breakout_count),
      breakdownCount: toInt(summary.breakdown_count),
      accumulationCount: toInt(summary.accumulation_count),
      distributionCount: toInt(summary.distribution_count),
      eventCount: toInt(summary.event_count),
      anomalyCount: toInt(summary.anomaly_count),
      riskCount: toInt(summary.risk_count),
      niftyClose: toNumber(summary.nifty_close),
      niftyReturn: toNumber(summary.nifty_return)
    },
    regimeHistory: historyRows
      .map((row) => ({
        tradeDate: toDateKey(row.trade_date),
        marketRegime: row.market_regime ?? "unknown",
        positiveRatio: toNumber(row.positive_ratio),
        avgDailyReturn: toNumber(row.avg_daily_return),
        breakoutCount: toInt(row.breakout_count),
        breakdownCount: toInt(row.breakdown_count),
        eventCount: toInt(row.event_count),
        anomalyCount: toInt(row.anomaly_count)
      }))
      .reverse(),
    watchlist: watchlistRows.map((row) => ({
      tradeDate: toDateKey(row.trade_date),
      symbol: row.symbol,
      series: row.series,
      securityName: row.security_name ?? row.symbol,
      closePrice: toNumber(row.close_price),
      dailyReturn: toNumber(row.daily_return),
      volumeRel20: toNumber(row.volume_rel_20),
      deliveryRel20: toNumber(row.delivery_rel_20),
      compositeTrendScore: toNumber(row.composite_trend_score),
      compositeAnomalyScore: toNumber(row.composite_anomaly_score),
      compositeRiskScore: toNumber(row.composite_risk_score),
      maxSignalStrength: toNumber(row.max_signal_strength),
      signals: row.signals?.split(",").map((item) => item.trim()).filter(Boolean) ?? []
    })),
    signalGroups: groupSignalRows(signalRows),
    signalPerformance: performanceRows.map((row) => ({
      analysisType: row.analysis_type,
      signalName: row.signal_name,
      signalDirection: row.signal_direction,
      sampleSize: toInt(row.sample_size),
      hitRate5d: toNumber(row.hit_rate_5d),
      avgForwardReturn5d: toNumber(row.avg_fwd_return_5d),
      medianForwardReturn5d: toNumber(row.median_fwd_return_5d)
    }))
  };
}

export async function getAnalyticsFlows(prisma: PrismaClient) {
  const [flowRows, eventRows, bulkRows, blockRows] = await Promise.all([
    prisma.$queryRaw<FlowLeaderRow[]>(Prisma.sql`
      WITH latest_date AS (
        SELECT MAX(trade_date) AS trade_date
        FROM nse_app.security_daily_features
      )
      SELECT
        trade_date,
        symbol,
        series,
        security_name,
        close_price,
        daily_return,
        volume_rel_20,
        delivery_rel_20,
        short_sell_qty,
        margin_financed_qty,
        avg_applicable_margin_rate,
        has_announcement
      FROM nse_app.security_daily_features
      WHERE trade_date = (SELECT trade_date FROM latest_date)
      ORDER BY GREATEST(COALESCE(volume_rel_20, 0), COALESCE(delivery_rel_20, 0)) DESC, COALESCE(close_price, 0) DESC
      LIMIT 18
    `),
    prisma.$queryRaw<EventRow[]>(Prisma.sql`
      SELECT
        report_date,
        event_type,
        symbol,
        headline
      FROM nse.fact_text_events
      ORDER BY report_date DESC, loaded_at DESC
      LIMIT 18
    `),
    prisma.$queryRaw<DealRow[]>(Prisma.sql`
      SELECT
        trade_date,
        symbol,
        client_name,
        side,
        quantity_traded,
        trade_price
      FROM nse.fact_bulk_deals
      ORDER BY trade_date DESC, quantity_traded DESC NULLS LAST
      LIMIT 18
    `),
    prisma.$queryRaw<DealRow[]>(Prisma.sql`
      SELECT
        trade_date,
        symbol,
        client_name,
        side,
        quantity_traded,
        trade_price
      FROM nse.fact_block_deals
      ORDER BY trade_date DESC, quantity_traded DESC NULLS LAST
      LIMIT 18
    `)
  ]);

  return {
    asOf: new Date().toISOString(),
    tradeDate: flowRows[0] ? toDateKey(flowRows[0].trade_date) : eventRows[0] ? toDateKey(eventRows[0].report_date) : "",
    flowLeaders: flowRows.map((row) => ({
      tradeDate: toDateKey(row.trade_date),
      symbol: row.symbol,
      series: row.series,
      securityName: row.security_name ?? row.symbol,
      closePrice: toNumber(row.close_price),
      dailyReturn: toNumber(row.daily_return),
      volumeRel20: toNumber(row.volume_rel_20),
      deliveryRel20: toNumber(row.delivery_rel_20),
      shortSellQty: toInt(row.short_sell_qty),
      marginFinancedQty: toInt(row.margin_financed_qty),
      avgApplicableMarginRate: toNumber(row.avg_applicable_margin_rate),
      hasAnnouncement: Boolean(row.has_announcement)
    })),
    announcements: eventRows.map((row) => ({
      reportDate: toDateKey(row.report_date),
      eventType: row.event_type,
      symbol: row.symbol ?? "N/A",
      headline: trimText(row.headline, 240) ?? ""
    })),
    bulkDeals: bulkRows.map((row) => ({
      tradeDate: toDateKey(row.trade_date),
      symbol: row.symbol,
      clientName: row.client_name ?? "Unknown",
      side: row.side ?? "N/A",
      quantityTraded: toInt(row.quantity_traded),
      tradePrice: toNumber(row.trade_price)
    })),
    blockDeals: blockRows.map((row) => ({
      tradeDate: toDateKey(row.trade_date),
      symbol: row.symbol,
      clientName: row.client_name ?? "Unknown",
      side: row.side ?? "N/A",
      quantityTraded: toInt(row.quantity_traded),
      tradePrice: toNumber(row.trade_price)
    }))
  };
}

export async function getAnalyticsQuality(prisma: PrismaClient) {
  const [sourceRows, coverageRows, presenceRows, missingBarRows, failedJobRows, boundaryRows, jobRows, checkRows, pipelineRows] = await Promise.all([
    prisma.$queryRaw<QualitySourceRow[]>(QUALITY_SOURCE_SQL),
    prisma.$queryRaw<QualityCoverageRow[]>(QUALITY_COVERAGE_SQL),
    prisma.$queryRaw<QualityPresenceRow[]>(QUALITY_PRESENCE_SQL),
    prisma.$queryRaw<QualityMissingBarRow[]>(QUALITY_MISSING_BARS_SQL),
    prisma.$queryRaw<QualityJobTimelineRow[]>(QUALITY_FAILED_JOBS_SQL),
    prisma.$queryRaw<QualityBoundaryRow[]>(QUALITY_BOUNDARY_SQL),
    prisma.$queryRaw<JobRunRow[]>(QUALITY_LATEST_JOBS_SQL),
    prisma.$queryRaw<QualityCheckRow[]>(QUALITY_CHECKS_SQL),
    prisma.$queryRaw<PipelineAuditRow[]>(QUALITY_PIPELINE_AUDIT_SQL)
  ]);

  const coverage = coverageRows[0];
  if (!coverage) {
    throw new Error("Analytics quality coverage state is empty.");
  }

  return buildAnalyticsQualityPayload({
    sourceRows,
    coverage,
    presenceRows,
    missingBarRows,
    failedJobRows,
    boundary: boundaryRows[0],
    jobRows,
    checkRows,
    pipelineRows
  });
}

type AnalyticsBoardBriefModules = {
  overview: Awaited<ReturnType<typeof getOverview>>;
  dashboard: Awaited<ReturnType<typeof getAnalyticsDashboard>>;
  marketState: Awaited<ReturnType<typeof getAnalyticsMarketState>>;
  leadership: Awaited<ReturnType<typeof getAnalyticsLeadership>>;
  dailySetups: Awaited<ReturnType<typeof getAnalyticsDailySetups>>;
  optionsStructure: Awaited<ReturnType<typeof getAnalyticsOptionsStructure>>;
  bankNiftyOptions: Awaited<ReturnType<typeof getAnalyticsOptionsStructureForSymbol>>;
  fiiFlow: Awaited<ReturnType<typeof getAnalyticsFiiFlow>>;
  strategyEvaluation: Awaited<ReturnType<typeof getAnalyticsStrategyEvaluation>>;
  quality: Awaited<ReturnType<typeof getAnalyticsQuality>>;
  stockContext?: BoardBriefStockContextRow[];
};

type BoardBriefStockContextRow = {
  symbol: string;
  weight_pct: number | null;
  intraday_rsi14: number | null;
  vwap_dev_pct: number | null;
  time_above_vwap_pct: number | null;
  volume_ratio: number | null;
};

async function getBoardBriefStockContext(prisma: PrismaClient, tradeDate: string | null | undefined) {
  if (!tradeDate) return [] as BoardBriefStockContextRow[];

  return prisma.$queryRaw<BoardBriefStockContextRow[]>(Prisma.sql`
    WITH universe AS (
      SELECT DISTINCT ON (iu.symbol_token)
        iu.symbol_token,
        UPPER(REGEXP_REPLACE(TRIM(iu.tradingsymbol), '-EQ$', '')) AS symbol
      FROM instrument_universe iu
      WHERE iu.exchange = 'NSE'
        AND iu.universe_name = 'nifty100_equity'
        AND iu.active_to IS NULL
        AND COALESCE(TRIM(iu.tradingsymbol), '') <> ''
      ORDER BY iu.symbol_token, iu.active_from DESC NULLS LAST
    ),
    latest_weights AS (
      SELECT symbol, weight_pct
      FROM (
        SELECT
          UPPER(TRIM(symbol)) AS symbol,
          weight_pct,
          ROW_NUMBER() OVER (
            PARTITION BY UPPER(TRIM(symbol))
            ORDER BY
              weight_priority ASC,
              effective_ts DESC NULLS LAST
          ) AS rn
        FROM (
          SELECT
            c.symbol,
            c.weight::double precision AS weight_pct,
            CASE
              WHEN UPPER(TRIM(c.index_name)) IN ('NIFTY50', 'NIFTY 50') THEN 0
              WHEN UPPER(TRIM(c.index_name)) IN ('NIFTY100', 'NIFTY 100') THEN 1
              ELSE 2
            END AS weight_priority,
            COALESCE(c.updated_at, c.as_of_date::timestamp) AS effective_ts
          FROM public.index_constituents c
          WHERE c.weight IS NOT NULL

          UNION ALL

          SELECT
            REGEXP_REPLACE(iu.tradingsymbol, '-EQ$', '') AS symbol,
            iu.weight::double precision AS weight_pct,
            3 AS weight_priority,
            iu.active_from AS effective_ts
          FROM public.instrument_universe iu
          WHERE iu.exchange = 'NSE'
            AND iu.universe_name = 'nifty100_equity'
            AND iu.weight IS NOT NULL

          UNION ALL

          SELECT
            um.symbol,
            um.weight::double precision AS weight_pct,
            4 AS weight_priority,
            COALESCE(um.updated_at, um.effective_from::timestamp) AS effective_ts
          FROM nse_intraday.universe_membership um
          WHERE UPPER(TRIM(um.universe_name)) = 'NIFTY100'
            AND um.weight IS NOT NULL
        ) weight_sources
      ) ranked
      WHERE rn = 1
    ),
    latest_feature AS (
      SELECT
        feature.symbol,
        feature.vwap_dev_bps::double precision / 100.0 AS vwap_dev_pct,
        CASE
          WHEN feature.time_above_vwap_pct IS NULL THEN NULL
          WHEN feature.time_above_vwap_pct <= 1 THEN feature.time_above_vwap_pct::double precision * 100.0
          ELSE feature.time_above_vwap_pct::double precision
        END AS time_above_vwap_pct,
        COALESCE(
          NULLIF(feature.volume_ratio_day::double precision, 0),
          NULLIF(feature.minute_volume_ratio::double precision, 0)
        ) AS volume_ratio
      FROM (
        SELECT
          smf.symbol,
          smf.vwap_dev_bps,
          smf.time_above_vwap_pct,
          smf.volume_ratio_day,
          smf.minute_volume_ratio,
          ROW_NUMBER() OVER (PARTITION BY smf.symbol ORDER BY smf.minute_ts DESC) AS rn
        FROM nse_intraday.security_minute_feature smf
        WHERE smf.trade_date = ${tradeDate}::date
      ) feature
      WHERE feature.rn = 1
    ),
    intraday AS (
      SELECT
        b.symbol_token,
        b.close::double precision AS close,
        ROW_NUMBER() OVER (PARTITION BY b.symbol_token ORDER BY b.ts DESC) AS rn_desc,
        LAG(b.close::double precision) OVER (PARTITION BY b.symbol_token ORDER BY b.ts) AS prev_close
      FROM bars_1m b
      JOIN universe u ON u.symbol_token = b.symbol_token
      WHERE b.exchange = 'NSE'
        AND (b.ts AT TIME ZONE 'Asia/Kolkata')::date = ${tradeDate}::date
    ),
    rsi_window AS (
      SELECT
        symbol_token,
        AVG(GREATEST(close - prev_close, 0)) AS avg_gain,
        AVG(GREATEST(prev_close - close, 0)) AS avg_loss
      FROM intraday
      WHERE rn_desc <= 15
        AND prev_close IS NOT NULL
      GROUP BY symbol_token
    ),
    rsi_calc AS (
      SELECT
        symbol_token,
        CASE
          WHEN avg_loss IS NULL THEN NULL
          WHEN avg_loss = 0 THEN 100
          ELSE 100 - (100 / (1 + (avg_gain / NULLIF(avg_loss, 0))))
        END AS intraday_rsi14
      FROM rsi_window
    )
    SELECT
      u.symbol,
      lw.weight_pct,
      rc.intraday_rsi14,
      lf.vwap_dev_pct,
      lf.time_above_vwap_pct,
      lf.volume_ratio
    FROM universe u
    LEFT JOIN latest_weights lw ON lw.symbol = u.symbol
    LEFT JOIN rsi_calc rc ON rc.symbol_token = u.symbol_token
    LEFT JOIN latest_feature lf ON UPPER(TRIM(lf.symbol)) = u.symbol
    ORDER BY u.symbol ASC
  `);
}

function getIndiaNowParts(now = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
  const parts = Object.fromEntries(formatter.formatToParts(now).map((part) => [part.type, part.value]));
  return {
    weekday: parts.weekday ?? "",
    date: `${parts.year ?? "0000"}-${parts.month ?? "01"}-${parts.day ?? "01"}`,
    hour: Number(parts.hour ?? "0"),
    minute: Number(parts.minute ?? "0")
  };
}

function isIndiaMarketOpen(now = new Date()) {
  const parts = getIndiaNowParts(now);
  if (parts.weekday === "Sat" || parts.weekday === "Sun") return false;
  const minutes = parts.hour * 60 + parts.minute;
  return minutes >= 9 * 60 + 15 && minutes <= 15 * 60 + 45;
}

function compactText(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function titleCaseLabel(value: string | null | undefined, fallback = "Mixed") {
  const normalized = compactText(value).replace(/[_-]+/g, " ").toLowerCase();
  if (!normalized) return fallback;
  return normalized.replace(/\b\w/g, (char) => char.toUpperCase());
}

function pushUnique(items: string[], value: string) {
  const trimmed = compactText(value);
  if (!trimmed || items.includes(trimmed)) return;
  items.push(trimmed);
}

function describeCoverage(expected: number | null | undefined, actual: number | null | undefined) {
  if (!Number.isFinite(expected) || !Number.isFinite(actual)) return null;
  return `${actual}/${expected}`;
}

function formatPrice(value: number | null | undefined, digits = 2) {
  if (value == null || !Number.isFinite(value)) return "NA";
  return value.toFixed(digits);
}

function formatInteger(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "NA";
  return Math.round(value).toString();
}

function formatPct(value: number | null | undefined, digits = 2, signed = false) {
  if (value == null || !Number.isFinite(value)) return "NA";
  const prefix = signed && value > 0 ? "+" : "";
  return `${prefix}${value.toFixed(digits)}%`;
}

function formatRatioPct(value: number | null | undefined, digits = 1, signed = false) {
  if (value == null || !Number.isFinite(value)) return "NA";
  return formatPct(value * 100, digits, signed);
}

function machineValue(value: string | number | null | undefined) {
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NA";
  if (value == null) return "NA";
  const normalized = String(value).replace(/\|/g, "/").replace(/\r?\n/g, " ").trim();
  return normalized || "NA";
}

function numberOrNull(value: number | null | undefined) {
  return value == null || !Number.isFinite(value) ? null : value;
}

function formatWallLabel(strike: number | null | undefined, oi: number | null | undefined) {
  const strikePart = strike == null || !Number.isFinite(strike) ? "NA" : strike.toFixed(0);
  const oiPart = oi == null || !Number.isFinite(oi) ? "NA" : Math.round(oi).toString();
  return strikePart === "NA" && oiPart === "NA" ? "NA" : `${strikePart} (${oiPart} OI)`;
}

function pickExpiries(rows: Array<{ expiry: string | null }>) {
  const unique = rows
    .map((row) => row.expiry)
    .filter((value): value is string => Boolean(value))
    .filter((value, index, items) => items.indexOf(value) === index)
    .sort((left, right) => Date.parse(left) - Date.parse(right));
  return {
    weekly: unique[0] ?? null,
    monthly: unique[1] ?? unique[0] ?? null
  };
}

function mapLeadershipEntry(category: string | null | undefined) {
  if (!category) return "NA";
  const normalized = category.toLowerCase();
  if (normalized.includes("true leader")) return "relative-strength hold";
  if (normalized.includes("follower")) return "pullback entry";
  if (normalized.includes("catch-up")) return "breakout continuation";
  if (normalized.includes("reversal")) return "mean-reversion only";
  return "avoid";
}

export function buildAnalyticsBoardBriefPayload(
  modules: AnalyticsBoardBriefModules,
  now = new Date()
) {
  const {
    overview,
    dashboard,
    marketState,
    leadership,
    dailySetups,
    optionsStructure,
    bankNiftyOptions,
    fiiFlow,
    strategyEvaluation,
    quality,
    stockContext = []
  } = modules;

  const mode = isIndiaMarketOpen(now) ? "live" : "latest_completed";
  const sessionLabel = mode === "live" ? "Live" : "Latest completed session";
  const tradeDate =
    dashboard.marketSummary.tradeDate ||
    marketState.tradeDate ||
    dailySetups.tradeDate ||
    strategyEvaluation.asOfDate ||
    quality.expectedTradeDate ||
    null;
  const timestamp = now.toISOString();
  const freshness = `${titleCaseLabel(quality.summary.verdict)} trust • ${quality.summary.safeModuleCount} safe • ${quality.summary.downgradedModuleCount} downgraded • ${quality.summary.hiddenModuleCount} hidden`;
  const confidenceScore = Math.max(0, Math.min(100, Math.round(quality.summary.trustScore ?? 0)));

  const stateLabel = compactText(marketState.verdict?.dominantState || marketState.session?.primaryState || "balanced / indecisive");
  const leadershipBias = compactText(leadership.summary?.continuationBias || leadership.summary?.marketSupportNote || "");
  const optionsBias = compactText(optionsStructure.summary?.optionsVsSpot || "");
  const flowBackdrop = compactText(fiiFlow.summary?.backdrop || fiiFlow.backdrop || "");
  const strategyBias = compactText(strategyEvaluation.summary?.modelBias || strategyEvaluation.summary?.takeaway || "");
  const qualityVerdict = compactText(quality.summary.verdict);

  let biasScore = 0;
  if (stateLabel.includes("trend")) biasScore += 2;
  if (stateLabel.includes("failed") || stateLabel.includes("chop") || stateLabel.includes("indecisive")) biasScore -= 1;
  if (leadershipBias.includes("continuation") || leadershipBias.includes("hold")) biasScore += 1;
  if (leadershipBias.includes("selective") || leadershipBias.includes("beta")) biasScore -= 0.5;
  if (optionsBias.includes("confirm") || optionsBias.includes("support")) biasScore += 1;
  if (optionsBias.includes("contradict") || optionsBias.includes("noisy")) biasScore -= 1;
  if (flowBackdrop.includes("supportive")) biasScore += 1;
  if (flowBackdrop.includes("contrarian") || flowBackdrop.includes("stretched")) biasScore -= 1;
  if (strategyBias.includes("buy") || strategyBias.includes("constructive") || strategyBias.includes("long")) biasScore += 1;
  if (strategyBias.includes("avoid") || strategyBias.includes("defensive") || strategyBias.includes("reduce")) biasScore -= 1;
  if (qualityVerdict === "fragile") biasScore -= 1;
  if (qualityVerdict === "mixed") biasScore -= 0.5;

  const overallBias = biasScore >= 2 ? "bullish" : biasScore <= -2 ? "bearish" : "mixed";
  const marketBias =
    overallBias === "bullish"
      ? "Constructive with selective continuation, but only while breadth and participation stay aligned."
      : overallBias === "bearish"
        ? "Defensive and fade-aware, with failed moves more trustworthy than clean continuation."
        : "Mixed and selective, with stock picking stronger than broad directional conviction.";

  const positiveRatio = dashboard.marketSummary.positiveRatio;
  const niftyReturnPct = dashboard.marketSummary.niftyReturn != null ? dashboard.marketSummary.niftyReturn * 100 : null;
  const constructiveCount = dailySetups.summary?.constructiveCount ?? 0;
  const deceptiveCount = dailySetups.summary?.deceptiveCount ?? 0;
  const marketStatus = overview.market?.label ?? (mode === "live" ? "OPEN" : "CLOSED");
  const session = marketState.session;
  const niftyQuote = overview.indices?.nifty50 ?? null;
  const bankQuote = overview.indices?.bankNifty ?? null;
  const vixQuote = overview.indices?.indiaVix ?? null;
  const niftySpot = optionsStructure.latestSnapshot?.spot ?? niftyQuote?.last ?? null;
  const bankSpot = bankNiftyOptions.latestSnapshot?.spot ?? bankQuote?.last ?? null;
  const niftyExpiries = pickExpiries(optionsStructure.pcrByExpiry);
  const bankExpiries = pickExpiries(bankNiftyOptions.pcrByExpiry);
  const niftyWeeklyExpiry = optionsStructure.latestSnapshot?.expiryDate ?? niftyExpiries.weekly;
  const niftyMonthlyExpiry = niftyExpiries.monthly ?? optionsStructure.latestSnapshot?.expiryDate ?? null;
  const bankWeeklyExpiry = bankNiftyOptions.latestSnapshot?.expiryDate ?? bankExpiries.weekly;
  const bankMonthlyExpiry = bankExpiries.monthly ?? bankNiftyOptions.latestSnapshot?.expiryDate ?? null;
  const latestPcrRow = optionsStructure.pcrByExpiry[0] ?? null;
  const latestMonthlyPcrRow = optionsStructure.pcrByExpiry[1] ?? optionsStructure.pcrByExpiry[0] ?? null;
  const bankLatestPcrRow = bankNiftyOptions.pcrByExpiry[0] ?? null;
  const bankMonthlyPcrRow = bankNiftyOptions.pcrByExpiry[1] ?? bankNiftyOptions.pcrByExpiry[0] ?? null;
  const niftyAtmIv = optionsStructure.termStructure[0]?.atmIv ?? null;
  const bankAtmIv = bankNiftyOptions.termStructure[0]?.atmIv ?? null;
  const niftyWeeklyMaxPain = optionsStructure.maxPainDrift[0]?.maxPainStrike ?? null;
  const niftyMonthlyMaxPain = optionsStructure.maxPainDrift[1]?.maxPainStrike ?? optionsStructure.maxPainDrift[0]?.maxPainStrike ?? null;
  const bankWeeklyMaxPain = bankNiftyOptions.maxPainDrift[0]?.maxPainStrike ?? null;
  const bankMonthlyMaxPain = bankNiftyOptions.maxPainDrift[1]?.maxPainStrike ?? bankNiftyOptions.maxPainDrift[0]?.maxPainStrike ?? null;
  const latestNiftyWall = (optionsStructure.wallMigration ?? []).at(-1) ?? null;
  const latestBankWall = (bankNiftyOptions.wallMigration ?? []).at(-1) ?? null;
  const niftyCallWallLabel = formatWallLabel(
    optionsStructure.summary?.nearestStructure?.callWall ?? latestNiftyWall?.callWallStrike ?? null,
    latestNiftyWall?.callWallOi ?? null
  );
  const niftyPutWallLabel = formatWallLabel(
    optionsStructure.summary?.nearestStructure?.putWall ?? latestNiftyWall?.putWallStrike ?? null,
    latestNiftyWall?.putWallOi ?? null
  );
  const bankCallWallLabel = formatWallLabel(
    bankNiftyOptions.summary?.nearestStructure?.callWall ?? latestBankWall?.callWallStrike ?? null,
    latestBankWall?.callWallOi ?? null
  );
  const bankPutWallLabel = formatWallLabel(
    bankNiftyOptions.summary?.nearestStructure?.putWall ?? latestBankWall?.putWallStrike ?? null,
    latestBankWall?.putWallOi ?? null
  );
  const optionsQualityNote =
    optionsStructure.summary?.dataQualityFlags?.[0] ??
    optionsStructure.summary?.equilibriumContext ??
    "Persisted option overlays are partial.";

  const fiiParticipants = fiiFlow.participants ?? [];
  const fiiProductValueRows = fiiFlow.charts?.productValueByProduct ?? [];
  const fiiPositioningChangeRows = fiiFlow.charts?.dayOverDayPositioningChange ?? [];
  const currentSetups = dailySetups.currentSetups ?? [];
  const bestCurrentSetups = dailySetups.bestCurrentSetups ?? [];
  const deceptiveSetups = dailySetups.deceptiveSetups ?? [];
  const leadershipRows = leadership.allRows ?? leadership.rankingBoard ?? [];
  const leadershipSectorRows = leadership.sectorStrength ?? [];

  const fiiParticipantMap = new Map(fiiParticipants.map((item) => [item.clientType.toUpperCase(), item]));
  const fiiParticipant = fiiParticipantMap.get("FII") ?? null;
  const clientParticipant = fiiParticipantMap.get("CLIENT") ?? null;
  const propParticipant = fiiParticipantMap.get("PRO") ?? fiiParticipantMap.get("PROPRIETARY") ?? null;
  const fiiIndexValue = fiiProductValueRows.find((item) => item.product.toLowerCase().includes("index")) ?? null;
  const latestFlowChange =
    fiiPositioningChangeRows.filter((item) => item.clientType.toUpperCase() === "FII").at(-1) ?? null;

  const stockSetupMap = new Map(currentSetups.map((item) => [item.symbol.toUpperCase(), item]));
  const leadershipMap = new Map(leadershipRows.map((item) => [item.symbol.toUpperCase(), item]));
  const stockContextMap = new Map(stockContext.map((item) => [item.symbol.toUpperCase(), item]));
  const stockRows = overview.sectors
    .flatMap((sector) =>
      sector.stocks.map((quote) => {
        const symbolKey = quote.symbol.toUpperCase();
        const setup = stockSetupMap.get(symbolKey) ?? null;
        const lead = leadershipMap.get(symbolKey) ?? null;
        const context = stockContextMap.get(symbolKey) ?? null;
        const signalState = compactText(
          setup?.signalName
            ? `${setup.signalName}${setup.signalDirection ? ` ${setup.signalDirection}` : ""}`
            : lead?.category ?? "NA"
        ) || "NA";
        const weightPct = numberOrNull(context?.weight_pct ?? (lead?.universeWeight != null ? lead.universeWeight * 100 : null));
        const contributionPct =
          weightPct != null && quote.changePct != null ? (weightPct * quote.changePct) / 100 : null;
        return {
          symbol: quote.symbol,
          sector: quote.sector ?? "NA",
          last: quote.last ?? null,
          changePct: quote.changePct ?? null,
          weightPct,
          contribPct: numberOrNull(contributionPct),
          dailyRsi14: quote.rsi ?? null,
          intradayRsi14: numberOrNull(context?.intraday_rsi14 ?? null),
          vwapDevPct: numberOrNull(context?.vwap_dev_pct ?? null),
          timeAboveVwapPct: numberOrNull(context?.time_above_vwap_pct ?? lead?.timeAboveVwapPct ?? null),
          volumeRatio: numberOrNull(context?.volume_ratio ?? lead?.volumeRatioDay ?? lead?.minuteVolumeRatio ?? setup?.volumeRel20 ?? null),
          signalState,
          entryStyle: setup?.setupStyle ?? mapLeadershipEntry(lead?.category),
          riskFlag: compactText(setup?.cautionFlags?.[0] ?? lead?.convictionLabel ?? "NA") || "NA",
          rankScore: setup?.rankingScore ?? lead?.leadershipScore ?? quote.changePct ?? -999
        };
      })
    )
    .sort((left, right) => (right.rankScore ?? -999) - (left.rankScore ?? -999));
  const stockWeightCoverageCount = stockRows.filter((row) => row.weightPct != null).length;
  const stockIntradayCoverageCount = stockRows.filter(
    (row) => row.intradayRsi14 != null || row.vwapDevPct != null || row.timeAboveVwapPct != null || row.volumeRatio != null
  ).length;

  const topLeaders = [...stockRows]
    .sort((left, right) => (right.changePct ?? -999) - (left.changePct ?? -999))
    .slice(0, 5)
    .map((item) => `${item.symbol} ${formatPct(item.changePct, 2, true)} • daily RSI ${formatPrice(item.dailyRsi14, 1)} • ${item.signalState}`);
  const topWeakest = [...stockRows]
    .sort((left, right) => (left.changePct ?? 999) - (right.changePct ?? 999))
    .slice(0, 5)
    .map((item) => `${item.symbol} ${formatPct(item.changePct, 2, true)} • daily RSI ${formatPrice(item.dailyRsi14, 1)} • ${item.riskFlag}`);
  const continuationCandidates = bestCurrentSetups
    .filter((item) => item.setupStyle === "breakout continuation")
    .slice(0, 5)
    .map((item) => `${item.symbol} • score ${formatPrice(item.rankingScore, 2)} • 5d hit-rate ${formatPct(item.hitRate5d, 1)} • avg 5d ${formatPct(item.avgForwardReturn5d, 2, true)}`);
  const reversalCandidates = currentSetups
    .filter((item) => item.setupStyle === "mean-reversion only")
    .slice(0, 5)
    .map((item) => `${item.symbol} • reversal score ${formatPrice(item.compositeReversalScore, 2)} • sample ${formatInteger(item.sampleSize)} • avg 3d ${formatPct(item.avgForwardReturn3d, 2, true)}`);

  const sectorScoreMap = new Map(leadershipSectorRows.map((item) => [item.sectorName, item]));
  const sectorLines = [...overview.sectors]
    .map((sector) => {
      const stocks = sector.stocks;
      const advancers = stocks.filter((item) => (item.changePct ?? 0) > 0).length;
      const decliners = stocks.filter((item) => (item.changePct ?? 0) < 0).length;
      const avgChange = stocks.length ? stocks.reduce((sum, item) => sum + (item.changePct ?? 0), 0) / stocks.length : null;
      const rsiRows = stocks.filter((item) => item.rsi != null);
      const avgRsi = rsiRows.length ? rsiRows.reduce((sum, item) => sum + (item.rsi ?? 0), 0) / rsiRows.length : null;
      const strongest = [...stocks].sort((left, right) => (right.changePct ?? -999) - (left.changePct ?? -999))[0];
      const weakest = [...stocks].sort((left, right) => (left.changePct ?? 999) - (right.changePct ?? 999))[0];
      return {
        sector: sector.sector,
        avgChange,
        advancers,
        decliners,
        avgRsi,
        leadershipScore: sectorScoreMap.get(sector.sector)?.avgLeadershipScore ?? null,
        strongest: strongest?.symbol ?? "NA",
        weakest: weakest?.symbol ?? "NA"
      };
    })
    .sort((left, right) => (right.avgChange ?? -999) - (left.avgChange ?? -999));

  const headline = compactText(
    `NIFTY 50 ${formatPrice(niftyQuote?.last ?? session?.lastPrice ?? null)} (${formatPct(
      niftyQuote?.changePct ?? niftyReturnPct,
      2,
      true
    )}), breadth ${formatInteger(dashboard.marketSummary.advancers)}/${formatInteger(
      dashboard.marketSummary.decliners
    )}, weekly PCR ${formatPrice(latestPcrRow?.pcr ?? null, 2)}, FII backdrop ${titleCaseLabel(fiiFlow.backdrop)}.`
  );

  const decoratedHeader = [
    "╔════════════════════════════  NIFTY MARKET DOSSIER  ════════════════════════════╗",
    `║ Mode: ${mode.toUpperCase()} | As Of: ${timestamp} | Market: ${marketStatus} | Bias: ${overallBias.toUpperCase()} | Confidence: ${confidenceScore} | Freshness: ${freshness}`,
    `║ Session: ${sessionLabel} ${tradeDate ?? "NA"} | Expected trade date: ${quality.expectedTradeDate ?? "NA"}`,
    "╚══════════════════════════════════════════════════════════════════════════════════╝"
  ];

  const keyConclusions = [
    compactText(
      `Index tone is ${titleCaseLabel(stateLabel)} because NIFTY 50 closed ${formatPct(
        niftyQuote?.changePct ?? niftyReturnPct,
        2,
        true
      )} while breadth finished ${formatRatioPct(positiveRatio, 1)} and weighted participation printed ${formatPct(session?.weightedParticipationPct, 1)}.`
    ),
    compactText(
      `Leadership is selective rather than index-wide because true leaders are ${formatInteger(
        leadership.summary?.trueLeaderCount ?? null
      )} while avoid names are ${formatInteger(leadership.summary?.avoidCount ?? null)} and top-10 concentration sits at ${formatPct(
        session?.top10ConcentrationPct,
        1
      )}.`
    ),
    compactText(
      `Daily setups are usable but not indiscriminate because constructive setups are ${formatInteger(
        constructiveCount
      )} versus deceptive setups ${formatInteger(deceptiveCount)}, and strategy average historical edge is ${formatPct(
        strategyEvaluation.summary?.avgHistoricalEdge != null ? strategyEvaluation.summary.avgHistoricalEdge * 100 : null,
        2,
        true
      )}.`
    ),
    compactText(
      `Options are ${optionsBias ? optionsBias.toLowerCase() : "mixed"} because weekly max pain is ${formatPrice(
        niftyWeeklyMaxPain
      )}, weekly PCR is ${formatPrice(latestPcrRow?.pcr ?? null, 2)}, and nearest walls are call ${formatPrice(
        optionsStructure.summary?.nearestStructure.callWall ?? null
      )} versus put ${formatPrice(optionsStructure.summary?.nearestStructure.putWall ?? null)}.`
    ),
    compactText(
      `Participant flow is context, not trigger, because the latest official report is ${fiiFlow.latestTradeDate ?? "NA"} with lag ${formatInteger(
        fiiFlow.reportLagDays
      )} days, FII all-product net OI is ${formatPct(fiiParticipant?.oiNetPct, 1, true)}, and client net OI is ${formatPct(
        clientParticipant?.oiNetPct,
        1,
        true
      )}.`
    )
  ];

  const riskFlags = [
    compactText(`Market risk: breadth ${formatRatioPct(positiveRatio, 1)} and weighted participation ${formatPct(session?.weightedParticipationPct, 1)} are not strong enough to justify broad conviction on index color alone.`),
    compactText(`Options risk: weekly PCR ${formatPrice(latestPcrRow?.pcr ?? null, 2)} and max pain ${formatPrice(niftyWeeklyMaxPain)} are context only, and ${optionsStructure.summary?.dataQualityFlags?.[0] ?? "options overlays still have freshness caveats"}.`),
    compactText(`Flow risk: latest official participant date is ${fiiFlow.latestTradeDate ?? "NA"} with lag ${formatInteger(fiiFlow.reportLagDays)} days, so same-day price and flow can diverge without that being an error.`),
    compactText(`Stock-selection risk: top leader count ${formatInteger(leadership.summary?.trueLeaderCount ?? null)} can still hide beta passengers, and ${formatInteger(deceptiveCount)} deceptive daily setups warn against chasing single-candle moves.`),
    compactText(`Data-quality risk: trust score is ${confidenceScore} with ${formatInteger(quality.summary.hiddenModuleCount)} hidden modules and ${formatInteger(quality.summary.downgradedModuleCount)} downgraded modules, so stale layers must reduce conviction explicitly.`)
  ];

  const nextAlerts = [
    compactText(`Alert if breadth moves from ${formatInteger(dashboard.marketSummary.advancers)}/${formatInteger(dashboard.marketSummary.decliners)} toward a stronger 60%+ participation profile, because that would confirm broader continuation.`),
    compactText(`Alert if NIFTY spot ${formatPrice(niftySpot)} moves decisively away from weekly max pain ${formatPrice(niftyWeeklyMaxPain)} while call wall ${formatPrice(optionsStructure.summary?.nearestStructure.callWall ?? null)} or put wall ${formatPrice(optionsStructure.summary?.nearestStructure.putWall ?? null)} migrates.`),
    compactText(`Alert if FII net OI percentile ${formatPct(fiiParticipant?.oiPercentile, 1)} and client spread ${formatPct((fiiParticipant?.oiNetPct ?? 0) - (clientParticipant?.oiNetPct ?? 0), 1, true)} move toward an extreme reversal context.`),
    compactText(`Alert if continuation names keep volume ratio above ${formatPrice(bestCurrentSetups[0]?.volumeRel20 ?? null, 2)} and hold RSI strength, because that separates leadership from beta passengers.`),
    compactText(`Alert if trust score falls below 40 or hidden modules rise above ${formatInteger(quality.summary.hiddenModuleCount)}, because the board should downgrade conclusions before interpretation gets stronger.`)
  ];

  const regimeHistory = dashboard.regimeHistory ?? [];
  const currentRow = regimeHistory.at(-1) ?? null;
  const priorRow = regimeHistory.at(-2) ?? null;
  const changedVsPriorSession =
    currentRow && priorRow
      ? compactText(
          `Versus the prior session, breadth ${toNumber(currentRow.positiveRatio) > toNumber(priorRow.positiveRatio) ? "improved" : toNumber(currentRow.positiveRatio) < toNumber(priorRow.positiveRatio) ? "weakened" : "held steady"}, breakout pressure ${toNumber(currentRow.breakoutCount) > toNumber(priorRow.breakoutCount) ? "expanded" : toNumber(currentRow.breakoutCount) < toNumber(priorRow.breakoutCount) ? "contracted" : "was unchanged"}, and the regime shifted from ${titleCaseLabel(priorRow.marketRegime)} to ${titleCaseLabel(currentRow.marketRegime)}.`
        )
      : "Prior-session comparison is limited because one of the historical regime snapshots is missing.";

  const confirmingModules: string[] = [];
  const contradictingModules: string[] = [];

  if (biasScore >= 0) {
    if ((positiveRatio ?? 0) >= 0.5 || (niftyReturnPct ?? 0) > 0) pushUnique(confirmingModules, "Market State");
    if ((leadership.summary?.trueLeaderCount ?? 0) > (leadership.summary?.avoidCount ?? 0)) pushUnique(confirmingModules, "Stock Leadership");
    if ((dailySetups.summary?.constructiveCount ?? 0) >= (dailySetups.summary?.deceptiveCount ?? 0)) pushUnique(confirmingModules, "Daily Setups");
    if (flowBackdrop.includes("contrarian") || flowBackdrop.includes("stretched")) pushUnique(contradictingModules, "FII / Participant Flow");
    if (quality.summary.verdict !== "healthy") pushUnique(contradictingModules, "System Quality");
    if (optionsBias.includes("contradict") || optionsBias.includes("noisy")) pushUnique(contradictingModules, "Options Structure");
  } else {
    if (quality.summary.verdict !== "healthy") pushUnique(confirmingModules, "System Quality");
    if (stateLabel.includes("failed") || stateLabel.includes("chop") || stateLabel.includes("indecisive")) pushUnique(confirmingModules, "Market State");
    if (flowBackdrop.includes("contrarian") || flowBackdrop.includes("stretched")) pushUnique(confirmingModules, "FII / Participant Flow");
    if ((leadership.summary?.trueLeaderCount ?? 0) > (leadership.summary?.avoidCount ?? 0)) pushUnique(contradictingModules, "Stock Leadership");
    if ((dailySetups.summary?.constructiveCount ?? 0) > (dailySetups.summary?.deceptiveCount ?? 0)) pushUnique(contradictingModules, "Daily Setups");
    if ((strategyEvaluation.summary?.avgHistoricalEdge ?? 0) > 0 && !compactText(strategyEvaluation.summary?.modelBias).includes("avoid")) {
      pushUnique(contradictingModules, "Strategy Evaluation");
    }
  }
  if (!confirmingModules.length) pushUnique(confirmingModules, "System Quality");
  if (!contradictingModules.length) pushUnique(contradictingModules, "Event / Institutional Context");

  const qualityFlags = quality.moduleStatus
    .filter((item) => item.status !== "safe")
    .slice(0, 3)
    .map((item) => `${item.label}: ${item.reason}`);

  const moduleStatus = quality.moduleStatus.map((item) => ({
    moduleKey: item.moduleKey,
    label: item.label,
    status: item.status,
    note: compactText(`${item.reason} ${item.staleNote}`),
    route: item.route,
    expectedTradeDate: item.expectedTradeDate ?? null,
    lastSeenDate: item.lastSeenDate ?? null,
    trustScore: item.trustScore ?? null,
    expectedCount: item.expectedCount ?? null,
    actualCount: item.actualCount ?? null
  }));

  const indexSnapshot = [
    `NIFTY50 last=${formatPrice(niftyQuote?.last ?? session?.lastPrice ?? null)} chg=${formatPct(niftyQuote?.changePct ?? niftyReturnPct, 2, true)} open=NA high=NA low=NA prev_close=${formatPrice(session?.prevClose ?? null)} gap=${formatPct(session?.gapPct, 2, true)} range=${formatPct(session?.sessionRangePct, 2)} daily_rsi14=${formatPrice(niftyQuote?.rsi ?? null, 1)} intraday_rsi14=NA vwap_dev_pct=NA breadth=${formatInteger(dashboard.marketSummary.advancers)}/${formatInteger(dashboard.marketSummary.decliners)} weighted_participation=${formatPct(session?.weightedParticipationPct, 1)} top10_concentration=${formatPct(session?.top10ConcentrationPct, 1)}`,
    `BANKNIFTY last=${formatPrice(bankQuote?.last ?? null)} chg=${formatPct(bankQuote?.changePct ?? null, 2, true)} open=NA high=NA low=NA prev_close=NA gap=NA range=NA daily_rsi14=${formatPrice(bankQuote?.rsi ?? null, 1)} intraday_rsi14=NA vwap_dev_pct=NA breadth=NA weighted_participation=NA top10_concentration=NA`,
    `INDIAVIX last=${formatPrice(vixQuote?.last ?? null)} chg=${formatPct(vixQuote?.changePct ?? null, 2, true)} daily_rsi14=${formatPrice(vixQuote?.rsi ?? null, 1)} intraday_rsi14=NA`,
    `Index takeaway: NIFTY is ${formatPct(niftyQuote?.changePct ?? niftyReturnPct, 2, true)} with breadth ${formatInteger(dashboard.marketSummary.advancers)}/${formatInteger(dashboard.marketSummary.decliners)} and weighted participation ${formatPct(session?.weightedParticipationPct, 1)}, so price and participation are being read together rather than separately.`
  ];

  const optionsSnapshot = [
    `NIFTY spot=${formatPrice(niftySpot)} weekly_expiry=${niftyWeeklyExpiry ?? "NA"} monthly_expiry=${niftyMonthlyExpiry ?? "NA"} weekly_max_pain=${formatPrice(niftyWeeklyMaxPain)} monthly_max_pain=${formatPrice(niftyMonthlyMaxPain)} weekly_pcr=${formatPrice(latestPcrRow?.pcr ?? null, 2)} monthly_pcr=${formatPrice(latestMonthlyPcrRow?.pcr ?? null, 2)} atm_iv=${formatPrice(niftyAtmIv, 2)} call_wall=${niftyCallWallLabel} put_wall=${niftyPutWallLabel}`,
    `BANKNIFTY spot=${formatPrice(bankSpot)} weekly_expiry=${bankWeeklyExpiry ?? "NA"} monthly_expiry=${bankMonthlyExpiry ?? "NA"} weekly_max_pain=${formatPrice(bankWeeklyMaxPain)} monthly_max_pain=${formatPrice(bankMonthlyMaxPain)} weekly_pcr=${formatPrice(bankLatestPcrRow?.pcr ?? null, 2)} monthly_pcr=${formatPrice(bankMonthlyPcrRow?.pcr ?? null, 2)} atm_iv=${formatPrice(bankAtmIv, 2)} call_wall=${bankCallWallLabel} put_wall=${bankPutWallLabel}`,
    `Options takeaway: NIFTY options ${optionsBias || "are mixed"} with weekly max pain ${formatPrice(niftyWeeklyMaxPain)}, weekly PCR ${formatPrice(latestPcrRow?.pcr ?? null, 2)}, latest call-wall OI ${formatInteger(latestNiftyWall?.callWallOi ?? null)}, latest put-wall OI ${formatInteger(latestNiftyWall?.putWallOi ?? null)}, and quality note: ${compactText(optionsQualityNote)}`
  ];

  const fiiSnapshot = [
    `report_date=${fiiFlow.latestTradeDate ?? "NA"} freshness=${fiiFlow.contextLayer} fii_index_futures_long_pct=NA fii_stock_futures_long_pct=NA client_index_futures_long_pct=NA prop_index_futures_long_pct=NA fii_all_product_net_pct=${formatPct(fiiParticipant?.oiNetPct, 1, true)} client_all_product_net_pct=${formatPct(clientParticipant?.oiNetPct, 1, true)} prop_all_product_net_pct=${formatPct(propParticipant?.oiNetPct, 1, true)} fii_buy_value_cr=${formatPrice(fiiIndexValue?.buyValueCr ?? null)} fii_sell_value_cr=${formatPrice(fiiIndexValue?.sellValueCr ?? null)} fii_open_interest_value_cr=${formatPrice(fiiIndexValue?.openInterestValueCr ?? null)} d1_change_pct_points=${formatPct(latestFlowChange?.dayChangePctPoints ?? null, 1, true)} percentile=${formatPct(fiiParticipant?.oiPercentile, 1)}`,
    `FII takeaway: latest official flow backdrop is ${titleCaseLabel(fiiFlow.backdrop)} from ${fiiFlow.latestTradeDate ?? "NA"}, with FII all-product net ${formatPct(fiiParticipant?.oiNetPct, 1, true)} versus client ${formatPct(clientParticipant?.oiNetPct, 1, true)} and lag ${formatInteger(fiiFlow.reportLagDays)} days.`
  ];

  const sectorSnapshot = sectorLines.map(
    (item, index) =>
      `${index + 1}) ${item.sector}: chg ${formatPct(item.avgChange, 2, true)} • breadth ${item.advancers}/${item.decliners} • avg RSI ${formatPrice(item.avgRsi, 1)} • leadership score ${formatPrice(item.leadershipScore, 1)} • strongest ${item.strongest} • weakest ${item.weakest}`
  );
  sectorSnapshot.push(
    `Sector takeaway: strongest sector is ${sectorLines[0]?.sector ?? "NA"} at ${formatPct(sectorLines[0]?.avgChange ?? null, 2, true)}, while weakest sector is ${sectorLines.at(-1)?.sector ?? "NA"} at ${formatPct(sectorLines.at(-1)?.avgChange ?? null, 2, true)}.`
  );

  const bestEntries = {
    continuation: bestCurrentSetups
      .filter((item) => item.setupStyle === "breakout continuation")
      .slice(0, 3)
      .map(
        (item) =>
          `${item.symbol}: trigger above breakout confirmation with volume_rel_20 ${formatPrice(
            item.volumeRel20,
            2
          )}; confirm with daily RSI ${formatPrice(stockRows.find((row) => row.symbol === item.symbol)?.dailyRsi14 ?? null, 1)} and 5d hit-rate ${formatPct(
            item.hitRate5d,
            1
          )}; invalidate if ${item.cautionFlags[0] ?? "volume structure breaks"}; reason ${item.reasons[0] ?? item.rationale ?? "relative strength is persistent"}.`
      ),
    pullback: bestCurrentSetups
      .filter((item) => item.setupStyle === "pullback entry")
      .slice(0, 3)
      .map(
        (item) =>
          `${item.symbol}: trigger on pullback hold near prior breakout with volume_rel_20 ${formatPrice(
            item.volumeRel20,
            2
          )}; confirm with distance_from_52w_high ${formatPct(item.distanceFrom52wHighPct, 2, true)} and 3d hit-rate ${formatPct(
            item.hitRate3d,
            1
          )}; invalidate if ${item.cautionFlags[0] ?? "signal quality fades"}; reason ${item.reasons[0] ?? item.rationale ?? "trend quality survives pullback"}.`
      ),
    reversal: currentSetups
      .filter((item) => item.setupStyle === "mean-reversion only")
      .slice(0, 3)
      .map(
        (item) =>
          `${item.symbol}: trigger only after reversal confirmation with composite_reversal_score ${formatPrice(
            item.compositeReversalScore,
            2
          )}; confirm with 1d avg forward ${formatPct(item.avgForwardReturn1d, 2, true)} and sample ${formatInteger(
            item.sampleSize
          )}; invalidate if ${item.cautionFlags[0] ?? "downtrend continues"}; reason ${item.reasons[0] ?? item.rationale ?? "setup is mean-reversion only"}.`
      ),
    avoid: deceptiveSetups.slice(0, 3).map(
      (item) =>
        `${item.symbol}: avoid because quality is ${item.qualityLabel}, sample ${formatInteger(
          item.sampleSize
        )}, and caution ${item.cautionFlags[0] ?? "follow-through is weak"}; confirm risk if volume_rel_20 ${formatPrice(
          item.volumeRel20,
          2
        )} is not supported by expectancy.`
    )
  };

  const howToReadToday = [
    `RSI: daily RSI14 around 55-65 usually means healthy momentum, while RSI above 70 is stretched, not automatically bullish. Today NIFTY daily RSI is ${formatPrice(niftyQuote?.rsi ?? null, 1)}.`,
    `Breadth and weighted participation: breadth ${formatInteger(dashboard.marketSummary.advancers)}/${formatInteger(dashboard.marketSummary.decliners)} tells you how many names are helping, while weighted participation ${formatPct(session?.weightedParticipationPct, 1)} tells you whether index heavyweights agree.`,
    `Max pain and PCR: weekly max pain ${formatPrice(niftyWeeklyMaxPain)} is a pinning context level, not destiny, and weekly PCR ${formatPrice(latestPcrRow?.pcr ?? null, 2)} must be read with walls and IV, not alone.`,
    `FII long %: latest official FII all-product net OI is ${formatPct(fiiParticipant?.oiNetPct, 1, true)} on report date ${fiiFlow.latestTradeDate ?? "NA"}, which is context for next-session bias, not an intraday entry trigger.`,
    `Conflicting signals matter: a stock can be green yet weak if RSI, volume ratio, or signal quality do not confirm; that is why the board cross-checks price, breadth, options, flow, and quality together.`
  ];

  const dataQuality = quality.moduleStatus.map(
    (item) =>
      `${item.label}: ${titleCaseLabel(item.status)} • trust ${formatInteger(item.trustScore)} • last_seen ${item.lastSeenDate ?? "NA"} • expected ${item.expectedTradeDate ?? "NA"} • coverage ${describeCoverage(item.expectedCount, item.actualCount) ?? "NA"} • ${compactText(`${item.reason} ${item.staleNote}`)}`
  );
  if (stockWeightCoverageCount < stockRows.length) {
    qualityFlags.push("Stock weights: Official constituent weights are missing in the persisted reference tables, so weight-based contribution is suppressed.");
    dataQuality.push(
      `Stock weight context: Partial • trust ${formatInteger(
        stockRows.length === 0 ? 0 : Math.round((stockWeightCoverageCount / stockRows.length) * 100)
      )} • last_seen ${tradeDate ?? "NA"} • expected ${tradeDate ?? "NA"} • coverage ${stockWeightCoverageCount}/${stockRows.length} • Official constituent weights are missing in the persisted reference tables, so weight_pct and contrib_pct stay suppressed where no real weight exists.`
    );
  }
  if (stockIntradayCoverageCount < stockRows.length) {
    qualityFlags.push("Stock intraday context: Some names are missing latest-session VWAP or RSI context, so stock-level momentum is partial.");
    dataQuality.push(
      `Stock intraday context: Partial • trust ${formatInteger(
        stockRows.length === 0 ? 0 : Math.round((stockIntradayCoverageCount / stockRows.length) * 100)
      )} • last_seen ${tradeDate ?? "NA"} • expected ${tradeDate ?? "NA"} • coverage ${stockIntradayCoverageCount}/${stockRows.length} • Intraday RSI/VWAP context is only shown where latest-session feature rows or bars are available.`
    );
  }

  const llm_brief = compactText(
    `${sessionLabel} ${tradeDate ?? "unknown"} as of ${timestamp}; market ${marketStatus}; confidence ${confidenceScore}; freshness ${freshness}. NIFTY 50 ${formatPrice(
      niftyQuote?.last ?? session?.lastPrice ?? null
    )} ${formatPct(niftyQuote?.changePct ?? niftyReturnPct, 2, true)} with breadth ${formatInteger(
      dashboard.marketSummary.advancers
    )}/${formatInteger(dashboard.marketSummary.decliners)}, weighted participation ${formatPct(
      session?.weightedParticipationPct,
      1
    )}, top-10 concentration ${formatPct(session?.top10ConcentrationPct, 1)}, daily RSI ${formatPrice(
      niftyQuote?.rsi ?? null,
      1
    )}. NIFTY weekly max pain ${formatPrice(niftyWeeklyMaxPain)}, weekly PCR ${formatPrice(
      latestPcrRow?.pcr ?? null,
      2
    )}, ATM IV ${formatPrice(niftyAtmIv, 2)}, call wall ${formatPrice(
      optionsStructure.summary?.nearestStructure.callWall ?? null
    )}, put wall ${formatPrice(optionsStructure.summary?.nearestStructure.putWall ?? null)}. Latest official FII report ${fiiFlow.latestTradeDate ?? "NA"} with backdrop ${titleCaseLabel(
      fiiFlow.backdrop
    )}, FII all-product net ${formatPct(fiiParticipant?.oiNetPct, 1, true)}, client all-product net ${formatPct(
      clientParticipant?.oiNetPct,
      1,
      true
    )}. Constructive setups ${formatInteger(constructiveCount)} versus deceptive ${formatInteger(
      deceptiveCount
    )}; true leaders ${formatInteger(leadership.summary?.trueLeaderCount ?? null)}; trust score ${confidenceScore}; hidden modules ${formatInteger(
      quality.summary.hiddenModuleCount
    )}. Confirming modules: ${confirmingModules.join(", ")}. Contradicting modules: ${contradictingModules.join(", ")}.`
  );

  const machineFacts = [
    `META|as_of=${machineValue(timestamp)}|mode=${machineValue(mode)}|market_status=${machineValue(marketStatus)}|session_reference=${machineValue(tradeDate)}|freshness=${machineValue(freshness)}|confidence_score=${machineValue(confidenceScore)}|overall_bias=${machineValue(overallBias)}`,
    `INDEX|name=NIFTY50|last=${machineValue(niftyQuote?.last ?? session?.lastPrice ?? null)}|chg_pct=${machineValue(niftyQuote?.changePct ?? niftyReturnPct)}|daily_rsi14=${machineValue(niftyQuote?.rsi ?? null)}|intraday_rsi14=NA|gap_pct=${machineValue(session?.gapPct)}|range_pct=${machineValue(session?.sessionRangePct)}|breadth_up_pct=${machineValue(positiveRatio != null ? positiveRatio * 100 : null)}|weighted_participation_pct=${machineValue(session?.weightedParticipationPct)}|top10_concentration_pct=${machineValue(session?.top10ConcentrationPct)}`,
    `INDEX|name=BANKNIFTY|last=${machineValue(bankQuote?.last ?? null)}|chg_pct=${machineValue(bankQuote?.changePct ?? null)}|daily_rsi14=${machineValue(bankQuote?.rsi ?? null)}|intraday_rsi14=NA|gap_pct=NA|range_pct=NA|breadth_up_pct=NA|weighted_participation_pct=NA|top10_concentration_pct=NA`,
    `OPTION|name=NIFTY|spot=${machineValue(niftySpot)}|weekly_expiry=${machineValue(niftyWeeklyExpiry)}|monthly_expiry=${machineValue(niftyMonthlyExpiry)}|weekly_max_pain=${machineValue(niftyWeeklyMaxPain)}|monthly_max_pain=${machineValue(niftyMonthlyMaxPain)}|weekly_pcr=${machineValue(latestPcrRow?.pcr ?? null)}|monthly_pcr=${machineValue(latestMonthlyPcrRow?.pcr ?? null)}|call_wall=${machineValue(niftyCallWallLabel)}|put_wall=${machineValue(niftyPutWallLabel)}|atm_iv=${machineValue(niftyAtmIv)}|call_wall_oi=${machineValue(latestNiftyWall?.callWallOi ?? null)}|put_wall_oi=${machineValue(latestNiftyWall?.putWallOi ?? null)}|options_bias=${machineValue(optionsBias || "mixed")}`,
    `OPTION|name=BANKNIFTY|spot=${machineValue(bankSpot)}|weekly_expiry=${machineValue(bankWeeklyExpiry)}|monthly_expiry=${machineValue(bankMonthlyExpiry)}|weekly_max_pain=${machineValue(bankWeeklyMaxPain)}|monthly_max_pain=${machineValue(bankMonthlyMaxPain)}|weekly_pcr=${machineValue(bankLatestPcrRow?.pcr ?? null)}|monthly_pcr=${machineValue(bankMonthlyPcrRow?.pcr ?? null)}|call_wall=${machineValue(bankCallWallLabel)}|put_wall=${machineValue(bankPutWallLabel)}|atm_iv=${machineValue(bankAtmIv)}|call_wall_oi=${machineValue(latestBankWall?.callWallOi ?? null)}|put_wall_oi=${machineValue(latestBankWall?.putWallOi ?? null)}|options_bias=${machineValue(bankNiftyOptions.summary?.optionsVsSpot || "mixed")}`,
    `FII|report_date=${machineValue(fiiFlow.latestTradeDate)}|freshness=${machineValue(fiiFlow.contextLayer)}|fii_index_futures_long_pct=NA|fii_stock_futures_long_pct=NA|client_index_futures_long_pct=NA|prop_index_futures_long_pct=NA|fii_all_product_net_pct=${machineValue(fiiParticipant?.oiNetPct ?? null)}|client_all_product_net_pct=${machineValue(clientParticipant?.oiNetPct ?? null)}|prop_all_product_net_pct=${machineValue(propParticipant?.oiNetPct ?? null)}|spread_pct=${machineValue((fiiParticipant?.oiNetPct ?? 0) - (clientParticipant?.oiNetPct ?? 0))}|flow_bias=${machineValue(fiiFlow.backdrop)}`,
    ...sectorLines.map(
      (item) =>
        `SECTOR|name=${machineValue(item.sector)}|chg_pct=${machineValue(item.avgChange)}|advancers=${machineValue(item.advancers)}|decliners=${machineValue(item.decliners)}|avg_rsi=${machineValue(item.avgRsi)}|leadership_score=${machineValue(item.leadershipScore)}|strongest=${machineValue(item.strongest)}|weakest=${machineValue(item.weakest)}`
    ),
    ...stockRows.map(
      (row) =>
        `STOCK|symbol=${machineValue(row.symbol)}|sector=${machineValue(row.sector)}|last=${machineValue(row.last)}|chg_pct=${machineValue(row.changePct)}|weight_pct=${machineValue(row.weightPct)}|contrib_pct=${machineValue(row.contribPct)}|daily_rsi14=${machineValue(row.dailyRsi14)}|intraday_rsi14=${machineValue(row.intradayRsi14)}|vwap_dev_pct=${machineValue(row.vwapDevPct)}|time_above_vwap_pct=${machineValue(row.timeAboveVwapPct)}|volume_ratio=${machineValue(row.volumeRatio)}|signal_state=${machineValue(row.signalState)}|entry_style=${machineValue(row.entryStyle)}|risk_flag=${machineValue(row.riskFlag)}`
    ),
    ...nextAlerts.map((item) => `ALERT|type=watch|severity=medium|message=${machineValue(item)}`),
    ...quality.moduleStatus.map(
      (item) =>
        `QUALITY|module=${machineValue(item.label)}|status=${machineValue(item.status)}|last_seen=${machineValue(item.lastSeenDate)}|expected_trade_date=${machineValue(item.expectedTradeDate)}|coverage=${machineValue(describeCoverage(item.expectedCount, item.actualCount))}|trust=${machineValue(item.trustScore)}|note=${machineValue(`${item.reason} ${item.staleNote}`)}`
    ),
    `QUALITY|module=Stock Weight Context|status=${machineValue(stockWeightCoverageCount < stockRows.length ? "partial" : "safe")}|last_seen=${machineValue(tradeDate)}|expected_trade_date=${machineValue(tradeDate)}|coverage=${machineValue(`${stockWeightCoverageCount}/${stockRows.length}`)}|trust=${machineValue(
      stockRows.length === 0 ? 0 : Math.round((stockWeightCoverageCount / stockRows.length) * 100)
    )}|note=${machineValue(
      "Official constituent weights are missing in persisted reference tables, so weight_pct and contrib_pct stay suppressed where no real weight exists."
    )}`,
    `QUALITY|module=Stock Intraday Context|status=${machineValue(stockIntradayCoverageCount < stockRows.length ? "partial" : "safe")}|last_seen=${machineValue(tradeDate)}|expected_trade_date=${machineValue(tradeDate)}|coverage=${machineValue(`${stockIntradayCoverageCount}/${stockRows.length}`)}|trust=${machineValue(
      stockRows.length === 0 ? 0 : Math.round((stockIntradayCoverageCount / stockRows.length) * 100)
    )}|note=${machineValue(
      "Intraday RSI and VWAP context are only shown where latest-session feature rows or bars are available."
    )}`
  ];

  return {
    asOf: timestamp,
    sessionReference: {
      label: sessionLabel,
      tradeDate,
      timestamp,
      expectedTradeDate: quality.expectedTradeDate,
      freshness,
      mode,
      marketStatus,
      confidenceScore,
      overallBias
    },
    decoratedHeader,
    marketHeadline: headline,
    headline,
    marketBias,
    keyConclusions,
    indexSnapshot,
    optionsSnapshot,
    fiiSnapshot,
    sectorSnapshot,
    fullStockSnapshot: {
      columns: [
        "symbol",
        "sector",
        "last",
        "chg_pct",
        "weight_pct",
        "contrib_pct",
        "daily_rsi14",
        "intraday_rsi14",
        "vwap_dev_pct",
        "volume_ratio",
        "signal_state",
        "entry_style",
        "risk_flag"
      ],
      rows: stockRows.map((row) => ({
        symbol: row.symbol,
        sector: row.sector,
        last: formatPrice(row.last),
        chg_pct: formatPct(row.changePct, 2, true),
        weight_pct: formatPct(row.weightPct, 2),
        contrib_pct: formatPct(row.contribPct, 2, true),
        daily_rsi14: formatPrice(row.dailyRsi14, 1),
        intraday_rsi14: formatPrice(row.intradayRsi14, 1),
        vwap_dev_pct: formatPct(row.vwapDevPct, 2, true),
        volume_ratio: formatPrice(row.volumeRatio, 2),
        signal_state: row.signalState,
        entry_style: row.entryStyle,
        risk_flag: row.riskFlag
      })),
      topLeaders,
      topWeakest,
      continuationCandidates,
      reversalCandidates
    },
    bestEntries,
    riskFlags,
    nextAlerts,
    watchNext: nextAlerts,
    changedVsPriorSession,
    moduleAlignment: {
      confirming: confirmingModules.slice(0, 4),
      contradicting: contradictingModules.slice(0, 4),
      qualityFlags
    },
    moduleStatus,
    howToReadToday,
    dataQuality,
    llm_brief,
    machineFacts,
    rootRouteTakeaway: compactText(
      `Root-route takeaway: ${titleCaseLabel(stateLabel)} with NIFTY 50 ${formatPct(
        niftyQuote?.changePct ?? niftyReturnPct,
        2,
        true
      )}, breadth ${formatInteger(dashboard.marketSummary.advancers)}/${formatInteger(
        dashboard.marketSummary.decliners
      )}, weekly PCR ${formatPrice(latestPcrRow?.pcr ?? null, 2)}, and trust score ${confidenceScore} means the board favors measured stock selection over unsupported certainty.`
    )
  };
}

export async function getAnalyticsBoardBrief(prisma: PrismaClient) {
  // The dashboard containers run with a very small Prisma pool in local Docker.
  // Building all module summaries in parallel easily exhausts that pool, so
  // compose the board brief with bounded concurrency instead of fan-out.
  const overview = await getOverview(prisma);
  const dashboard = await getAnalyticsDashboard(prisma);
  const marketState = await getAnalyticsMarketState(prisma);
  const stockContext = await getBoardBriefStockContext(prisma, marketState.tradeDate ?? dashboard.marketSummary.tradeDate ?? null);
  const leadership = await getAnalyticsLeadership(prisma);
  const dailySetups = await getAnalyticsDailySetups(prisma);
  const optionsStructure = await getAnalyticsOptionsStructure(prisma);
  const bankNiftyOptions = await getAnalyticsOptionsStructureForSymbol(prisma, "BANKNIFTY");
  const fiiFlow = await getAnalyticsFiiFlow(prisma);
  const strategyEvaluation = await getAnalyticsStrategyEvaluation(prisma);
  const quality = await getAnalyticsQuality(prisma);

  return buildAnalyticsBoardBriefPayload({
    overview,
    dashboard,
    marketState,
    leadership,
    dailySetups,
    optionsStructure,
    bankNiftyOptions,
    fiiFlow,
    strategyEvaluation,
    quality,
    stockContext
  });
}

function toPlainTextList(items: unknown, fallback = "NA"): string {
  if (!Array.isArray(items) || items.length === 0) return fallback;
  return items
    .map((item, index) => {
      if (item == null) return `${index + 1}. ${fallback}`;
      if (typeof item === "string") return `${index + 1}. ${item}`;
      return `${index + 1}. ${JSON.stringify(item)}`;
    })
    .join("\n");
}

function toPlainTextValue(value: unknown, fallback = "NA"): string {
  if (value == null) return fallback;
  if (typeof value === "string") return value.trim() || fallback;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function renderPlainTextBoardBrief(payload: Awaited<ReturnType<typeof getAnalyticsBoardBrief>>): string {
  const stockRows = Array.isArray(payload.fullStockSnapshot?.rows) ? payload.fullStockSnapshot.rows : [];
  const stockTable = stockRows.length
    ? [
        "symbol | sector | last | chg_pct | weight_pct | contrib_pct | daily_rsi14 | intraday_rsi14 | vwap_dev_pct | volume_ratio | signal_state | entry_style | risk_flag",
        ...stockRows.map((row) =>
          [
            toPlainTextValue(row?.symbol),
            toPlainTextValue(row?.sector),
            toPlainTextValue(row?.last),
            toPlainTextValue(row?.chg_pct),
            toPlainTextValue(row?.weight_pct),
            toPlainTextValue(row?.contrib_pct),
            toPlainTextValue(row?.daily_rsi14),
            toPlainTextValue(row?.intraday_rsi14),
            toPlainTextValue(row?.vwap_dev_pct),
            toPlainTextValue(row?.volume_ratio),
            toPlainTextValue(row?.signal_state),
            toPlainTextValue(row?.entry_style),
            toPlainTextValue(row?.risk_flag)
          ].join(" | ")
        )
      ].join("\n")
    : "NA";

  const machineFacts = Array.isArray(payload.machineFacts) ? payload.machineFacts.join("\n") : toPlainTextValue(payload.machineFacts);

  return [
    payload.decoratedHeader,
    "",
    "HEADLINE",
    toPlainTextValue(payload.headline),
    "",
    "MARKET BIAS",
    toPlainTextValue(payload.marketBias),
    "",
    "KEY CONCLUSIONS",
    toPlainTextList(payload.keyConclusions),
    "",
    "INDEX SNAPSHOT",
    toPlainTextValue(payload.indexSnapshot),
    "",
    "OPTIONS SNAPSHOT",
    toPlainTextValue(payload.optionsSnapshot),
    "",
    "FII SNAPSHOT",
    toPlainTextValue(payload.fiiSnapshot),
    "",
    "SECTOR SNAPSHOT",
    toPlainTextValue(payload.sectorSnapshot),
    "",
    "FULL STOCK SNAPSHOT",
    stockTable,
    "",
    "BEST ENTRIES",
    toPlainTextValue(payload.bestEntries),
    "",
    "RISK FLAGS",
    toPlainTextList(payload.riskFlags),
    "",
    "NEXT ALERTS",
    toPlainTextList(payload.nextAlerts),
    "",
    "HOW TO READ TODAY",
    toPlainTextValue(payload.howToReadToday),
    "",
    "DATA QUALITY",
    toPlainTextValue(payload.dataQuality),
    "",
    "LLM BRIEF",
    toPlainTextValue(payload.llm_brief),
    "",
    "<MACHINE_FACTS>",
    machineFacts,
    "</MACHINE_FACTS>",
    "",
    toPlainTextValue(payload.rootRouteTakeaway)
  ].join("\n");
}

type SupportingMetricsSnapshot = Awaited<ReturnType<typeof getSupportingMetricsSnapshot>>;

function findSupportingMetric(
  payload: SupportingMetricsSnapshot,
  code: string
) {
  return [...payload.primaryMetrics, ...payload.globalIndices].find((item) => item.code === code) ?? null;
}

function formatMetricLine(
  label: string,
  item: SupportingMetricsSnapshot["primaryMetrics"][number] | null
): string {
  if (!item) {
    return `${label}: NA`;
  }

  const parts = [
    `${label}: ${item.value == null ? "NA" : String(item.value)}`,
    item.changePct == null ? "chg_pct=NA" : `chg_pct=${item.changePct >= 0 ? "+" : ""}${item.changePct.toFixed(2)}%`,
    `currency=${item.currency || "NA"}`,
    `unit=${item.unit || "NA"}`,
    `as_of=${item.asOf ?? "NA"}`,
    `source=${item.source || "NA"}`,
    `quality=${item.quality || "NA"}`
  ];

  return parts.join(" | ");
}

function renderPlainTextMacroBrief(payload: SupportingMetricsSnapshot): string {
  const giftNifty = findSupportingMetric(payload, "gift_nifty");
  const nifty50 = findSupportingMetric(payload, "nifty_50");
  const dowJones = findSupportingMetric(payload, "dow_jones");
  const usdInr = findSupportingMetric(payload, "usd_inr");
  const indiaGold = findSupportingMetric(payload, "india_gold");
  const indiaSilver = findSupportingMetric(payload, "india_silver");
  const brentCrude = findSupportingMetric(payload, "brent_crude");
  const sensex = findSupportingMetric(payload, "sensex");

  const machineFacts = [
    `META|as_of=${payload.asOf}|gateway_generated_at=${payload.gateway.generatedAt}|gateway_ok=${payload.gateway.ok}|error_count=${payload.summary.errorCount}`,
    `METRIC|code=gift_nifty|label=GIFT NIFTY|value=${giftNifty?.value ?? "NA"}|chg_pct=${giftNifty?.changePct ?? "NA"}|currency=${giftNifty?.currency ?? "NA"}|unit=${giftNifty?.unit ?? "NA"}|as_of=${giftNifty?.asOf ?? "NA"}|source=${giftNifty?.source ?? "NA"}|quality=${giftNifty?.quality ?? "NA"}`,
    `METRIC|code=nifty_50|label=NIFTY 50|value=${nifty50?.value ?? "NA"}|chg_pct=${nifty50?.changePct ?? "NA"}|currency=${nifty50?.currency ?? "NA"}|unit=${nifty50?.unit ?? "NA"}|as_of=${nifty50?.asOf ?? "NA"}|source=${nifty50?.source ?? "NA"}|quality=${nifty50?.quality ?? "NA"}`,
    `METRIC|code=sensex|label=SENSEX|value=${sensex?.value ?? "NA"}|chg_pct=${sensex?.changePct ?? "NA"}|currency=${sensex?.currency ?? "NA"}|unit=${sensex?.unit ?? "NA"}|as_of=${sensex?.asOf ?? "NA"}|source=${sensex?.source ?? "NA"}|quality=${sensex?.quality ?? "NA"}`,
    `METRIC|code=dow_jones|label=DOW JONES|value=${dowJones?.value ?? "NA"}|chg_pct=${dowJones?.changePct ?? "NA"}|currency=${dowJones?.currency ?? "NA"}|unit=${dowJones?.unit ?? "NA"}|as_of=${dowJones?.asOf ?? "NA"}|source=${dowJones?.source ?? "NA"}|quality=${dowJones?.quality ?? "NA"}`,
    `METRIC|code=usd_inr|label=USDINR|value=${usdInr?.value ?? "NA"}|chg_pct=${usdInr?.changePct ?? "NA"}|currency=${usdInr?.currency ?? "NA"}|unit=${usdInr?.unit ?? "NA"}|as_of=${usdInr?.asOf ?? "NA"}|source=${usdInr?.source ?? "NA"}|quality=${usdInr?.quality ?? "NA"}`,
    `METRIC|code=india_gold|label=INDIA GOLD|value=${indiaGold?.value ?? "NA"}|chg_pct=${indiaGold?.changePct ?? "NA"}|currency=${indiaGold?.currency ?? "NA"}|unit=${indiaGold?.unit ?? "NA"}|as_of=${indiaGold?.asOf ?? "NA"}|source=${indiaGold?.source ?? "NA"}|quality=${indiaGold?.quality ?? "NA"}`,
    `METRIC|code=india_silver|label=INDIA SILVER|value=${indiaSilver?.value ?? "NA"}|chg_pct=${indiaSilver?.changePct ?? "NA"}|currency=${indiaSilver?.currency ?? "NA"}|unit=${indiaSilver?.unit ?? "NA"}|as_of=${indiaSilver?.asOf ?? "NA"}|source=${indiaSilver?.source ?? "NA"}|quality=${indiaSilver?.quality ?? "NA"}`,
    `METRIC|code=brent_crude|label=BRENT CRUDE|value=${brentCrude?.value ?? "NA"}|chg_pct=${brentCrude?.changePct ?? "NA"}|currency=${brentCrude?.currency ?? "NA"}|unit=${brentCrude?.unit ?? "NA"}|as_of=${brentCrude?.asOf ?? "NA"}|source=${brentCrude?.source ?? "NA"}|quality=${brentCrude?.quality ?? "NA"}`
  ];

  return [
    "MARKET SUPPORTING METRICS",
    `As Of: ${payload.asOf}`,
    `Gateway Generated At: ${payload.gateway.generatedAt}`,
    `Freshness: ${payload.gateway.ok ? "fresh" : "degraded"} | primary_count=${payload.summary.primaryCount} | global_index_count=${payload.summary.globalIndexCount} | error_count=${payload.summary.errorCount}`,
    "",
    formatMetricLine("GIFT NIFTY", giftNifty),
    formatMetricLine("NIFTY 50", nifty50),
    formatMetricLine("SENSEX", sensex),
    formatMetricLine("DOW JONES", dowJones),
    formatMetricLine("USDINR", usdInr),
    formatMetricLine("INDIA GOLD", indiaGold),
    formatMetricLine("INDIA SILVER", indiaSilver),
    formatMetricLine("BRENT CRUDE", brentCrude),
    "",
    payload.errors.length > 0 ? `Errors: ${payload.errors.map((item) => `${item.scope}:${item.message}`).join(" ; ")}` : "Errors: none",
    "",
    "<MACHINE_FACTS>",
    ...machineFacts,
    "</MACHINE_FACTS>"
  ].join("\n");
}

export function registerAnalytics(app: Express, prisma: PrismaClient) {
  if (!simulatorWarmStarted) {
    simulatorWarmStarted = true;
    scheduleSimulatorPrewarm(1);
  }

  app.get("/v1/analytics/dashboard", async (req, res) =>
    serveSnapshotRoute(req, res, prisma, {
      key: "analytics-dashboard",
      cacheControl: "private, max-age=300, stale-while-revalidate=300",
      freshnessMs: 5 * 60_000,
      build: getAnalyticsDashboard
    })
  );

  app.get("/v1/analytics/flows", async (req, res) =>
    serveSnapshotRoute(req, res, prisma, {
      key: "analytics-flows",
      cacheControl: "private, max-age=300, stale-while-revalidate=300",
      freshnessMs: 5 * 60_000,
      build: getAnalyticsFlows
    })
  );

  app.get("/v1/analytics/quality", async (req, res) =>
    serveSnapshotRoute(req, res, prisma, {
      key: "analytics-quality",
      cacheControl: "private, max-age=300, stale-while-revalidate=300",
      freshnessMs: 5 * 60_000,
      build: getAnalyticsQuality
    })
  );

  app.get("/v1/analytics/board-brief", async (req, res) =>
    serveSnapshotRoute(req, res, prisma, {
      key: "analytics-board-brief",
      cacheControl: "private, max-age=300, stale-while-revalidate=300",
      freshnessMs: 5 * 60_000,
      build: getAnalyticsBoardBrief
    })
  );

  app.get("/paragmore/:slug", async (req, res) => {
    const expectedSlug = getPublicBoardBriefSlug();
    if (!expectedSlug || req.params.slug !== expectedSlug) {
      return res.status(404).type("text/plain; charset=utf-8").send("Not found");
    }

    try {
      const snapshotDate = marketDayIso();
      const { record: currentSnapshot } = await getStoredSnapshot<Awaited<ReturnType<typeof getAnalyticsBoardBrief>>>(
        prisma,
        "analytics-board-brief",
        snapshotDate,
        300
      );
      const { record } = currentSnapshot
        ? { record: currentSnapshot }
        : await getLatestStoredSnapshot<Awaited<ReturnType<typeof getAnalyticsBoardBrief>>>(prisma, "analytics-board-brief", 300);

      if (!record) {
        return res
          .status(503)
          .type("text/plain; charset=utf-8")
          .send("Board brief snapshot unavailable");
      }

      return res
        .status(200)
        .type("text/plain; charset=utf-8")
        .setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300")
        .setHeader("X-Snapshot-Key", record.snapshotKey)
        .setHeader("X-Snapshot-Generated-At", record.generatedAt)
        .setHeader("X-Snapshot-Date", record.snapshotDate)
        .send(renderPlainTextBoardBrief(record.payload));
    } catch (error) {
      console.error(
        JSON.stringify({
          ts: new Date().toISOString(),
          level: "error",
          event: "analytics_public_board_brief_failed",
          message: error instanceof Error ? error.message : "Unknown error"
        })
      );
      return res.status(500).type("text/plain; charset=utf-8").send("Board brief unavailable");
    }
  });

  app.get("/paragmore-market/:slug", async (req, res) => {
    const expectedSlug = getPublicMacroBriefSlug();
    if (!expectedSlug || req.params.slug !== expectedSlug) {
      return res.status(404).type("text/plain; charset=utf-8").send("Not found");
    }

    try {
      const snapshotDate = marketDayIso();
      const { record: currentSnapshot } = await getStoredSnapshot<SupportingMetricsSnapshot>(
        prisma,
        "analytics-supporting-metrics",
        snapshotDate,
        90
      );
      const { record } = currentSnapshot
        ? { record: currentSnapshot }
        : await getLatestStoredSnapshot<SupportingMetricsSnapshot>(prisma, "analytics-supporting-metrics", 90);

      const payload = record?.payload ?? (await getSupportingMetricsSnapshot());
      const rendered = renderPlainTextMacroBrief(payload);

      return res
        .status(200)
        .type("text/plain; charset=utf-8")
        .setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=180")
        .setHeader("X-Snapshot-Key", record?.snapshotKey ?? "analytics-supporting-metrics")
        .setHeader("X-Snapshot-Generated-At", record?.generatedAt ?? payload.asOf)
        .setHeader("X-Snapshot-Date", record?.snapshotDate ?? snapshotDate)
        .send(rendered);
    } catch (error) {
      console.error(
        JSON.stringify({
          ts: new Date().toISOString(),
          level: "error",
          event: "analytics_public_macro_brief_failed",
          message: error instanceof Error ? error.message : "Unknown error"
        })
      );
      return res.status(500).type("text/plain; charset=utf-8").send("Supporting metrics brief unavailable");
    }
  });

  app.get("/v1/analytics/simulator/universe", async (req, res) =>
    serveSnapshotRoute(req, res, prisma, {
      key: "analytics-simulator-universe",
      cacheControl: "private, max-age=300, stale-while-revalidate=300",
      freshnessMs: 5 * 60_000,
      build: getAnalyticsSimulatorUniverseSnapshot
    })
  );

  app.get("/v1/analytics/simulator", async (req, res) => {
    const startedAt = Date.now();
    const params = buildSimulatorRequestParams(req.query as Record<string, unknown>);
    const symbol = params.symbol;
    if (isDefaultSimulatorRequest(params)) {
      return serveSnapshotRoute(req, res, prisma, {
        key: "analytics-simulator-default",
        cacheControl: "private, max-age=300, stale-while-revalidate=300",
        freshnessMs: 5 * 60_000,
        build: getAnalyticsSimulatorDefaultSnapshot
      });
    }
    try {
      const payload = await fetchCachedRecoJson("/api/v1/reco/simulator", params, SIMULATOR_RESPONSE_TTL_MS);
      res.setHeader("Cache-Control", "private, max-age=120, stale-while-revalidate=60");
      logAnalyticsEvent("info", "analytics_simulator_ok", {
        symbol: symbol ?? null,
        elapsedMs: Date.now() - startedAt
      });
      return res.json(payload);
    } catch (err) {
      const failure = toPublicRecoError(err, "ANALYTICS_SIMULATOR_FAILED", "Unable to build simulator response.");
      logAnalyticsEvent(failure.status >= 500 ? "error" : "warn", "analytics_simulator_failed", {
        symbol: symbol ?? null,
        elapsedMs: Date.now() - startedAt,
        status: failure.status,
        error: err instanceof Error ? err.message : String(err)
      });
      return res.status(failure.status).json(failure.body);
    }
  });
}
