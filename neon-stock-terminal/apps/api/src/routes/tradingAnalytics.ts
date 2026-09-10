import type { Express } from "express";
import type { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import { z } from "zod";
import { loadSmartApiNifty } from "../services/tradingAnalyticsSmartApi";
import { periodCandles } from "../services/tradingAnalyticsPeriods";
import { resistanceViews } from "../services/tradingAnalyticsResistance";
import { analyticsUniverse, selectUnderlying } from '../services/tradingAnalyticsUniverse';
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
  const [rawStats, rawPeople, cash, expiries, dayBars, smartapi, cashHistory] =
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
      // Legacy cash has no observation timestamp. It is descriptive only, never PIT-qualified.
      read(
        "cash",
        `SELECT participant_type,buy_value,sell_value,net_value,market_date::text,exchange_scope,source_dataset FROM institutional_flow.normalized_nse_fii_dii WHERE market_date=$1::date AND source_dataset='nse_fii_dii_nse_only'`,
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
    ]);
  const [priorPeopleRows, dailyCalendar] = await Promise.all([
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
  const chainLegs = window.legs.map((l) => {
    const p = priorLegs.find(
      (v) => v.strike === l.strike && v.option_type === l.option_type,
    );
    return {
      ...l,
      baseline_open_interest: p?.open_interest ?? null,
      baseline_kind: p ? "PREVIOUS_ARCHIVED_SNAPSHOT" : "BASELINE_UNAVAILABLE",
      baseline_collected_at: previous?.captured_at ?? null,
      oi_layers: oiLayers(p?.open_interest, l.open_interest),
      previous_snapshot_delta:
        p &&
        numeric(p.open_interest) != null &&
        numeric(l.open_interest) != null
          ? numeric(l.open_interest)! - numeric(p.open_interest)!
          : null,
    };
  });
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
      note: "Descriptive retained reports, not point-in-time qualified. Older cash reports do not replace the selected-date cash input in the market matrix. NSE-only and combined-exchange totals are not mixed.",
    },
    activity: stats,
    participants: people,
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
export function registerTradingAnalytics(app: Express, prisma: PrismaClient) {
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
  app.get("/v1/trading-analytics/scalper-context", async (req, res) => {
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
      const universe = await analyticsUniverse(read, asOf);
      const underlying = selectUnderlying(universe, parsed.data.symbol);
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
      const resistance = resistanceViews(
        dayBars.reverse(),
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
        universe,
        smartapi,
        resistance,
        errors,
        state: errors.length ? "PARTIAL" : "OBSERVED",
        liveOrdersEnabled: false,
        paperOrdersEnabled: false,
      });
    } catch {
      return res.status(503).json({ error: { code: "SCALPER_CONTEXT_UNAVAILABLE" } });
    }
  });
  app.get("/v1/trading-analytics/charts", async (req, res) => {
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
      const universe=await analyticsUniverse(async (_source,sql,...args)=>prisma.$queryRawUnsafe<Facts[]>(sql,...args),asOf);
      const underlying=selectUnderlying(universe,q.data.symbol);
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
         HAVING count(*) FILTER (WHERE i.tradingsymbol LIKE '%CE')>0
            AND count(*) FILTER (WHERE i.tradingsymbol LIKE '%PE')>0
         ORDER BY i.expiry,i.strike`,
        asOf,q.data.historyDays,underlying.symbol,underlying.optionType,
      );
      // The canonical Go master has already converted broker strike units to rupees.
      const contracts =
        q.data.expiry && q.data.strike
          ? await prisma.$queryRawUnsafe<Facts[]>(
              `SELECT exchange,symbol_token,tradingsymbol,expiry::text,strike::float8,lotsize,updated_at FROM instruments WHERE name=$4 AND exchange='NFO' AND instrumenttype=$5 AND expiry=$2::date AND strike=$3::numeric AND updated_at<=$1::timestamptz ORDER BY tradingsymbol`,
              asOf,
              q.data.expiry,
              q.data.strike,
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
      const panes = await Promise.all(
        identities.map(async (identity) => {
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
        }),
      );
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
