import type { Express, RequestHandler, Response } from "express";
import type { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { RequestAuthenticator } from "../auth/guard";
import { loadSmartApiNifty } from "../services/tradingAnalyticsSmartApi";
import { periodCandles } from "../services/tradingAnalyticsPeriods";
import { resistanceViews } from "../services/tradingAnalyticsResistance";
import { analyticsUnderlying, analyticsUniverse, selectUnderlying } from '../services/tradingAnalyticsUniverse';
import {
  activity,
  participant,
  matrix,
  reconcile,
  nearestPairs,
  chainMetrics,
  numeric,
  ema9,
  fractions,
  sessionBars,
  sessionCoverage,
  VERSION,
  type Facts,
} from "../services/tradingAnalytics";
import { oiLayers, participantComparison, sessionAlignedOi } from "../services/tradingAnalyticsOi";
import { underlyingReferenceLevels } from "../services/tradingAnalyticsReferenceLevels";

const querySchema = z.object({
  symbol: z.string().regex(/^[A-Z0-9&_.-]{1,40}$/).default('NIFTY'),
  dailyLookback: z.coerce.number().int().min(1).max(400).optional(),
  weeklyLookback: z.coerce.number().int().min(1).max(100).optional(),
  asOf: z.string().datetime({ offset: true }).optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  expiry: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

type LiveJsonResult = { statusCode: number; body: unknown };
const liveJsonResults = new Map<string, { expiresAt: number; result: LiveJsonResult }>();
const liveJsonInflight = new Map<string, Promise<LiveJsonResult>>();

/**
 * Live workstations often poll the same expensive read from more than one open
 * tab. Coalesce those reads and briefly reuse only successful live responses.
 * Historical as-of requests remain exact and bypass this cache entirely.
 */
export function liveJsonSingleflight(ttlMs: number): RequestHandler {
  return async (req, res, next) => {
    if (typeof req.query.asOf === "string" && req.query.asOf.length > 0) return next();
    const key = req.originalUrl;
    const now = Date.now();
    for (const [cachedKey, entry] of liveJsonResults) {
      if (entry.expiresAt <= now) liveJsonResults.delete(cachedKey);
    }
    const cached = liveJsonResults.get(key);
    if (cached && cached.expiresAt > now) {
      res.setHeader("X-Live-Read-Cache", "hit");
      return res.status(cached.result.statusCode).json(cached.result.body);
    }
    if (cached) liveJsonResults.delete(key);

    const pending = liveJsonInflight.get(key);
    if (pending) {
      try {
        const result = await pending;
        res.setHeader("X-Live-Read-Cache", "coalesced");
        return res.status(result.statusCode).json(result.body);
      } catch {
        return next();
      }
    }

    let resolveResult!: (value: LiveJsonResult) => void;
    let rejectResult!: (reason?: unknown) => void;
    const promise = new Promise<LiveJsonResult>((resolve, reject) => {
      resolveResult = resolve;
      rejectResult = reject;
    });
    liveJsonInflight.set(key, promise);
    let settled = false;
    const originalJson = res.json.bind(res);
    res.json = ((body: unknown) => {
      const result = { statusCode: res.statusCode, body };
      settled = true;
      liveJsonInflight.delete(key);
      if (res.statusCode < 400) liveJsonResults.set(key, { expiresAt: Date.now() + ttlMs, result });
      resolveResult(result);
      res.setHeader("X-Live-Read-Cache", "miss");
      return originalJson(body);
    }) as Response["json"];
    res.once("close", () => {
      if (settled) return;
      liveJsonInflight.delete(key);
      rejectResult(new Error("response closed before JSON completion"));
    });
    return next();
  };
}
export function resolveChartStrikeSelection(input: { strike?: number; ceStrike?: number; peStrike?: number }) {
  return {
    ceStrike: input.ceStrike ?? input.strike,
    peStrike: input.peStrike ?? input.strike,
  };
}

export function buildCumulativeOiHistory(rows: Facts[]) {
  return rows.map((row) => {
    const ceOi = numeric(row.ce_oi), peOi = numeric(row.pe_oi);
    const ceChangeOi = numeric(row.ce_change_oi), peChangeOi = numeric(row.pe_change_oi);
    const oiComplete = ceOi != null && peOi != null;
    const changeComplete = ceChangeOi != null && peChangeOi != null;
    return {
      snapshotId: String(row.snapshot_id),
      capturedAt: new Date(String(row.captured_at)).toISOString(),
      source: row.source,
      strikesAround: numeric(row.strikes_around),
      strikeCount: numeric(row.strike_count),
      ceContractCount: numeric(row.ce_contract_count),
      ceObservedCount: numeric(row.ce_observed_count),
      ceOi,
      peContractCount: numeric(row.pe_contract_count),
      peObservedCount: numeric(row.pe_observed_count),
      peOi,
      ceChangeObservedCount: numeric(row.ce_change_observed_count),
      ceChangeOi,
      peChangeObservedCount: numeric(row.pe_change_observed_count),
      peChangeOi,
      baselineKind: row.baseline_kind == null ? null : String(row.baseline_kind),
      oiDifference: oiComplete ? peOi - ceOi : null,
      changeOiDifference: changeComplete ? peChangeOi - ceChangeOi : null,
      pcr: oiComplete && ceOi > 0 ? peOi / ceOi : null,
      state: oiComplete ? "COMPLETE" : "PARTIAL",
      changeState: changeComplete ? "COMPLETE" : "PARTIAL",
    };
  });
}
const istSessionDate = (value: unknown) => value == null ? null : new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date(String(value)));
export function buildComparableChainLegs(currentLegs: Facts[], priorLegs: Facts[], currentAt: unknown, priorAt: unknown) {
  return currentLegs.map((leg) => {
    const prior = priorLegs.find((candidate) => candidate.strike === leg.strike && candidate.option_type === leg.option_type);
    const sameSession = prior != null && istSessionDate(priorAt) === istSessionDate(currentAt);
    const currentVolume = numeric(leg.total_traded_volume), baselineVolume = numeric(prior?.total_traded_volume);
    const intervalVolume = !sameSession || currentVolume == null || baselineVolume == null || currentVolume < baselineVolume
      ? null : currentVolume - baselineVolume;
    return {
      ...leg,
      collected_at: currentAt ?? null,
      baseline_last_price: prior?.last_price ?? null,
      previous_implied_volatility: prior?.implied_volatility ?? null,
      change_in_iv: prior && numeric(prior.implied_volatility) != null && numeric(leg.implied_volatility) != null
        ? numeric(leg.implied_volatility)! - numeric(prior.implied_volatility)!
        : null,
      baseline_open_interest: prior?.open_interest ?? null,
      baseline_total_traded_volume: prior?.total_traded_volume ?? null,
      baseline_kind: prior ? "PREVIOUS_ARCHIVED_SNAPSHOT" : "BASELINE_UNAVAILABLE",
      baseline_collected_at: priorAt ?? null,
      comparison_window_state: prior ? "COMMON_SNAPSHOT_BASELINE" : "BASELINE_UNAVAILABLE",
      interval_volume: intervalVolume,
      volume_counter_state: !prior ? "BASELINE_UNAVAILABLE" : !sameSession ? "CROSS_SESSION_NOT_COMPARABLE" : currentVolume == null || baselineVolume == null ? "ENDPOINT_MISSING" : currentVolume < baselineVolume ? "RESET_OR_CORRECTION" : "COMPARABLE",
      oi_unit: "UNKNOWN_SOURCE_UNIT",
      volume_unit: "UNKNOWN_SOURCE_UNIT",
      oi_layers: oiLayers(prior?.open_interest, leg.open_interest),
      previous_snapshot_delta: prior && numeric(prior.open_interest) != null && numeric(leg.open_interest) != null
        ? numeric(leg.open_interest)! - numeric(prior.open_interest)!
        : null,
    };
  });
}

export async function loadMorningSummary(prisma: PrismaClient, asOf: string) {
  const dates = await prisma.$queryRawUnsafe<Facts[]>(
    `SELECT
       (SELECT max(trade_date)::text
        FROM market_data.nse_fii_derivatives_stats
        WHERE loaded_at<=$1::timestamptz
          AND trade_date<=($1::timestamptz AT TIME ZONE 'Asia/Kolkata')::date) derivatives_date,
       (SELECT max(market_date)::text
        FROM institutional_flow.normalized_nse_fii_dii
        WHERE source_dataset='nse_fii_dii_nse_only'
          AND market_date<=($1::timestamptz AT TIME ZONE 'Asia/Kolkata')::date) cash_date`,
    asOf,
  );
  const derivativesReportDate = dates[0]?.derivatives_date == null ? null : String(dates[0].derivatives_date);
  const cashReportDate = dates[0]?.cash_date == null ? null : String(dates[0].cash_date);
  const [rawStats, cash] = await Promise.all([
    prisma.$queryRawUnsafe<Facts[]>(
      `SELECT fii_derivatives,buy_contracts::text,buy_value_in_cr::text,
              sell_contracts::text,sell_value_in_cr::text
       FROM market_data.nse_fii_derivatives_stats
       WHERE trade_date=$2::date
         AND fii_derivatives IN ('INDEX FUTURES','INDEX OPTIONS')
         AND run_id=(SELECT run_id FROM market_data.nse_fii_derivatives_stats
                     WHERE trade_date=$2::date AND loaded_at<=$1::timestamptz
                     ORDER BY loaded_at DESC,run_id DESC LIMIT 1)`,
      asOf,
      derivativesReportDate,
    ),
    prisma.$queryRawUnsafe<Facts[]>(
      `SELECT participant_type,net_value
       FROM institutional_flow.normalized_nse_fii_dii
       WHERE market_date=$1::date AND source_dataset='nse_fii_dii_nse_only'
         AND (participant_type ILIKE '%FII%' OR participant_type ILIKE '%FPI%')`,
      cashReportDate,
    ),
  ]);
  const stats = rawStats.map(activity);
  const cashNet = cash.length === 1 ? numeric(cash[0]?.net_value) : null;
  const equity = cashNet == null ? null : cashNet === 0 ? "Neutral" : cashNet < 0 ? "Sell" : "Buy";
  const product = (name: string) => stats.find((row) => row.fii_derivatives === name);
  const productSign = (name: string) => product(name)?.canonical_sign ?? null;
  const futures = productSign("INDEX FUTURES"), options = productSign("INDEX OPTIONS");
  return {
    asOf, reportDate: derivativesReportDate, derivativesReportDate, cashReportDate, equity, futures, options,
    equityNet: cashNet,
    futuresNet: product("INDEX FUTURES")?.net_crore ?? null,
    optionsNet: product("INDEX OPTIONS")?.net_crore ?? null,
    matrix: matrix(equity, futures, options),
    knowledgeState: "CASH_PUBLICATION_TIME_UNVERIFIED",
  };
}

export async function loadTradingAnalytics(
  prisma: PrismaClient,
  asOf: string,
  date?: string,
  expiry?: string,
  dailyLookback?: number,
  weeklyLookback?: number,
  symbol='NIFTY',
) {
  const errors: { source: string; state: string }[] = [];
  const read = async (source: string, sql: string, ...args: unknown[]) => {
    try {
      return await prisma.$queryRawUnsafe<Facts[]>(sql, ...args);
    } catch {
      errors.push({ source, state: "SOURCE_QUERY_FAILED" });
      return [];
    }
  };
  const universe=await analyticsUniverse(read,asOf);
  const underlying=selectUnderlying(universe,symbol);
  const dates = await read(
    "report_dates",
    `SELECT DISTINCT trade_date::text date FROM market_data.nse_fii_derivatives_stats WHERE loaded_at<=$1::timestamptz AND trade_date<=($1::timestamptz AT TIME ZONE 'Asia/Kolkata')::date ORDER BY date DESC LIMIT 370`,
    asOf,
  );
  const selected = date ?? String(dates[0]?.date ?? asOf.slice(0, 10));
  if (
    selected >
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(asOf))
  )
    throw new Error("Future report date");
  // Select one complete load revision, never stitch rows from different ingests.
  const [rawStats, rawPeople, rawParticipantVolumes, cash, expiries, dayBars, smartapi, cashHistory, rawParticipantHistory, positioningCoverageRows] =
    await Promise.all([
      read(
        "derivatives",
        `SELECT fii_derivatives,buy_contracts::text,buy_value_in_cr::text,sell_contracts::text,sell_value_in_cr::text,open_contracts::text,open_contracts_value_in_cr::text,trade_date::text,loaded_at,run_id,source_file FROM market_data.nse_fii_derivatives_stats WHERE trade_date=$2::date AND run_id=(SELECT run_id FROM market_data.nse_fii_derivatives_stats WHERE trade_date=$2::date AND loaded_at<=$1::timestamptz ORDER BY loaded_at DESC,run_id DESC LIMIT 1) ORDER BY fii_derivatives`,
        asOf,
        selected,
      ),
      read(
        "participant_oi",
        `SELECT to_jsonb(p) payload FROM market_data.nse_fii_participant_open_interest p WHERE trade_date=$2::date AND run_id=(SELECT run_id FROM market_data.nse_fii_participant_open_interest WHERE trade_date=$2::date AND loaded_at<=$1::timestamptz ORDER BY loaded_at DESC,run_id DESC LIMIT 1) ORDER BY client_type`,
        asOf,
        selected,
      ),
      read(
        "participant_volume",
        `SELECT to_jsonb(p) payload FROM market_data.nse_fii_participant_volume p WHERE trade_date=$2::date AND run_id=(SELECT run_id FROM market_data.nse_fii_participant_volume WHERE trade_date=$2::date AND loaded_at<=$1::timestamptz ORDER BY loaded_at DESC,run_id DESC LIMIT 1) ORDER BY client_type`,
        asOf,
        selected,
      ),
      // Legacy cash has no observation timestamp. It is descriptive only, never PIT-qualified.
      read(
        "cash",
        `SELECT participant_type,buy_value,sell_value,net_value,market_date::text,exchange_scope,source_dataset
         FROM institutional_flow.normalized_nse_fii_dii
         WHERE market_date=(SELECT max(market_date) FROM institutional_flow.normalized_nse_fii_dii
                            WHERE market_date<=$1::date AND source_dataset='nse_fii_dii_nse_only')
           AND source_dataset='nse_fii_dii_nse_only'`,
        selected,
      ),
      read(
        "chain_expiries",
        `SELECT DISTINCT expiry_date::text FROM public.option_chain_snapshots WHERE symbol=$2 AND captured_at<=$1::timestamptz AND expiry_date>=($1::timestamptz AT TIME ZONE 'Asia/Kolkata')::date ORDER BY expiry_date`,
        asOf,
        underlying.symbol,
      ),
      read(
        "nifty_daily",
        `SELECT b.trade_date::text date,open::float8,high::float8,low::float8,close::float8,volume::text,source,created_at FROM public.bars_1d b WHERE exchange='NSE' AND symbol_token=$2 AND (b.trade_date<($1::timestamptz AT TIME ZONE 'Asia/Kolkata')::date OR EXISTS (SELECT 1 FROM public.trading_calendar c WHERE c.trade_date=b.trade_date AND c.is_trading_day AND c.market_close_ts<=$1::timestamptz)) AND b.trade_date<=($1::timestamptz AT TIME ZONE 'Asia/Kolkata')::date AND created_at<=$1::timestamptz ORDER BY b.trade_date DESC LIMIT 400`,
        asOf,
        underlying.token,
      ),
      loadSmartApiNifty(read, asOf, expiry, underlying),
      read(
        "cash_history",
        `SELECT participant_type,buy_value,sell_value,net_value,market_date::text,exchange_scope,source_dataset FROM institutional_flow.normalized_nse_fii_dii WHERE market_date<=$1::date AND source_dataset='nse_fii_dii_nse_only' ORDER BY market_date DESC,participant_type LIMIT 740`,
        selected,
      ),
      read(
        "participant_oi_history",
        `WITH latest_runs AS (
           SELECT DISTINCT ON (trade_date) trade_date,run_id
           FROM (
             SELECT trade_date,run_id,max(loaded_at) loaded_at
             FROM market_data.nse_fii_participant_open_interest
             WHERE trade_date<=$2::date AND loaded_at<=$1::timestamptz
             GROUP BY trade_date,run_id
           ) revisions
           ORDER BY trade_date,loaded_at DESC,run_id DESC
         ), selected_runs AS (
           SELECT trade_date,run_id FROM latest_runs ORDER BY trade_date DESC LIMIT 120
         )
         SELECT to_jsonb(p) payload
         FROM selected_runs r
         JOIN market_data.nse_fii_participant_open_interest p
           ON p.trade_date=r.trade_date AND p.run_id=r.run_id
         WHERE p.loaded_at<=$1::timestamptz
         ORDER BY p.trade_date,p.client_type`,
        asOf,
        selected,
      ),
      read(
        "positioning_coverage",
        `SELECT 'participant_oi'::text family,count(*)::int rows,count(DISTINCT trade_date)::int dates,min(trade_date)::text first_date,max(trade_date)::text last_date FROM market_data.nse_fii_participant_open_interest WHERE loaded_at<=$1::timestamptz
         UNION ALL SELECT 'participant_volume',count(*)::int,count(DISTINCT trade_date)::int,min(trade_date)::text,max(trade_date)::text FROM market_data.nse_fii_participant_volume WHERE loaded_at<=$1::timestamptz
         UNION ALL SELECT 'fii_stats',count(*)::int,count(DISTINCT trade_date)::int,min(trade_date)::text,max(trade_date)::text FROM market_data.nse_fii_derivatives_stats WHERE loaded_at<=$1::timestamptz
         UNION ALL SELECT 'nifty_chain_snapshots',count(*)::int,count(DISTINCT (captured_at AT TIME ZONE 'Asia/Kolkata')::date)::int,min((captured_at AT TIME ZONE 'Asia/Kolkata')::date)::text,max((captured_at AT TIME ZONE 'Asia/Kolkata')::date)::text FROM public.option_chain_snapshots WHERE symbol=$2 AND captured_at<=$1::timestamptz`,
        asOf,
        underlying.symbol,
      ),
    ]);
  const [priorPeopleRows, priorParticipantVolumeRows, dailyCalendar] = await Promise.all([
    read(
      "participant_oi_previous",
      `SELECT to_jsonb(p) payload FROM market_data.nse_fii_participant_open_interest p
       WHERE trade_date=(SELECT max(trade_date) FROM market_data.nse_fii_participant_open_interest WHERE trade_date<$2::date AND loaded_at<=$1::timestamptz)
       AND run_id=(SELECT run_id FROM market_data.nse_fii_participant_open_interest WHERE trade_date=(SELECT max(trade_date) FROM market_data.nse_fii_participant_open_interest WHERE trade_date<$2::date AND loaded_at<=$1::timestamptz) AND loaded_at<=$1::timestamptz ORDER BY loaded_at DESC,run_id DESC LIMIT 1)
       ORDER BY client_type`,
      asOf,
      selected,
    ),
    read(
      "participant_volume_previous",
      `SELECT to_jsonb(p) payload FROM market_data.nse_fii_participant_volume p
       WHERE trade_date=(SELECT max(trade_date) FROM market_data.nse_fii_participant_volume WHERE trade_date<$2::date AND loaded_at<=$1::timestamptz)
       AND run_id=(SELECT run_id FROM market_data.nse_fii_participant_volume WHERE trade_date=(SELECT max(trade_date) FROM market_data.nse_fii_participant_volume WHERE trade_date<$2::date AND loaded_at<=$1::timestamptz) AND loaded_at<=$1::timestamptz ORDER BY loaded_at DESC,run_id DESC LIMIT 1)
       ORDER BY client_type`,
      asOf,
      selected,
    ),
    read(
      "daily_calendar",
      `SELECT trade_date::text,market_open_ts,market_close_ts,'REGULAR'::text phase_id,updated_at
       FROM public.trading_calendar WHERE is_trading_day AND trade_date<=($1::timestamptz AT TIME ZONE 'Asia/Kolkata')::date
       ORDER BY trade_date DESC LIMIT 450`,
      asOf,
    ),
  ]);
  const stats = rawStats.map(activity);
  const currentPeople = rawPeople.map((r) => participant(r.payload as Facts));
  const priorPeople = priorPeopleRows.map((r) => participant(r.payload as Facts));
  const people = participantComparison(currentPeople, priorPeople);
  const participantVolumes = participantComparison(
    rawParticipantVolumes.map((r) => participant(r.payload as Facts)),
    priorParticipantVolumeRows.map((r) => participant(r.payload as Facts)),
  );
  const participantHistoryCurrent: Facts[] = rawParticipantHistory.map((r) => participant(r.payload as Facts));
  const participantHistoryDates = [
    ...new Set(participantHistoryCurrent
      .map((row) => row.trade_date == null ? "" : String(row.trade_date).slice(0, 10))
      .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value))),
  ].sort((left, right) => left.localeCompare(right));
  const participantHistoryRows: Facts[] = participantHistoryDates.flatMap((historyDate, index) => participantComparison(
    participantHistoryCurrent.filter((row) => String(row.trade_date).slice(0, 10) === historyDate),
    index === 0 ? [] : participantHistoryCurrent.filter((row) => String(row.trade_date).slice(0, 10) === participantHistoryDates[index - 1]),
  ));
  const selectedExpiry =
    expiry ?? (expiries[0]?.expiry_date as string | undefined);
  const snapshots = selectedExpiry
    ? await read(
        "chain",
        `SELECT id::text,captured_at,expiry_date::text,underlying_value::float8,source,strikes_around FROM public.option_chain_snapshots WHERE symbol=$3 AND expiry_date=$2::date AND captured_at<=$1::timestamptz ORDER BY captured_at DESC LIMIT 2`,
        asOf,
        selectedExpiry,
        underlying.symbol,
      )
    : [];
  const snapshot = snapshots[0] ?? null,
    previous = snapshots[1]?.source === snapshot?.source ? snapshots[1] : null;
  const [legs, previousLegs] = await Promise.all([
    snapshot
      ? read(
          "chain_legs",
          `SELECT to_jsonb(l) payload FROM public.option_chain_legs l WHERE snapshot_id=$1::bigint ORDER BY strike,option_type`,
          snapshot.id,
        )
      : [],
    previous
      ? read(
          "previous_chain_legs",
          `SELECT to_jsonb(l) payload FROM public.option_chain_legs l WHERE snapshot_id=$1::bigint ORDER BY strike,option_type`,
          previous.id,
        )
      : [],
  ]);
  const rawLegs = legs.map((r) => r.payload as Facts),
    priorLegs = previousLegs.map((r) => r.payload as Facts);
  const window =
    snapshot && numeric(snapshot.underlying_value) != null
      ? nearestPairs(rawLegs, numeric(snapshot.underlying_value)!)
      : { strikes: [], legs: [], shortfall: 10 };
  const chainLegs = buildComparableChainLegs(window.legs, priorLegs, snapshot?.captured_at, previous?.captured_at);
  const daily = dayBars.reverse();
  const emas = ema9(daily.map((b) => numeric(b.close)!));
  const candles = daily.map((b, i) => ({
    ...b,
    ema9: emas[i],
    fraction: fractions(
      {
        open: numeric(b.open)!,
        close: numeric(b.close)!,
        high: numeric(b.high)!,
        low: numeric(b.low)!,
      },
      emas[i],
    ),
  }));
  const issues = reconcile(
    rawStats,
    rawPeople.map((r) => r.payload as Facts),
  );
  const fiiCash = cash.filter(
    (r) =>
      String(r.participant_type).includes("FII") ||
      String(r.participant_type).includes("FPI"),
  );
  const cashNet = fiiCash.length === 1 ? numeric(fiiCash[0].net_value) : null;
  const sign =
    cashNet == null
      ? null
      : cashNet === 0
        ? "Neutral"
        : cashNet < 0
          ? "Sell"
          : "Buy";
  const at = (product: string) =>
    stats.find((r) => r.fii_derivatives === product)?.canonical_sign ?? null;
  const age = snapshot
    ? (Date.parse(asOf) - new Date(String(snapshot.captured_at)).getTime()) /
      1000
    : null;
  const result = {
    underlying,universe,
    version: VERSION,
    asOf,
    reportDate: selected,
    availableDates: dates.map((d) => d.date),
    state: "POLICY_INCOMPLETE",
    liveOrdersEnabled: false,
    paperOrdersEnabled: false,
    morning: {
      matrix: matrix(sign, at("INDEX FUTURES"), at("INDEX OPTIONS")),
      cash,
      cashNet,
      cashSign: sign,
      derivativesReportDate: selected,
      cashReportDate: cash[0]?.market_date ?? null,
      knowledgeState: "CASH_PUBLICATION_TIME_UNVERIFIED",
      reportLagDays: Math.floor(
        (Date.parse(asOf) - Date.parse(selected)) / 86400000,
      ),
    },
    cashHistory: {
      rows: cashHistory,
      latestDate: cashHistory[0]?.market_date ?? null,
      requestedDate: selected,
      source: "NSE · capital market · NSE only",
      unit: "INR_CRORE",
      state: cashHistory.length === 0 ? "DATA_INSUFFICIENT" : cashHistory[0]?.market_date === selected ? "OBSERVED_REPORT" : "OLDER_REPORT",
      knowledgeState: "CASH_PUBLICATION_TIME_UNVERIFIED",
      note: "Descriptive retained reports, not point-in-time qualified. The market matrix uses the latest retained NSE-only cash report on or before the selected derivatives date and discloses both source dates. NSE-only and combined-exchange totals are not mixed.",
    },
    activity: stats,
    participants: people,
    participantVolumes,
    positioningCoverage: {
      generatedAt: asOf,
      scope: "RETAINED_DATABASE_ROWS_AT_OR_BEFORE_ASOF",
      requestedPilotSessions: 60,
      families: positioningCoverageRows.map((row) => ({ ...row, downloaded: null, parsed: null, loaded: row.rows, validated: null })),
      limitations: [
        "Downloaded, parsed and validated artifact counts are not stored in this API response and remain unavailable.",
        "EOD reports cannot reconstruct historical intraday OI, volume or price observations.",
      ],
    },
    participantHistory: {
      rows: participantHistoryRows,
      reportCount: participantHistoryDates.length,
      oldestDate: participantHistoryDates[0] ?? null,
      latestDate: participantHistoryDates.at(-1) ?? null,
      state: participantHistoryRows.length ? "OBSERVED_REPORT_HISTORY" : "DATA_INSUFFICIENT",
      scope: "LATEST_RETAINED_REVISION_PER_REPORT_DATE",
      unit: "contracts",
      limit: 120,
    },
    issues,
    errors,
    candles,
    resistance: resistanceViews(
      daily,
      asOf,
      numeric(smartapi.spot?.ltp),
      dailyLookback ?? Number(process.env.TRADING_ANALYTICS_DAILY_LEVEL_LOOKBACK ?? 20),
      weeklyLookback ?? Number(process.env.TRADING_ANALYTICS_WEEKLY_LEVEL_LOOKBACK ?? 12),
      dailyCalendar,
    ),
    periods: {
      weekly: periodCandles(daily, "week", asOf, dailyCalendar),
      monthly: periodCandles(daily, "month", asOf, dailyCalendar),
    },
    smartapi,
    chain: {
      snapshot,
      previousSnapshot: previous,
      expiries: expiries.map((e) => e.expiry_date),
      legs: chainLegs,
      strikes: window.strikes,
      shortfall: window.shortfall,
      metrics: chainMetrics(window.legs),
      ageSeconds: age,
      state: age == null ? "MISSING" : age > 60 ? "STALE" : "OBSERVED",
      scope: "NEAREST_TEN_PAIRED_STRIKES_FROM_ARCHIVED_WINDOW",
      archivedLegCount: rawLegs.length,
    },
    policies: [
      {
        id: "execution",
        state: "DISABLED",
        reason:
          "No approved fill, exit, sizing or portfolio policy; no order path.",
      },
      {
        id: "levels",
        state: "PREVIEW_UNAPPROVED",
        reason:
          "Monthly 12 bars; weekly/daily lookbacks and ranking require approval.",
      },
      {
        id: "ema",
        state: "PREVIEW_UNAPPROVED",
        reason:
          "SMA9 seed; 70% range; exact option own EMA; long-put direction needs approval.",
      },
      {
        id: "cutoff",
        state: "PREVIEW_UNAPPROVED",
        reason: "14:00 IST blocks new eligibility, never monitoring.",
      },
      {
        id: "replay",
        state: "PARTIAL",
        reason:
          "known-at filters applied to retained sources; legacy mutable bars/cash lack immutable publication revisions.",
      },
      {
        id: "turnover",
        state: "DATA_INSUFFICIENT",
        reason:
          "NIFTY spot volume/delivery is not applicable. Stock comparable 30-session phase provider pending.",
      },
      {
        id: "morning-job",
        state:
          process.env.TRADING_ANALYTICS_MORNING_JOB_ENABLED === "false"
            ? "NOT_ENABLED"
            : "ENABLED",
        reason:
          process.env.TRADING_ANALYTICS_MORNING_JOB_ENABLED === "false"
            ? "06:00 Asia/Kolkata NSE FII report pull/load is disabled by configuration."
            : "06:00 Asia/Kolkata official NSE FII report pull/load; advisory-locked, exchange-calendar checked, idempotent and retryable.",
      },
    ],
    limitations: [
      "Source reports are lagged institutional context, not intraday flows.",
      "Options report amounts are strike-notional, not premium cash flows.",
      "Totals and component rows must not be added together.",
      "OI unit normalization is not independently verified: max pain withheld.",
      "Old report imports cannot be used before their actual import known-at.",
      "Exact-contract intraday coverage is independently reported in the Scalper lens; missing minutes cannot confirm a signal.",
    ],
  };
  return {
    ...result,
    evidenceId: createHash("sha256")
      .update(
        JSON.stringify(result, (_, v) =>
          typeof v === "bigint" ? v.toString() : v,
        ),
      )
      .digest("hex"),
  };
}
const tentativeAlertLegSchema = z.object({
  instrument: z.enum(["UNDERLYING", "CE", "PE"]),
  symbol: z.string().regex(/^[A-Z0-9&_.-]{1,40}$/),
  targetSide: z.enum(["ABOVE", "BELOW"]),
  crossTime: z.string().datetime({ offset: true }),
  close: z.number().finite().positive(),
  ema9: z.number().finite().positive(),
  volume: z.number().finite().nonnegative().nullable(),
  volumeEma20: z.number().finite().positive().nullable(),
  volumeToEmaRatio: z.number().finite().nonnegative().nullable(),
  volumeConfirmed: z.boolean().nullable(),
}).strict();

const tentativeAlertSchema = z.object({
  rule: z.literal("SCALPER_V2_THREE_INSTRUMENT_EMA_ALIGNMENT_VOLUME_V2"),
  state: z.literal("POTENTIAL_ENTRY_REFERENCE"),
  direction: z.enum(["CALL", "PUT"]),
  intervalMinutes: z.literal(5),
  setupTime: z.string().datetime({ offset: true }),
  underlyingSymbol: z.string().regex(/^[A-Z0-9&_.-]{1,40}$/),
  expiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  legs: z.array(tentativeAlertLegSchema).length(3),
}).strict();

export function registerTradingAnalytics(app: Express, prisma: PrismaClient, auth?: RequestAuthenticator) {
  app.post("/v1/trading-analytics/scalper-v2/tentative-alert", async (req, res) => {
    if (!auth) return res.status(503).json({ error: { code: "TENTATIVE_ALERT_AUTH_UNAVAILABLE" } });
    try {
      const session = await auth.getSession(req);
      if (!session) return res.status(401).json({ error: { code: "AUTH_REQUIRED" } });
      auth.requireCsrf(req, session);
      const parsed = tentativeAlertSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: { code: "INVALID_TENTATIVE_ALERT", message: parsed.error.issues[0]?.message } });
      const value = parsed.data;
      const byInstrument = new Map(value.legs.map((leg) => [leg.instrument, leg]));
      const underlying = byInstrument.get("UNDERLYING");
      const ce = byInstrument.get("CE");
      const pe = byInstrument.get("PE");
      if (!underlying || !ce || !pe || !ce.symbol.endsWith("CE") || !pe.symbol.endsWith("PE")
        || ce.volumeConfirmed !== true || pe.volumeConfirmed !== true
        || ce.volume == null || ce.volumeEma20 == null || pe.volume == null || pe.volumeEma20 == null
        || ce.volume < ce.volumeEma20 * 0.95 || pe.volume < pe.volumeEma20 * 0.95
        || (ce.volumeToEmaRatio ?? 0) < 0.95 || (pe.volumeToEmaRatio ?? 0) < 0.95) {
        return res.status(400).json({ error: { code: "TENTATIVE_ALERT_EVIDENCE_INCOMPLETE" } });
      }
      const expectedSides = value.direction === "CALL"
        ? { UNDERLYING: "ABOVE", CE: "ABOVE", PE: "BELOW" }
        : { UNDERLYING: "BELOW", CE: "BELOW", PE: "ABOVE" };
      if (value.legs.some((leg) => leg.targetSide !== expectedSides[leg.instrument]))
        return res.status(400).json({ error: { code: "TENTATIVE_ALERT_DIRECTION_MISMATCH" } });
      if (value.legs.some((leg) => leg.targetSide === "ABOVE" ? leg.close <= leg.ema9 : leg.close >= leg.ema9))
        return res.status(400).json({ error: { code: "TENTATIVE_ALERT_EMA_EVIDENCE_MISMATCH" } });
      const setupMs = Date.parse(value.setupTime);
      const crossMs = value.legs.map((leg) => Date.parse(leg.crossTime));
      if (setupMs > Date.now() || Date.now() - setupMs > 10 * 60_000 || crossMs.some((time) => time > setupMs || setupMs - time > 5 * 60_000))
        return res.status(409).json({ error: { code: "TENTATIVE_ALERT_STALE" } });

      const eventKey = createHash("sha256").update([
        value.rule, value.underlyingSymbol, value.expiry, value.direction,
        ce.symbol, pe.symbol, value.setupTime,
      ].join("|"), "utf8").digest("hex");
      const rows = await prisma.$queryRawUnsafe<Array<{ eventKey: string }>>(`
        INSERT INTO nse_ops.scalper_v2_tentative_alert_outbox(
          event_key,trade_date,snapshot_time,underlying_symbol,expiry,direction,ce_symbol,pe_symbol,
          payload,created_by
        )
        SELECT $1,(now() AT TIME ZONE 'Asia/Kolkata')::date,$2::timestamptz,$3,$4::date,$5,$6,$7,$8::jsonb,$9
        WHERE $2::timestamptz >= now() - interval '10 minutes'
          AND $2::timestamptz <= now()
          AND ($2::timestamptz AT TIME ZONE 'Asia/Kolkata')::date = (now() AT TIME ZONE 'Asia/Kolkata')::date
        ON CONFLICT(event_key) DO NOTHING
        RETURNING event_key AS "eventKey"`,
      eventKey, value.setupTime, value.underlyingSymbol, value.expiry, value.direction, ce.symbol, pe.symbol,
      JSON.stringify(value), session.user.uid);
      if (!rows.length) {
        const existing = await prisma.$queryRawUnsafe<Array<{ eventKey: string }>>(
          "SELECT event_key AS \"eventKey\" FROM nse_ops.scalper_v2_tentative_alert_outbox WHERE event_key=$1 AND trade_date=(now() AT TIME ZONE 'Asia/Kolkata')::date",
          eventKey,
        );
        if (existing.length) return res.json({ accepted: true, duplicate: true, eventKey });
        return res.status(409).json({ error: { code: "TENTATIVE_ALERT_NOT_CURRENT_SESSION" } });
      }
      return res.status(202).json({ accepted: true, duplicate: false, eventKey });
    } catch (error) {
      const status = Number((error as { status?: unknown })?.status);
      if (status === 403) return res.status(403).json({ error: { code: "CSRF_REQUIRED" } });
      return res.status(503).json({ error: { code: "TENTATIVE_ALERT_QUEUE_UNAVAILABLE" } });
    }
  });
  app.get("/v1/trading-analytics/scalper-log", async (req, res) => {
    if (process.env.TRADING_ANALYTICS_ENABLED === "false")
      return res.status(404).json({ error: { code: "MODULE_DISABLED" } });
    const parsed = z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      symbol: z.string().regex(/^[A-Z0-9&_.-]{1,40}$/).optional(),
      direction: z.enum(["CALL", "PUT"]).optional(),
      interval: z.coerce.number().refine((value) => [1, 5, 15].includes(value)).optional(),
      limit: z.coerce.number().int().min(1).max(5000).default(1000),
    }).safeParse(req.query);
    if (!parsed.success)
      return res.status(400).json({ error: { code: "INVALID_SCALPER_LOG_QUERY" } });
    try {
      const rows = await prisma.$queryRawUnsafe<Facts[]>(`
        select s.signal_key,s.rule_version,s.trade_date::text,s.interval_minutes,s.setup_end,s.entry_end,s.direction,
          s.underlying_symbol,s.underlying_token,s.expiry::text,s.strike::float8,
          s.underlying_setup_close::float8,s.underlying_ema9::float8,s.underlying_body_fraction::float8,
          s.underlying_entry_open::float8,s.option_symbol,s.option_token,s.option_setup_close::float8,
          s.option_ema9::float8,s.option_body_fraction::float8,s.option_entry_open::float8,
          s.delivery_status,s.delivered_at,s.created_at,
          o.ce_symbol,o.ce_token,o.pe_symbol,o.pe_token,o.ce_entry_open::float8,o.pe_entry_open::float8,
          o.condition_evidence,o.indicator_evidence,o.outcome_evidence,o.outcome_state,o.outcome_updated_at,
          ce.lotsize::float8 ce_lot_size,pe.lotsize::float8 pe_lot_size,
          ce.updated_at ce_lot_size_asof,pe.updated_at pe_lot_size_asof,
          'CURRENT_EXACT_CONTRACT_MASTER_NOT_HISTORICAL'::text lot_size_basis
        from nse_ops.scalper_entry_signal s
        join nse_ops.scalper_trade_observation o using(signal_key)
        left join lateral (select lotsize,updated_at from instruments where exchange='NFO' and tradingsymbol=o.ce_symbol and symbol_token=o.ce_token and expiry=s.expiry order by updated_at desc limit 1) ce on true
        left join lateral (select lotsize,updated_at from instruments where exchange='NFO' and tradingsymbol=o.pe_symbol and symbol_token=o.pe_token and expiry=s.expiry order by updated_at desc limit 1) pe on true
        where s.trade_date=coalesce($1::date,(now() at time zone 'Asia/Kolkata')::date)
          and s.rule_version='FNO_PAIRED_EMA9_POSITION_BODY70_NEXT_OPEN_V7'
          and ($2::text is null or s.underlying_symbol=$2)
          and ($3::text is null or s.direction=$3)
          and ($4::int is null or s.interval_minutes=$4)
        order by s.entry_end desc,s.underlying_symbol
        limit $5::int`,
        parsed.data.date ?? null, parsed.data.symbol ?? null, parsed.data.direction ?? null,
        parsed.data.interval ?? null, parsed.data.limit,
      );
      return res.json({
        version: "SCALPER_TRADE_OBSERVATION_V1",
        date: parsed.data.date ?? null,
        rows,
        count: rows.length,
        paperOrdersEnabled: false,
        description: "Read-only V7 paired EMA9 entry, maximum excursion, endpoint trend and thesis-alignment evidence; not booked paper P&L.",
      });
    } catch {
      return res.status(503).json({ error: { code: "SCALPER_LOG_UNAVAILABLE" } });
    }
  });
  app.get("/v1/trading-analytics/scalper-context", liveJsonSingleflight(15_000), async (req, res) => {
    if (process.env.TRADING_ANALYTICS_ENABLED === "false")
      return res.status(404).json({ error: { code: "MODULE_DISABLED" } });
    const parsed = querySchema.pick({ symbol: true, asOf: true, expiry: true }).safeParse(req.query);
    if (!parsed.success)
      return res.status(400).json({ error: { code: "INVALID_SCALPER_CONTEXT_QUERY" } });
    const asOf = parsed.data.asOf ?? new Date().toISOString();
    if (Date.parse(asOf) > Date.now())
      return res.status(400).json({ error: { code: "FUTURE_ASOF_NOT_ALLOWED" } });
    const errors: { source: string; state: string }[] = [];
    const read = async (source: string, sql: string, ...args: unknown[]) => {
      try {
        return await prisma.$queryRawUnsafe<Facts[]>(sql, ...args);
      } catch {
        errors.push({ source, state: "SOURCE_QUERY_FAILED" });
        return [];
      }
    };
    try {
      const underlying = await analyticsUnderlying(read, asOf, parsed.data.symbol);
      const [dayBars, dailyCalendar, smartapi] = await Promise.all([
        read(
          "scalper_daily",
          `SELECT b.trade_date::text date,open::float8,high::float8,low::float8,close::float8,volume::text,source,created_at FROM public.bars_1d b WHERE exchange='NSE' AND symbol_token=$2 AND (b.trade_date<($1::timestamptz AT TIME ZONE 'Asia/Kolkata')::date OR EXISTS (SELECT 1 FROM public.trading_calendar c WHERE c.trade_date=b.trade_date AND c.is_trading_day AND c.market_close_ts<=$1::timestamptz)) AND b.trade_date<=($1::timestamptz AT TIME ZONE 'Asia/Kolkata')::date AND created_at<=$1::timestamptz ORDER BY b.trade_date DESC LIMIT 400`,
          asOf,
          underlying.token,
        ),
        read(
          "scalper_calendar",
          `SELECT trade_date::text,market_open_ts,market_close_ts,'REGULAR'::text phase_id,updated_at FROM public.trading_calendar WHERE is_trading_day AND trade_date<=($1::timestamptz AT TIME ZONE 'Asia/Kolkata')::date ORDER BY trade_date DESC LIMIT 450`,
          asOf,
        ),
        loadSmartApiNifty(read, asOf, parsed.data.expiry, underlying),
      ]);
      const daily = [...dayBars].reverse();
      const resistance = resistanceViews(
        daily,
        asOf,
        numeric(smartapi.spot?.ltp),
        Number(process.env.TRADING_ANALYTICS_DAILY_LEVEL_LOOKBACK ?? 20),
        Number(process.env.TRADING_ANALYTICS_WEEKLY_LEVEL_LOOKBACK ?? 12),
        dailyCalendar,
      );
      return res.json({
        version: `${VERSION}_SCALPER_CONTEXT_V1`,
        asOf,
        underlying,
        universe: [underlying],
        smartapi,
        resistance,
        referenceLevels: underlyingReferenceLevels(daily, smartapi.spot, asOf),
        errors,
        state: errors.length ? "PARTIAL" : "OBSERVED",
        liveOrdersEnabled: false,
        paperOrdersEnabled: false,
      });
    } catch {
      return res.status(503).json({ error: { code: "SCALPER_CONTEXT_UNAVAILABLE" } });
    }
  });
  app.get("/v1/trading-analytics/underlying-universe", async (req, res) => {
    if (process.env.TRADING_ANALYTICS_ENABLED === "false")
      return res.status(404).json({ error: { code: "MODULE_DISABLED" } });
    const parsed = querySchema.pick({ asOf: true }).safeParse(req.query);
    if (!parsed.success)
      return res.status(400).json({ error: { code: "INVALID_UNIVERSE_QUERY" } });
    const asOf = parsed.data.asOf ?? new Date().toISOString();
    if (Date.parse(asOf) > Date.now())
      return res.status(400).json({ error: { code: "FUTURE_ASOF_NOT_ALLOWED" } });
    try {
      const universe = await analyticsUniverse(
        async (_source, sql, ...args) => prisma.$queryRawUnsafe<Facts[]>(sql, ...args),
        asOf,
      );
      return res.json({ asOf, universe });
    } catch {
      return res.status(503).json({ error: { code: "UNDERLYING_UNIVERSE_UNAVAILABLE" } });
    }
  });
  app.get("/v1/trading-analytics/option-price-history", liveJsonSingleflight(30_000), async (req, res) => {
    if (process.env.TRADING_ANALYTICS_ENABLED === "false")
      return res.status(404).json({ error: { code: "MODULE_DISABLED" } });
    const parsed = z.object({
      symbol: z.string().regex(/^[A-Z0-9&_.-]{1,40}$/).default("NIFTY"),
      expiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      asOf: z.string().datetime({ offset: true }).optional(),
      historyDays: z.coerce.number().int().min(1).max(15).default(3),
      interval: z.coerce.number().int().refine((value) => value === 5 || value === 15).default(5),
    }).safeParse(req.query);
    if (!parsed.success)
      return res.status(400).json({ error: { code: "INVALID_OPTION_PRICE_HISTORY_QUERY" } });
    const asOf = parsed.data.asOf ?? new Date().toISOString();
    if (Date.parse(asOf) > Date.now())
      return res.status(400).json({ error: { code: "FUTURE_ASOF_NOT_ALLOWED" } });
    try {
      let rows = await prisma.$queryRawUnsafe<Facts[]>(
        `SELECT s.id::text snapshot_id,s.captured_at,s.source,
                s.underlying_value::float8 underlying_value,
                l.strike::float8 strike,l.option_type,
                l.last_price::float8 last_price,l.open_interest::float8 open_interest,
                l.change_in_oi::float8 change_in_oi,l.total_traded_volume::float8 total_traded_volume,
                l.bid_qty::float8 bid_qty,l.ask_qty::float8 ask_qty,
                NULL::float8 total_buy_qty,NULL::float8 total_sell_qty,
                l.bid_price::float8 bid_price,l.ask_price::float8 ask_price
         FROM option_chain_snapshots s
         JOIN option_chain_legs l ON l.snapshot_id=s.id
         WHERE s.symbol=$2 AND s.expiry_date=$3::date
           AND s.captured_at BETWEEN $1::timestamptz-make_interval(days=>$4::int) AND $1::timestamptz
           AND l.option_type IN ('CE','PE')
         ORDER BY s.captured_at,l.strike,l.option_type
         LIMIT 50000`,
        asOf,parsed.data.symbol,parsed.data.expiry,parsed.data.historyDays,
      );
      if (rows.length === 0) {
        const underlying = await analyticsUnderlying(
          async (_source, sql, ...args) => prisma.$queryRawUnsafe<Facts[]>(sql, ...args),
          asOf,
          parsed.data.symbol,
        );
        rows = await prisma.$queryRawUnsafe<Facts[]>(
          `WITH spot AS (
             SELECT q.ltp::numeric value
             FROM quote_snapshots q
             WHERE q.exchange='NSE' AND q.symbol_token=$5 AND q.ts<=$1::timestamptz AND q.ltp IS NOT NULL
             ORDER BY q.ts DESC LIMIT 1
           ), strikes AS (
             SELECT i.strike
             FROM instruments i,spot
             WHERE i.exchange='NFO' AND i.name=$2 AND i.instrumenttype=$6 AND i.expiry=$3::date
               AND i.updated_at<=$1::timestamptz
             GROUP BY i.strike,spot.value
             HAVING count(*) FILTER (WHERE i.tradingsymbol LIKE '%CE')>0
                AND count(*) FILTER (WHERE i.tradingsymbol LIKE '%PE')>0
             ORDER BY abs(i.strike-spot.value),i.strike LIMIT 10
           ), ranked AS (
             SELECT q.symbol_token,i.strike::float8 strike,
                    CASE WHEN i.tradingsymbol LIKE '%CE' THEN 'CE' ELSE 'PE' END option_type,
                    to_timestamp(floor(extract(epoch FROM q.exch_feed_time)/($7::int*60))*($7::int*60)) captured_at,
                    q.exch_feed_time,q.ts,q.ltp::float8 last_price,q.oi::float8 open_interest,
                    q.volume::float8 total_traded_volume,q.bid_qty::float8 bid_qty,q.ask_qty::float8 ask_qty,
                    q.total_buy_qty::float8 total_buy_qty,q.total_sell_qty::float8 total_sell_qty,
                    q.bid::float8 bid_price,q.ask::float8 ask_price,
                    row_number() OVER (PARTITION BY q.symbol_token,to_timestamp(floor(extract(epoch FROM q.exch_feed_time)/($7::int*60))*($7::int*60)) ORDER BY q.exch_feed_time DESC,q.ts DESC) ordinal
             FROM quote_snapshots q
             JOIN instruments i ON i.exchange=q.exchange AND i.symbol_token=q.symbol_token
             JOIN strikes s ON s.strike=i.strike
             WHERE q.exchange='NFO' AND i.name=$2 AND i.instrumenttype=$6 AND i.expiry=$3::date
               AND (i.tradingsymbol LIKE '%CE' OR i.tradingsymbol LIKE '%PE')
               AND q.ts BETWEEN $1::timestamptz-make_interval(days=>$4::int) AND $1::timestamptz
               AND q.exch_feed_time<=$1::timestamptz
               AND (q.exch_feed_time AT TIME ZONE 'Asia/Kolkata')::time BETWEEN time '09:15' AND time '15:30'
           )
           SELECT concat('quote:',symbol_token,':',extract(epoch FROM captured_at)::bigint)::text snapshot_id,
                  captured_at,'smartapi_quote_snapshots'::text source,NULL::float8 underlying_value,
                  strike,option_type,last_price,open_interest,NULL::float8 change_in_oi,total_traded_volume,
                  bid_qty,ask_qty,total_buy_qty,total_sell_qty,bid_price,ask_price
           FROM ranked WHERE ordinal=1 ORDER BY captured_at,strike,option_type LIMIT 50000`,
          asOf, parsed.data.symbol, parsed.data.expiry, parsed.data.historyDays,
          underlying.token, underlying.optionType, parsed.data.interval,
        );
      }
      return res.json({
        version: `${VERSION}_OPTION_POSITIONING_HISTORY_V2`,
        asOf,
        symbol: parsed.data.symbol,
        expiry: parsed.data.expiry,
        unit: "INR",
        scope: "ALL_STRIKES_CAPTURED_PER_SNAPSHOT",
        points: rows.map((row) => ({
          snapshotId: String(row.snapshot_id),
          capturedAt: new Date(String(row.captured_at)).toISOString(),
          source: row.source,
          underlyingValue: numeric(row.underlying_value),
          strike: numeric(row.strike),
          side: row.option_type,
          price: numeric(row.last_price),
          oi: numeric(row.open_interest),
          reportedChangeOi: numeric(row.change_in_oi),
          volume: numeric(row.total_traded_volume),
          bidQty: numeric(row.bid_qty),
          askQty: numeric(row.ask_qty),
          totalBuyQty: numeric(row.total_buy_qty),
          totalSellQty: numeric(row.total_sell_qty),
          bid: numeric(row.bid_price),
          ask: numeric(row.ask_price),
        })),
        limitations: [
          "The opening baseline is the first retained option-chain price observation in the selected session.",
          "The captured strike window may move with the underlying and is not claimed to be the complete exchange expiry chain.",
          "When the native option-chain archive is absent, retained SmartAPI FULL quotes are bucketed to the requested 5- or 15-minute interval and change in OI uses the first retained session observation.",
          "Composite positioning pressure reports its available component count; unavailable depth, volume, price, or OI inputs are not replaced with zero.",
        ],
        liveOrdersEnabled: false,
        paperOrdersEnabled: false,
      });
    } catch {
      return res.status(503).json({ error: { code: "OPTION_PRICE_HISTORY_UNAVAILABLE" } });
    }
  });
  app.get("/v1/trading-analytics/charts", liveJsonSingleflight(15_000), async (req, res) => {
    if (process.env.TRADING_ANALYTICS_ENABLED === "false")
      return res.status(404).json({ error: { code: "MODULE_DISABLED" } });
    const q = z
      .object({
        symbol: z.string().regex(/^[A-Z0-9&_.-]{1,40}$/).default('NIFTY'),
        asOf: z.string().datetime({ offset: true }).optional(),
        expiry: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
        strike: z.coerce.number().positive().optional(),
        ceStrike: z.coerce.number().positive().optional(),
        peStrike: z.coerce.number().positive().optional(),
        interval: z.coerce
          .number()
          .refine((n) => [1, 5, 15, 60].includes(n))
          .default(5),
        historyDays: z.coerce.number().int().min(1).max(15).default(15),
      })
      .safeParse(req.query);
    if (!q.success)
      return res.status(400).json({ error: { code: "INVALID_CHART_QUERY" } });
    const asOf = q.data.asOf ?? new Date().toISOString();
    if (Date.parse(asOf) > Date.now())
      return res
        .status(400)
        .json({ error: { code: "FUTURE_ASOF_NOT_ALLOWED" } });
    try {
      const underlying=await analyticsUnderlying(async (_source,sql,...args)=>prisma.$queryRawUnsafe<Facts[]>(sql,...args),asOf,q.data.symbol);
      const sessions = await prisma.$queryRawUnsafe<Facts[]>(
        `SELECT trade_date::text,market_open_ts,market_close_ts,'REGULAR'::text phase_id,updated_at FROM trading_calendar WHERE is_trading_day AND trade_date BETWEEN ($1::timestamptz AT TIME ZONE 'Asia/Kolkata')::date-$2::int AND ($1::timestamptz AT TIME ZONE 'Asia/Kolkata')::date ORDER BY trade_date`,
        asOf,
        q.data.historyDays,
      );
      const availableContracts = await prisma.$queryRawUnsafe<Facts[]>(
        `SELECT i.expiry::text expiry,i.strike::float8 strike,
                count(*) FILTER (WHERE i.tradingsymbol LIKE '%CE')::int ce_contracts,
                count(*) FILTER (WHERE i.tradingsymbol LIKE '%PE')::int pe_contracts
         FROM instruments i
         WHERE i.name=$3 AND i.exchange='NFO' AND i.instrumenttype=$4
           AND i.expiry>=($1::timestamptz AT TIME ZONE 'Asia/Kolkata')::date
           AND i.updated_at<=$1::timestamptz
           AND EXISTS (
             SELECT 1 FROM bars_1m b
             WHERE b.exchange=i.exchange AND b.symbol_token=i.symbol_token
               AND b.ts>=$1::timestamptz-make_interval(days=>$2::int)
               AND b.ts+interval '1 minute'<=$1::timestamptz
               AND b.created_at<=$1::timestamptz
           )
         GROUP BY i.expiry,i.strike
         HAVING (count(*) FILTER (WHERE i.tradingsymbol LIKE '%CE')>0
             OR count(*) FILTER (WHERE i.tradingsymbol LIKE '%PE')>0)
         ORDER BY i.expiry,i.strike`,
        asOf,q.data.historyDays,underlying.symbol,underlying.optionType,
      );
      // The canonical Go master has already converted broker strike units to rupees.
      const selectedStrikes = resolveChartStrikeSelection(q.data);
      const contracts =
        q.data.expiry && (selectedStrikes.ceStrike || selectedStrikes.peStrike)
          ? await prisma.$queryRawUnsafe<Facts[]>(
              `SELECT exchange,symbol_token,tradingsymbol,expiry::text,strike::float8,lotsize,updated_at
               FROM instruments
               WHERE name=$5 AND exchange='NFO' AND instrumenttype=$6 AND expiry=$2::date
                 AND ((tradingsymbol LIKE '%CE' AND $3::numeric IS NOT NULL AND strike=$3::numeric)
                   OR (tradingsymbol LIKE '%PE' AND $4::numeric IS NOT NULL AND strike=$4::numeric))
                 AND updated_at<=$1::timestamptz
               ORDER BY tradingsymbol`,
              asOf,
              q.data.expiry,
              selectedStrikes.ceStrike ?? null,
              selectedStrikes.peStrike ?? null,
              underlying.symbol,underlying.optionType,
            )
          : [];
      const identities = [
        {
          exchange: "NSE",
          symbol_token: underlying.token,
          tradingsymbol: underlying.label,
        },
        ...contracts,
      ];
      const volumeInstrument = underlying.kind === "INDEX"
        ? (await prisma.$queryRawUnsafe<Facts[]>(
            `SELECT exchange,symbol_token,tradingsymbol,expiry::text,instrumenttype,updated_at
             FROM instruments i
             WHERE i.name=$2 AND i.exchange='NFO' AND i.instrumenttype='FUTIDX'
               AND i.expiry>=($1::timestamptz AT TIME ZONE 'Asia/Kolkata')::date
               AND i.updated_at<=$1::timestamptz
               AND EXISTS (
                 SELECT 1 FROM bars_1m b
                 WHERE b.exchange=i.exchange AND b.symbol_token=i.symbol_token
                   AND b.ts>=$1::timestamptz-make_interval(days=>$3::int)
                   AND b.ts+interval '1 minute'<=$1::timestamptz
                   AND b.created_at<=$1::timestamptz
               )
             ORDER BY i.expiry,i.updated_at DESC,i.symbol_token
             LIMIT 1`,
            asOf, underlying.symbol, q.data.historyDays,
          ))[0] ?? null
        : { exchange: "NSE", symbol_token: underlying.token, tradingsymbol: underlying.label, expiry: null, instrumenttype: "EQUITY" };
      const [panes, cumulativeOiRows, derivedCumulativeOiRows, volumeMinutes] = await Promise.all([
        Promise.all(identities.map(async (identity) => {
          const minutes = await prisma.$queryRawUnsafe<Facts[]>(
            `SELECT DISTINCT ON (ts) ts,created_at,open::float8,high::float8,low::float8,close::float8,volume::text,oi::text,source
             FROM bars_1m WHERE exchange=$2 AND symbol_token=$3
             AND ts>=$1::timestamptz-make_interval(days=>$4::int)
             AND ts+interval '1 minute'<=$1::timestamptz AND created_at<=$1::timestamptz
             ORDER BY ts,created_at DESC LIMIT 25000`,
            asOf,
            identity.exchange,
            identity.symbol_token,
            q.data.historyDays,
          );
          const rawOi = identity.exchange === "NFO"
            ? await prisma.$queryRawUnsafe<Facts[]>(
                `SELECT exch_feed_time event_time,ts collected_at,oi::text oi FROM quote_snapshots
                 WHERE exchange=$2 AND symbol_token=$3
                 AND ts BETWEEN $1::timestamptz-make_interval(days=>$4::int) AND $1::timestamptz
                 AND exch_feed_time<=$1::timestamptz AND oi IS NOT NULL
                 ORDER BY exch_feed_time,ts LIMIT 25000`,
                asOf,identity.exchange,identity.symbol_token,q.data.historyDays,
              ) : [];
          return {
            identity,
            bars: sessionBars(minutes, sessions, q.data.interval, asOf),
            coverage: sessionCoverage(minutes, sessions, q.data.interval, asOf),
            sourceMinuteCount: minutes.length,
            oiHistory: sessionAlignedOi(rawOi,sessions,q.data.interval,asOf),
          };
        })),
        q.data.expiry
          ? prisma.$queryRawUnsafe<Facts[]>(
              `SELECT s.id::text snapshot_id,
                      s.captured_at,
                      s.source,
                      s.strikes_around,
                      'PROVIDER_REPORTED_CHANGE'::text baseline_kind,
                      count(DISTINCT l.strike)::int strike_count,
                      count(*) FILTER (WHERE l.option_type='CE')::int ce_contract_count,
                      count(l.open_interest) FILTER (WHERE l.option_type='CE')::int ce_observed_count,
                      CASE WHEN count(*) FILTER (WHERE l.option_type='CE') > 0
                                  AND count(l.open_interest) FILTER (WHERE l.option_type='CE') = count(*) FILTER (WHERE l.option_type='CE')
                           THEN (sum(l.open_interest) FILTER (WHERE l.option_type='CE'))::text ELSE NULL END ce_oi,
                      count(*) FILTER (WHERE l.option_type='PE')::int pe_contract_count,
                      count(l.open_interest) FILTER (WHERE l.option_type='PE')::int pe_observed_count,
                      CASE WHEN count(*) FILTER (WHERE l.option_type='PE') > 0
                                  AND count(l.open_interest) FILTER (WHERE l.option_type='PE') = count(*) FILTER (WHERE l.option_type='PE')
                           THEN (sum(l.open_interest) FILTER (WHERE l.option_type='PE'))::text ELSE NULL END pe_oi,
                      count(l.change_in_oi) FILTER (WHERE l.option_type='CE')::int ce_change_observed_count,
                      CASE WHEN count(*) FILTER (WHERE l.option_type='CE') > 0
                                  AND count(l.change_in_oi) FILTER (WHERE l.option_type='CE') = count(*) FILTER (WHERE l.option_type='CE')
                           THEN (sum(l.change_in_oi) FILTER (WHERE l.option_type='CE'))::text ELSE NULL END ce_change_oi,
                      count(l.change_in_oi) FILTER (WHERE l.option_type='PE')::int pe_change_observed_count,
                      CASE WHEN count(*) FILTER (WHERE l.option_type='PE') > 0
                                  AND count(l.change_in_oi) FILTER (WHERE l.option_type='PE') = count(*) FILTER (WHERE l.option_type='PE')
                           THEN (sum(l.change_in_oi) FILTER (WHERE l.option_type='PE'))::text ELSE NULL END pe_change_oi
               FROM option_chain_snapshots s
               JOIN option_chain_legs l ON l.snapshot_id=s.id
               WHERE s.symbol=$3 AND s.expiry_date=$2::date
                 AND s.captured_at BETWEEN $1::timestamptz-make_interval(days=>$4::int) AND $1::timestamptz
               GROUP BY s.id,s.captured_at,s.source,s.strikes_around
               ORDER BY s.captured_at
               LIMIT 5000`,
              asOf,q.data.expiry,underlying.symbol,q.data.historyDays,
            )
          : Promise.resolve([] as Facts[]),
        q.data.expiry
          ? prisma.$queryRawUnsafe<Facts[]>(
              `SELECT concat('derived:',id)::text snapshot_id,captured_at,source,strikes_around,strike_count,
                      ce_contract_count,ce_observed_count,ce_oi::text,
                      pe_contract_count,pe_observed_count,pe_oi::text,
                      ce_change_observed_count,ce_change_oi::text,
                      pe_change_observed_count,pe_change_oi::text,baseline_kind
               FROM public.scalper_oi_history h
               WHERE h.symbol=$3 AND h.expiry_date=$2::date
                 AND h.captured_at BETWEEN $1::timestamptz-make_interval(days=>$4::int) AND $1::timestamptz
                 AND NOT EXISTS (
                   SELECT 1 FROM public.option_chain_snapshots native
                   WHERE native.symbol=h.symbol AND native.expiry_date=h.expiry_date
                     AND (native.captured_at AT TIME ZONE 'Asia/Kolkata')::date=h.trade_date
                 )
               ORDER BY captured_at LIMIT 5000`,
              asOf,q.data.expiry,underlying.symbol,q.data.historyDays,
            )
          : Promise.resolve([] as Facts[]),
        volumeInstrument
          ? prisma.$queryRawUnsafe<Facts[]>(
              `SELECT DISTINCT ON (ts) ts,created_at,open::float8,high::float8,low::float8,close::float8,volume::text,oi::text,source
               FROM bars_1m WHERE exchange=$2 AND symbol_token=$3
               AND ts>=$1::timestamptz-make_interval(days=>$4::int)
               AND ts+interval '1 minute'<=$1::timestamptz AND created_at<=$1::timestamptz
               ORDER BY ts,created_at DESC LIMIT 25000`,
              asOf, volumeInstrument.exchange, volumeInstrument.symbol_token, q.data.historyDays,
            )
          : Promise.resolve([] as Facts[]),
      ]);
      const cumulativeOiHistory = buildCumulativeOiHistory(
        [...cumulativeOiRows,...derivedCumulativeOiRows]
          .sort((left,right)=>Date.parse(String(left.captured_at))-Date.parse(String(right.captured_at))),
      );
      const volumeBars = volumeInstrument
        ? sessionBars(volumeMinutes, sessions, q.data.interval, asOf)
        : [];
      return res.json({
        version: VERSION,
        asOf,
        interval: q.data.interval,
        historyDays: q.data.historyDays,
        calendar: {
          version: "TRADING_CALENDAR_ROWS_UPDATED_AT_V1",
          source: "public.trading_calendar",
          sessions: sessions.map(row=>({trade_date:row.trade_date,market_open_ts:row.market_open_ts,market_close_ts:row.market_close_ts,phase_id:row.phase_id,updated_at:row.updated_at})),
        },
        underlying,
        availableContracts,
        panes,
        volumeSeries: {
          kind: underlying.kind === "INDEX" ? "CURRENT_MONTH_FUTURE" : "CASH_UNDERLYING",
          unit: "provider_native_volume",
          state: volumeInstrument && volumeBars.some((bar) => bar.closed && numeric(bar.volume) != null) ? "AVAILABLE" : "UNAVAILABLE",
          identity: volumeInstrument ? {
            exchange: volumeInstrument.exchange,
            symbolToken: volumeInstrument.symbol_token,
            tradingSymbol: volumeInstrument.tradingsymbol,
            expiry: volumeInstrument.expiry ?? null,
          } : null,
          bars: volumeBars,
          limitations: underlying.kind === "INDEX"
            ? ["Index activity uses the nearest active FUTIDX contract with retained one-minute bars; it is not cash-index volume."]
            : ["Stock activity uses retained NSE cash-market one-minute volume for the selected underlying."],
        },
        cumulativeOiHistory: {
          expiry: q.data.expiry ?? null,
          unit: "contracts",
          scope: "ALL_STRIKES_CAPTURED_PER_SNAPSHOT",
          points: cumulativeOiHistory,
          limitations: [
            "Each timestamp sums every strike retained in that captured option-chain snapshot; it is not a temporal running total.",
            "The captured strike window may change with the underlying and is not claimed to be the complete exchange expiry chain.",
            "When a native NSE option-chain session is absent, a materialised SmartAPI ATM-nearest cohort may be used. SmartAPI underlying units are divided by the exact contract lot size; derived change in OI uses each exact contract's last captured pre-session OI.",
          ],
        },
        state: "PREVIEW_UNAPPROVED",
        limitations: [
          "Calendar rows are date-effective retained session boundaries; segment/security phase provenance remains explicit in the calendar payload.",
          "Incomplete minute coverage cannot confirm an EMA rule.",
          "Current master knowledge cutoff may exclude historical contracts; no replacement token used.",
          "Historical bars may be revised in source; original publication versions are unavailable.",
        ],
      });
    } catch {
      return res
        .status(503)
        .json({ error: { code: "CHART_SOURCE_UNAVAILABLE" } });
    }
  });
  app.get("/v1/trading-analytics/morning-summary", async (_req, res) => {
    if (process.env.TRADING_ANALYTICS_ENABLED === "false") return res.status(404).json({ error: { code: "MODULE_DISABLED" } });
    const asOf = new Date().toISOString();
    try {
      const payload = await loadMorningSummary(prisma, asOf);
      res.setHeader("Cache-Control", "private, max-age=60, stale-while-revalidate=240");
      return res.json(payload);
    } catch {
      return res.status(503).json({ error: { code: "MORNING_SUMMARY_UNAVAILABLE" } });
    }
  });
  app.get("/v1/trading-analytics", async (req, res) => {
    if (process.env.TRADING_ANALYTICS_ENABLED === "false")
      return res.status(404).json({ error: { code: "MODULE_DISABLED" } });
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success)
      return res.status(400).json({
        error: {
          code: "INVALID_QUERY",
          message: "Use ISO asOf and YYYY-MM-DD date/expiry.",
        },
      });
    const asOf = parsed.data.asOf ?? new Date().toISOString();
    if (Date.parse(asOf) > Date.now())
      return res
        .status(400)
        .json({ error: { code: "FUTURE_ASOF_NOT_ALLOWED" } });
    try {
      return res.json(
        await loadTradingAnalytics(
          prisma,
          asOf,
          parsed.data.date,
          parsed.data.expiry,
          parsed.data.dailyLookback,
          parsed.data.weeklyLookback,
          parsed.data.symbol,
        ),
      );
    } catch {
      return res.status(503).json({
        error: {
          code: "TRADING_ANALYTICS_UNAVAILABLE",
          message:
            "Research evidence could not be loaded; no orders were submitted.",
        },
      });
    }
  });
}
