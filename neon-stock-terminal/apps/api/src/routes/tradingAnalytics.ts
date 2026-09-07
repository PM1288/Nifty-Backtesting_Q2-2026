import type { Express } from "express";
import type { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import { z } from "zod";
import { loadSmartApiNifty } from "../services/tradingAnalyticsSmartApi";
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
  VERSION,
  type Facts,
} from "../services/tradingAnalytics";

const querySchema = z.object({
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
  const [rawStats, rawPeople, cash, expiries, dayBars, smartapi] =
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
        `SELECT participant_type,net_value,market_date::text,exchange_scope,source_dataset FROM institutional_flow.normalized_nse_fii_dii WHERE market_date=$1::date AND source_dataset='nse_fii_dii_nse_only'`,
        selected,
      ),
      read(
        "chain_expiries",
        `SELECT DISTINCT expiry_date::text FROM public.option_chain_snapshots WHERE symbol='NIFTY' AND captured_at<=$1::timestamptz AND expiry_date>=($1::timestamptz AT TIME ZONE 'Asia/Kolkata')::date ORDER BY expiry_date`,
        asOf,
      ),
      read(
        "nifty_daily",
        `SELECT b.trade_date::text date,open::float8,high::float8,low::float8,close::float8,source,created_at FROM public.bars_1d b WHERE exchange='NSE' AND symbol_token='99926000' AND (b.trade_date<($1::timestamptz AT TIME ZONE 'Asia/Kolkata')::date OR EXISTS (SELECT 1 FROM public.trading_calendar c WHERE c.trade_date=b.trade_date AND c.is_trading_day AND c.market_close_ts<=$1::timestamptz)) AND b.trade_date<=($1::timestamptz AT TIME ZONE 'Asia/Kolkata')::date AND created_at<=$1::timestamptz ORDER BY b.trade_date DESC LIMIT 400`,
        asOf,
      ),
      loadSmartApiNifty(read, asOf, expiry),
    ]);
  const stats = rawStats.map(activity),
    people = rawPeople.map((r) => participant(r.payload as Facts));
  const selectedExpiry =
    expiry ?? (expiries[0]?.expiry_date as string | undefined);
  const snapshots = selectedExpiry
    ? await read(
        "chain",
        `SELECT id::text,captured_at,expiry_date::text,underlying_value::float8,source,strikes_around FROM public.option_chain_snapshots WHERE symbol='NIFTY' AND expiry_date=$2::date AND captured_at<=$1::timestamptz ORDER BY captured_at DESC LIMIT 2`,
        asOf,
        selectedExpiry,
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
      knowledgeState: "CASH_PUBLICATION_TIME_UNVERIFIED",
      reportLagDays: Math.floor(
        (Date.parse(asOf) - Date.parse(selected)) / 86400000,
      ),
    },
    activity: stats,
    participants: people,
    issues,
    errors,
    candles,
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
        state: "NOT_ENABLED",
        reason:
          "Existing FII interval scheduler found; 06:00 locked/calendar-aware bundle release not validated.",
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
  app.get("/v1/trading-analytics/charts", async (req, res) => {
    if (process.env.TRADING_ANALYTICS_ENABLED === "false")
      return res.status(404).json({ error: { code: "MODULE_DISABLED" } });
    const q = z
      .object({
        asOf: z.string().datetime({ offset: true }).optional(),
        expiry: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
        strike: z.coerce.number().positive().optional(),
        interval: z.coerce
          .number()
          .refine((n) => [5, 15, 60].includes(n))
          .default(15),
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
      const sessions = await prisma.$queryRawUnsafe<Facts[]>(
        `SELECT trade_date::text,market_open_ts,market_close_ts FROM trading_calendar WHERE is_trading_day AND trade_date BETWEEN ($1::timestamptz AT TIME ZONE 'Asia/Kolkata')::date-10 AND ($1::timestamptz AT TIME ZONE 'Asia/Kolkata')::date ORDER BY trade_date`,
        asOf,
      );
      // The canonical Go master has already converted broker strike units to rupees.
      const contracts =
        q.data.expiry && q.data.strike
          ? await prisma.$queryRawUnsafe<Facts[]>(
              `SELECT exchange,symbol_token,tradingsymbol,expiry::text,strike::float8,lotsize,updated_at FROM instruments WHERE name='NIFTY' AND exchange='NFO' AND instrumenttype='OPTIDX' AND expiry=$2::date AND strike=$3::numeric AND updated_at<=$1::timestamptz ORDER BY tradingsymbol`,
              asOf,
              q.data.expiry,
              q.data.strike,
            )
          : [];
      const identities = [
        {
          exchange: "NSE",
          symbol_token: "99926000",
          tradingsymbol: "NIFTY 50",
        },
        ...contracts,
      ];
      const panes = await Promise.all(
        identities.map(async (identity) => {
          const minutes = await prisma.$queryRawUnsafe<Facts[]>(
            `SELECT ts,created_at,open::float8,high::float8,low::float8,close::float8,source FROM bars_1m WHERE exchange=$2 AND symbol_token=$3 AND ts>=$1::timestamptz-interval '10 days' AND ts+interval '1 minute'<=$1::timestamptz AND created_at<=$1::timestamptz ORDER BY ts LIMIT 6000`,
            asOf,
            identity.exchange,
            identity.symbol_token,
          );
          return {
            identity,
            bars: sessionBars(minutes, sessions, q.data.interval, asOf),
            sourceMinuteCount: minutes.length,
          };
        }),
      );
      return res.json({
        version: VERSION,
        asOf,
        interval: q.data.interval,
        panes,
        state: "PREVIEW_UNAPPROVED",
        limitations: [
          "Calendar phase endpoints are reused; segment-specific phase audit pending.",
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
