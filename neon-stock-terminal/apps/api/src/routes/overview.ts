import type { Express } from "express";
import { Prisma, type PrismaClient } from "@prisma/client";
import { marketDayIso, marketDayKeyUtc, marketDayStartUtc } from "../lib/time";
import { getStoredSnapshot, materializeSnapshot, serveSnapshotRoute, type SnapshotDefinition } from "../lib/dashboardSnapshots";
import { toNumber, toSafeVolume } from "../lib/num";

export type Quote = {
  symbol: string;
  name: string;
  last: number;
  change: number;
  changePct: number;
  sector: string | null;
  volume: number | string | null;
  timestamp: string;
  rsi: number | null;
  willr: number | null;
  change5d: number | null;
  relativeVolume: number | null;
  averageVolume20: number | null;
  bid: number | null;
  ask: number | null;
  bidQty: number | null;
  askQty: number | null;
  spreadPct: number | null;
  dayOpen: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  previousClose: number | null;
  rangePosition: number | null;
  opportunity30d: number | null;
  oiisSelected: boolean;
  oiisState: "AUTO_PAPER" | "RECOMMENDED" | "ELIGIBLE" | "WATCH" | null;
  oiisDirection: "LONG" | "SHORT" | "NEUTRAL" | null;
  oiisScore: number | null;
  oiisOFactor: number | null;
  oiisXFactor: number | null;
  oiisDataQuality: number | null;
  alert: {
    type: "EXCESS_PRICE_MOVE" | "BIG_ASK" | "BIG_BID" | "WIDE_SPREAD";
    severity: "HIGH" | "MEDIUM";
    label: string;
  } | null;
};

type FnoContractAnomaly = {
  symbolToken: string;
  tradingSymbol: string;
  underlying: string;
  instrumentType: string;
  expiry: string;
  strike: number | null;
  right: "CE" | "PE" | "FUT";
  lotSize: number | null;
  last: number | null;
  changePct: number | null;
  bid: number | null;
  ask: number | null;
  bidQty: number | null;
  askQty: number | null;
  bidNotional: number | null;
  askNotional: number | null;
  spreadPct: number | null;
  depthImbalance: number | null;
  lastUpdated: string | null;
  anomalyTypes: Array<"EXCESS_PRICE_MOVE" | "BIG_ASK" | "BIG_BID" | "WIDE_SPREAD">;
  severityScore: number;
};

type DerivativesOverview = {
  universe: "ALL_ACTIVE_NSE_FNO_CONTRACTS";
  contractCount: number;
  underlyingCount: number;
  observedContractCount: number;
  observedTodayCount: number;
  anomalyCount: number;
  bigAskCount: number;
  bigBidCount: number;
  excessPriceMoveCount: number;
  wideSpreadCount: number;
  asOf: string | null;
  anomalies: FnoContractAnomaly[];
};

type QuoteLite = {
  symbol: string;
  last: number;
  changePct: number;
};

type SectorGroup = { sector: string; stocks: Quote[] };

type OverviewPayload = {
  asOf: string;
  market: {
    isOpen: boolean;
    label: "OPEN" | "CLOSED";
  };
  indices: {
    nifty50: Quote;
    bankNifty: Quote;
    indiaVix: Quote;
  };
  nifty: Quote;
  sectors: SectorGroup[];
  leaderboards: {
    gainers: Quote[];
    losers: Quote[];
  };
  tickerTape: QuoteLite[];
  derivatives: DerivativesOverview;
};

type StackQuoteRow = {
  symbol: string;
  name: string;
  sector: string | null;
  last: number | null;
  change: number | null;
  change_pct: number | null;
  volume: number | string | null;
  timestamp: Date | string | null;
  rsi_14: number | null;
  willr_14: number | null;
  change_5d: number | null;
  average_volume_20: number | null;
  last_bid: number | null;
  last_ask: number | null;
  last_bid_qty: number | string | null;
  last_ask_qty: number | string | null;
  last_open: number | null;
  last_high: number | null;
  last_low: number | null;
  last_close: number | null;
  opportunity_30d: number | null;
  oiis_selected: boolean | null;
  oiis_recommended: boolean | null;
  oiis_eligible: boolean | null;
  oiis_auto_paper: boolean | null;
  oiis_direction: "LONG" | "SHORT" | "NEUTRAL" | null;
  oiis_score: number | null;
  oiis_ofactor: number | null;
  oiis_xfactor: number | null;
  oiis_data_quality: number | null;
};

type StackIndexRow = {
  symbol: string;
  name: string;
  last: number | null;
  change: number | null;
  change_pct: number | null;
  volume: number | string | null;
  timestamp: Date | string | null;
  rsi_14: number | null;
  willr_14: number | null;
};

type FnoSummaryRow = {
  contract_count: number | string;
  underlying_count: number | string;
  observed_contract_count: number | string;
  observed_today_count: number | string;
  anomaly_count: number | string;
  big_ask_count: number | string;
  big_bid_count: number | string;
  excess_price_move_count: number | string;
  wide_spread_count: number | string;
  latest_at: Date | string | null;
};

type FnoAnomalyRow = {
  symbol_token: string;
  tradingsymbol: string;
  underlying: string;
  instrumenttype: string;
  expiry: Date | string;
  strike: number | null;
  lotsize: number | null;
  last_price: number | null;
  percent_change: number | null;
  last_bid: number | null;
  last_ask: number | null;
  last_bid_qty: number | string | null;
  last_ask_qty: number | string | null;
  spread_pct: number | null;
  depth_imbalance: number | null;
  last_seen_ts: Date | string | null;
  excess_price_move: boolean;
  big_ask: boolean;
  big_bid: boolean;
  wide_spread: boolean;
  severity_score: number;
};

function toIso(ts: Date | string | null | undefined): string {
  if (!ts) return new Date().toISOString();
  if (ts instanceof Date) return ts.toISOString();
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

function nullableNumber(value: number | string | null | undefined): number | null {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function marketSessionProgressIst(now = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(now);
  const minuteOfDay = Number(parts.find((part) => part.type === "hour")?.value ?? 0) * 60
    + Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  return Math.max(0, Math.min(1, (minuteOfDay - (9 * 60 + 15)) / 385));
}

function quoteAlert(row: StackQuoteRow): Quote["alert"] {
  const change = nullableNumber(row.change_pct);
  const bid = nullableNumber(row.last_bid);
  const ask = nullableNumber(row.last_ask);
  const bidQty = nullableNumber(row.last_bid_qty);
  const askQty = nullableNumber(row.last_ask_qty);
  const midpoint = bid != null && ask != null && bid > 0 && ask >= bid ? (bid + ask) / 2 : null;
  const spreadPct = midpoint ? ((ask! - bid!) / midpoint) * 100 : null;

  if (change != null && Math.abs(change) >= 3) {
    return { type: "EXCESS_PRICE_MOVE", severity: Math.abs(change) >= 5 ? "HIGH" : "MEDIUM", label: `${change > 0 ? "+" : ""}${change.toFixed(1)}% move` };
  }
  if (askQty != null && bidQty != null && askQty >= 5_000 && askQty >= Math.max(1, bidQty) * 5) {
    return { type: "BIG_ASK", severity: askQty >= Math.max(1, bidQty) * 10 ? "HIGH" : "MEDIUM", label: `Ask wall ${Math.round(askQty / Math.max(1, bidQty))}×` };
  }
  if (bidQty != null && askQty != null && bidQty >= 5_000 && bidQty >= Math.max(1, askQty) * 5) {
    return { type: "BIG_BID", severity: bidQty >= Math.max(1, askQty) * 10 ? "HIGH" : "MEDIUM", label: `Bid wall ${Math.round(bidQty / Math.max(1, askQty))}×` };
  }
  if (spreadPct != null && spreadPct >= 0.5) {
    return { type: "WIDE_SPREAD", severity: spreadPct >= 1 ? "HIGH" : "MEDIUM", label: `${spreadPct.toFixed(2)}% spread` };
  }
  return null;
}

function emptyQuoteEnrichment(): Omit<Quote, "symbol" | "name" | "last" | "change" | "changePct" | "sector" | "volume" | "timestamp" | "rsi" | "willr"> {
  return {
    change5d: null,
    relativeVolume: null,
    averageVolume20: null,
    bid: null,
    ask: null,
    bidQty: null,
    askQty: null,
    spreadPct: null,
    dayOpen: null,
    dayHigh: null,
    dayLow: null,
    previousClose: null,
    rangePosition: null,
    opportunity30d: null,
    oiisSelected: false,
    oiisState: null,
    oiisDirection: null,
    oiisScore: null,
    oiisOFactor: null,
    oiisXFactor: null,
    oiisDataQuality: null,
    alert: null
  };
}

function emptyDerivativesOverview(): DerivativesOverview {
  return {
    universe: "ALL_ACTIVE_NSE_FNO_CONTRACTS",
    contractCount: 0,
    underlyingCount: 0,
    observedContractCount: 0,
    observedTodayCount: 0,
    anomalyCount: 0,
    bigAskCount: 0,
    bigBidCount: 0,
    excessPriceMoveCount: 0,
    wideSpreadCount: 0,
    asOf: null,
    anomalies: []
  };
}

function asQuote(row: StackQuoteRow): Quote {
  const last = nullableNumber(row.last) ?? 0;
  const averageVolume = nullableNumber(row.average_volume_20);
  const volume = nullableNumber(row.volume);
  const progress = Math.max(0.05, marketSessionProgressIst());
  const expectedVolume = averageVolume != null && averageVolume > 0 ? averageVolume * progress : null;
  const bid = nullableNumber(row.last_bid);
  const ask = nullableNumber(row.last_ask);
  const midpoint = bid != null && ask != null && bid > 0 && ask >= bid ? (bid + ask) / 2 : null;
  const dayLow = nullableNumber(row.last_low);
  const dayHigh = nullableNumber(row.last_high);
  const oiisState: Quote["oiisState"] = row.oiis_auto_paper
    ? "AUTO_PAPER"
    : row.oiis_recommended || row.oiis_selected
      ? "RECOMMENDED"
      : row.oiis_eligible
        ? "ELIGIBLE"
        : row.oiis_score != null
          ? "WATCH"
          : null;
  return {
    symbol: row.symbol,
    name: row.name || row.symbol,
    sector: row.sector ?? null,
    last,
    change: toNumber(row.change),
    changePct: toNumber(row.change_pct),
    volume: toSafeVolume(row.volume),
    timestamp: toIso(row.timestamp),
    rsi: row.rsi_14 == null ? null : toNumber(row.rsi_14),
    willr: row.willr_14 == null ? null : toNumber(row.willr_14),
    change5d: nullableNumber(row.change_5d),
    relativeVolume: expectedVolume ? volume! / expectedVolume : null,
    averageVolume20: averageVolume,
    bid,
    ask,
    bidQty: nullableNumber(row.last_bid_qty),
    askQty: nullableNumber(row.last_ask_qty),
    spreadPct: midpoint ? ((ask! - bid!) / midpoint) * 100 : null,
    dayOpen: nullableNumber(row.last_open),
    dayHigh,
    dayLow,
    previousClose: nullableNumber(row.last_close),
    rangePosition: dayLow != null && dayHigh != null && dayHigh > dayLow ? Math.max(0, Math.min(1, (last - dayLow) / (dayHigh - dayLow))) : null,
    opportunity30d: nullableNumber(row.opportunity_30d),
    oiisSelected: Boolean(row.oiis_selected || row.oiis_recommended || row.oiis_auto_paper),
    oiisState,
    oiisDirection: row.oiis_direction,
    oiisScore: nullableNumber(row.oiis_score),
    oiisOFactor: nullableNumber(row.oiis_ofactor),
    oiisXFactor: nullableNumber(row.oiis_xfactor),
    oiisDataQuality: nullableNumber(row.oiis_data_quality),
    alert: quoteAlert(row)
  };
}

function makeIndexQuote(
  symbol: string,
  name: string,
  row: Pick<StackIndexRow, "last" | "change" | "change_pct" | "volume" | "timestamp" | "rsi_14" | "willr_14"> | null,
  asOf: string
): Quote {
  return {
    symbol,
    name,
    sector: "INDEX",
    last: toNumber(row?.last ?? 0),
    change: toNumber(row?.change ?? 0),
    changePct: toNumber(row?.change_pct ?? 0),
    volume: toSafeVolume(row?.volume ?? null),
    timestamp: toIso(row?.timestamp ?? asOf),
    rsi: row?.rsi_14 == null ? null : toNumber(row.rsi_14),
    willr: row?.willr_14 == null ? null : toNumber(row.willr_14),
    ...emptyQuoteEnrichment()
  };
}

function isMissingRelationError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return msg.includes("does not exist") || msg.includes("relation") || msg.includes("p2021") || msg.includes("42p01");
}

function marketStatusIst(now = new Date()): { isOpen: boolean; label: "OPEN" | "CLOSED" } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(now);

  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "Sat";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");

  const isWeekday = ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(weekday);
  const mins = hour * 60 + minute;
  const openMins = 9 * 60 + 15;
  const closeMins = 15 * 60 + 40;
  const isOpen = isWeekday && mins >= openMins && mins < closeMins;

  return { isOpen, label: isOpen ? "OPEN" : "CLOSED" };
}

function buildOverviewFromQuotes(
  asOf: string,
  nifty: Quote,
  quotes: Quote[],
  indices: OverviewPayload["indices"],
  derivatives: DerivativesOverview
): OverviewPayload {
  const sectorMap = new Map<string, Quote[]>();
  for (const quote of quotes) {
    const sector = quote.sector ?? "OTHER";
    if (!sectorMap.has(sector)) sectorMap.set(sector, []);
    sectorMap.get(sector)!.push(quote);
  }

  const sectors: SectorGroup[] = [...sectorMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([sector, list]) => ({
      sector,
      stocks: list.sort((a, b) => b.changePct - a.changePct)
    }));

  const sorted = [...quotes].sort((a, b) => b.changePct - a.changePct);
  const gainers = sorted.slice(0, 20);
  const losers = [...sorted].reverse().slice(0, 20);
  const moversByAbs = [...sorted].sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct));

  const tickerTape: QuoteLite[] = [
    { symbol: indices.nifty50.symbol, last: indices.nifty50.last, changePct: indices.nifty50.changePct },
    { symbol: indices.bankNifty.symbol, last: indices.bankNifty.last, changePct: indices.bankNifty.changePct },
    { symbol: indices.indiaVix.symbol, last: indices.indiaVix.last, changePct: indices.indiaVix.changePct },
    ...moversByAbs
      .filter((q) => !["NIFTY50", "BANKNIFTY", "INDIAVIX"].includes(q.symbol))
      .slice(0, 30)
      .map((q) => ({ symbol: q.symbol, last: q.last, changePct: q.changePct }))
  ];

  return {
    asOf,
    market: marketStatusIst(new Date()),
    indices,
    nifty,
    sectors,
    leaderboards: { gainers, losers },
    tickerTape,
    derivatives
  };
}

async function getTradingStackOverview(prisma: PrismaClient): Promise<OverviewPayload> {
  const [indexRows, stockRows, contractSummaryRows, contractAnomalyRows] = await Promise.all([
    prisma.$queryRaw<StackIndexRow[]>(Prisma.sql`
      WITH index_targets(symbol_token, symbol, name) AS (
        VALUES
          ('99926000', 'NIFTY50', 'NIFTY 50'),
          ('99926009', 'BANKNIFTY', 'BANK NIFTY'),
          ('99926017', 'INDIAVIX', 'INDIA VIX')
      ),
      indicator_base AS (
        SELECT
          b.symbol_token,
          b.trade_date,
          b.high::double precision AS high,
          b.low::double precision AS low,
          b.close::double precision AS close,
          ROW_NUMBER() OVER (PARTITION BY b.symbol_token ORDER BY b.trade_date DESC) AS rn_desc,
          LAG(b.close::double precision) OVER (PARTITION BY b.symbol_token ORDER BY b.trade_date) AS prev_close
        FROM bars_1d b
        JOIN index_targets t ON t.symbol_token = b.symbol_token
        WHERE b.exchange = 'NSE'
      ),
      rsi_window AS (
        SELECT
          symbol_token,
          AVG(GREATEST(close - prev_close, 0)) AS avg_gain,
          AVG(GREATEST(prev_close - close, 0)) AS avg_loss
        FROM indicator_base
        WHERE rn_desc <= 15 AND prev_close IS NOT NULL
        GROUP BY symbol_token
      ),
      willr_window AS (
        SELECT
          symbol_token,
          MAX(high) AS high_max,
          MIN(low) AS low_min,
          (ARRAY_AGG(close ORDER BY trade_date DESC))[1] AS close_latest
        FROM indicator_base
        WHERE rn_desc <= 14
        GROUP BY symbol_token
      ),
      indicator_calc AS (
        SELECT
          t.symbol_token,
          CASE
            WHEN rw.avg_loss IS NULL THEN NULL
            WHEN rw.avg_loss = 0 THEN 100
            ELSE 100 - (100 / (1 + (rw.avg_gain / NULLIF(rw.avg_loss, 0))))
          END AS rsi_14,
          CASE
            WHEN ww.high_max IS NULL OR ww.low_min IS NULL OR ww.close_latest IS NULL THEN NULL
            WHEN ww.high_max = ww.low_min THEN NULL
            ELSE ((ww.high_max - ww.close_latest) / NULLIF(ww.high_max - ww.low_min, 0)) * -100
          END AS willr_14
        FROM index_targets t
        LEFT JOIN rsi_window rw ON rw.symbol_token = t.symbol_token
        LEFT JOIN willr_window ww ON ww.symbol_token = t.symbol_token
      )
      SELECT
        t.symbol,
        t.name,
        COALESCE(st.last_price, st.last_close, 0)::double precision AS last,
        COALESCE(st.net_change, 0)::double precision AS change,
        COALESCE(st.percent_change, 0)::double precision AS change_pct,
        COALESCE(st.last_volume, 0)::double precision AS volume,
        st.last_seen_ts AS timestamp,
        ic.rsi_14,
        ic.willr_14
      FROM index_targets t
      LEFT JOIN instrument_state st
        ON st.exchange = 'NSE' AND st.symbol_token = t.symbol_token
      LEFT JOIN indicator_calc ic
        ON ic.symbol_token = t.symbol_token
    `),
    prisma.$queryRaw<StackQuoteRow[]>(Prisma.sql`
      WITH fno_underlyings AS (
        SELECT DISTINCT UPPER(TRIM(i.name)) AS symbol
        FROM instruments i
        WHERE i.exchange = 'NFO'
          AND i.instrumenttype IN ('FUTSTK','OPTSTK')
          AND i.expiry BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '1 year'
          AND UPPER(COALESCE(i.name, '')) NOT LIKE '%TEST%'
      ),
      universe AS (
        SELECT f.symbol, eq.symbol_token, eq.tradingsymbol
        FROM fno_underlyings f
        JOIN LATERAL (
          SELECT i.symbol_token, i.tradingsymbol
          FROM instruments i
          WHERE i.exchange = 'NSE'
            AND (
              UPPER(TRIM(i.name)) = f.symbol
              OR UPPER(REGEXP_REPLACE(TRIM(i.tradingsymbol), '-EQ$', '')) = f.symbol
            )
          ORDER BY CASE WHEN i.tradingsymbol LIKE '%-EQ' THEN 0 ELSE 1 END, i.updated_at DESC
          LIMIT 1
        ) eq ON TRUE
      ),
      classified AS (
        SELECT
          u.symbol_token,
          u.symbol,
          u.tradingsymbol,
          CASE
            WHEN u.symbol IN ('TMCV', 'TMPV') THEN 'Automobile and Auto Components'
            ELSE COALESCE(
              NULLIF(TRIM(ic.sector), ''),
              NULLIF(TRIM(ic.industry), ''),
              NULLIF(TRIM(ic.basic_industry), ''),
              'OTHER'
            )
          END AS sector
        FROM universe u
        LEFT JOIN LATERAL (
          SELECT c.sector, c.industry, c.basic_industry
          FROM index_constituents c
          WHERE UPPER(TRIM(c.symbol)) = u.symbol
          ORDER BY
            CASE WHEN UPPER(TRIM(c.index_name)) IN ('NIFTY100', 'NIFTY 100') THEN 0 ELSE 1 END,
            c.updated_at DESC
          LIMIT 1
        ) ic ON TRUE
      ),
      rsi_window AS (
        SELECT
          d.symbol_token,
          AVG(d.gain) AS avg_gain,
          AVG(d.loss) AS avg_loss
        FROM (
          SELECT
            b.symbol_token,
            ROW_NUMBER() OVER (PARTITION BY b.symbol_token ORDER BY b.trade_date DESC) AS rn_desc,
            GREATEST(
              b.close::double precision
              - LAG(b.close::double precision) OVER (PARTITION BY b.symbol_token ORDER BY b.trade_date),
              0
            ) AS gain,
            GREATEST(
              LAG(b.close::double precision) OVER (PARTITION BY b.symbol_token ORDER BY b.trade_date)
              - b.close::double precision,
              0
            ) AS loss
          FROM bars_1d b
          JOIN universe u ON u.symbol_token = b.symbol_token
          WHERE b.exchange = 'NSE'
        ) d
        WHERE d.rn_desc <= 15 AND (d.gain IS NOT NULL OR d.loss IS NOT NULL)
        GROUP BY d.symbol_token
      ),
      willr_window AS (
        SELECT
          d.symbol_token,
          MAX(d.high) AS high_max,
          MIN(d.low) AS low_min,
          (ARRAY_AGG(d.close ORDER BY d.trade_date DESC))[1] AS close_latest
        FROM (
          SELECT
            b.symbol_token,
            b.trade_date,
            b.high::double precision AS high,
            b.low::double precision AS low,
            b.close::double precision AS close,
            ROW_NUMBER() OVER (PARTITION BY b.symbol_token ORDER BY b.trade_date DESC) AS rn_desc
          FROM bars_1d b
          JOIN universe u ON u.symbol_token = b.symbol_token
          WHERE b.exchange = 'NSE'
        ) d
        WHERE d.rn_desc <= 14
        GROUP BY d.symbol_token
      ),
      rsi_calc AS (
        SELECT
          symbol_token,
          CASE
            WHEN avg_loss IS NULL THEN NULL
            WHEN avg_loss = 0 THEN 100
            ELSE 100 - (100 / (1 + (avg_gain / NULLIF(avg_loss, 0))))
          END AS rsi_14
        FROM rsi_window
      ),
      willr_calc AS (
        SELECT
          symbol_token,
          CASE
            WHEN high_max IS NULL OR low_min IS NULL OR close_latest IS NULL THEN NULL
            WHEN high_max = low_min THEN NULL
            ELSE ((high_max - close_latest) / NULLIF(high_max - low_min, 0)) * -100
          END AS willr_14
        FROM willr_window
      ),
      daily_ranked AS (
        SELECT
          b.symbol_token,
          b.close::double precision AS close,
          b.volume::double precision AS volume,
          ROW_NUMBER() OVER (PARTITION BY b.symbol_token ORDER BY b.trade_date DESC) AS rn
        FROM bars_1d b
        JOIN universe u ON u.symbol_token = b.symbol_token
        WHERE b.exchange = 'NSE'
      ),
      daily_metrics AS (
        SELECT
          symbol_token,
          MAX(close) FILTER (WHERE rn = 1) AS latest_close,
          MAX(close) FILTER (WHERE rn = 6) AS close_5d_ago,
          AVG(volume) FILTER (WHERE rn BETWEEN 2 AND 21) AS average_volume_20
        FROM daily_ranked
        WHERE rn <= 21
        GROUP BY symbol_token
      ),
      latest_oiis_run AS (
        SELECT run_id
        FROM oiis_live.selection_run
        WHERE status = 'COMPLETED'
        ORDER BY trade_date DESC, completed_at DESC NULLS LAST
        LIMIT 1
      ),
      oiis AS (
        SELECT
          c.symbol,
          c.selected,
          c.recommended,
          c.auto_paper_eligible,
          c.auto_paper_selected,
          c.direction,
          c.quality_score,
          c.ofactor,
          c.xfactor_snapshot,
          c.data_quality
        FROM oiis_live.daily_candidate c
        JOIN latest_oiis_run r ON r.run_id = c.run_id
      ),
      h30_latest AS (
        SELECT DISTINCT ON (UPPER(symbol))
          UPPER(symbol) AS symbol,
          after_tax_max_close_upside_pct::double precision AS opportunity_30d
        FROM strategy_eval.long_horizon_observation
        WHERE rankable_flag
          AND after_tax_max_close_upside_pct IS NOT NULL
        ORDER BY UPPER(symbol), created_at DESC, entry_date DESC
      )
      SELECT
        c.symbol,
        c.tradingsymbol AS name,
        c.sector,
        COALESCE(st.last_price, st.last_close, 0)::double precision AS last,
        COALESCE(st.net_change, 0)::double precision AS change,
        COALESCE(st.percent_change, 0)::double precision AS change_pct,
        COALESCE(st.last_volume, 0)::double precision AS volume,
        st.last_seen_ts AS timestamp,
        rc.rsi_14,
        wc.willr_14,
        CASE
          WHEN dm.latest_close > 0 AND dm.close_5d_ago > 0
          THEN ((dm.latest_close / dm.close_5d_ago) - 1) * 100
          ELSE NULL
        END AS change_5d,
        dm.average_volume_20,
        st.last_bid::double precision AS last_bid,
        st.last_ask::double precision AS last_ask,
        st.last_bid_qty,
        st.last_ask_qty,
        st.last_open::double precision AS last_open,
        st.last_high::double precision AS last_high,
        st.last_low::double precision AS last_low,
        st.last_close::double precision AS last_close,
        h.opportunity_30d,
        o.selected AS oiis_selected,
        o.recommended AS oiis_recommended,
        o.auto_paper_eligible AS oiis_eligible,
        o.auto_paper_selected AS oiis_auto_paper,
        o.direction AS oiis_direction,
        o.quality_score::double precision AS oiis_score,
        o.ofactor::double precision AS oiis_ofactor,
        o.xfactor_snapshot::double precision AS oiis_xfactor,
        o.data_quality::double precision AS oiis_data_quality
      FROM classified c
      LEFT JOIN instrument_state st
        ON st.exchange = 'NSE' AND st.symbol_token = c.symbol_token
      LEFT JOIN rsi_calc rc
        ON rc.symbol_token = c.symbol_token
      LEFT JOIN willr_calc wc
        ON wc.symbol_token = c.symbol_token
      LEFT JOIN daily_metrics dm
        ON dm.symbol_token = c.symbol_token
      LEFT JOIN oiis o
        ON UPPER(o.symbol) = c.symbol
      LEFT JOIN h30_latest h
        ON h.symbol = c.symbol
      ORDER BY c.symbol ASC
    `),
    prisma.$queryRaw<FnoSummaryRow[]>(Prisma.sql`
      WITH contracts AS (
        SELECT
          i.symbol_token,
          i.name AS underlying,
          i.instrumenttype,
          i.lotsize,
          s.last_seen_ts,
          s.last_price::double precision AS last_price,
          s.percent_change::double precision AS percent_change,
          s.last_bid::double precision AS last_bid,
          s.last_ask::double precision AS last_ask,
          s.last_bid_qty::double precision AS last_bid_qty,
          s.last_ask_qty::double precision AS last_ask_qty,
          CASE WHEN s.last_bid > 0 AND s.last_ask >= s.last_bid
            THEN ((s.last_ask - s.last_bid) / NULLIF((s.last_ask + s.last_bid) / 2, 0)) * 100
            ELSE NULL END AS spread_pct
        FROM instruments i
        LEFT JOIN instrument_state s
          ON s.exchange = i.exchange AND s.symbol_token = i.symbol_token
        WHERE i.exchange = 'NFO'
          AND i.instrumenttype IN ('FUTIDX','FUTSTK','OPTIDX','OPTSTK')
          AND i.expiry BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '1 year'
          AND UPPER(COALESCE(i.name, '')) NOT LIKE '%TEST%'
      ),
      classified AS (
        SELECT *,
          (ABS(COALESCE(percent_change, 0)) >= CASE WHEN instrumenttype LIKE 'OPT%' THEN 20 ELSE 3 END) AS excess_move,
          (COALESCE(last_ask_qty, 0) >= GREATEST(COALESCE(lotsize, 1) * 5, 100)
            AND COALESCE(last_ask_qty, 0) >= GREATEST(COALESCE(last_bid_qty, 0), 1) * 5) AS big_ask,
          (COALESCE(last_bid_qty, 0) >= GREATEST(COALESCE(lotsize, 1) * 5, 100)
            AND COALESCE(last_bid_qty, 0) >= GREATEST(COALESCE(last_ask_qty, 0), 1) * 5) AS big_bid,
          (COALESCE(spread_pct, 0) >= CASE WHEN instrumenttype LIKE 'OPT%' THEN 8 ELSE 1 END) AS wide_spread,
          ((last_seen_ts AT TIME ZONE 'Asia/Kolkata')::date = (NOW() AT TIME ZONE 'Asia/Kolkata')::date) AS observed_today
        FROM contracts
      )
      SELECT
        COUNT(*)::bigint::text AS contract_count,
        COUNT(DISTINCT underlying)::bigint::text AS underlying_count,
        COUNT(*) FILTER (WHERE last_seen_ts IS NOT NULL)::bigint::text AS observed_contract_count,
        COUNT(*) FILTER (WHERE observed_today)::bigint::text AS observed_today_count,
        COUNT(*) FILTER (WHERE observed_today AND (excess_move OR big_ask OR big_bid OR wide_spread))::bigint::text AS anomaly_count,
        COUNT(*) FILTER (WHERE observed_today AND big_ask)::bigint::text AS big_ask_count,
        COUNT(*) FILTER (WHERE observed_today AND big_bid)::bigint::text AS big_bid_count,
        COUNT(*) FILTER (WHERE observed_today AND excess_move)::bigint::text AS excess_price_move_count,
        COUNT(*) FILTER (WHERE observed_today AND wide_spread)::bigint::text AS wide_spread_count,
        MAX(last_seen_ts) AS latest_at
      FROM classified
    `),
    prisma.$queryRaw<FnoAnomalyRow[]>(Prisma.sql`
      WITH base AS (
        SELECT
          i.symbol_token,
          i.tradingsymbol,
          UPPER(i.name) AS underlying,
          i.instrumenttype,
          i.expiry,
          NULLIF(i.strike, -1)::double precision AS strike,
          i.lotsize,
          s.last_price::double precision AS last_price,
          s.percent_change::double precision AS percent_change,
          s.last_bid::double precision AS last_bid,
          s.last_ask::double precision AS last_ask,
          s.last_bid_qty,
          s.last_ask_qty,
          s.last_seen_ts,
          CASE WHEN s.last_bid > 0 AND s.last_ask >= s.last_bid
            THEN ((s.last_ask - s.last_bid) / NULLIF((s.last_ask + s.last_bid) / 2, 0)) * 100
            ELSE NULL END AS spread_pct,
          CASE WHEN COALESCE(s.last_bid_qty, 0) + COALESCE(s.last_ask_qty, 0) > 0
            THEN (COALESCE(s.last_bid_qty, 0) - COALESCE(s.last_ask_qty, 0))::double precision
              / NULLIF(COALESCE(s.last_bid_qty, 0) + COALESCE(s.last_ask_qty, 0), 0)
            ELSE NULL END AS depth_imbalance
        FROM instruments i
        JOIN instrument_state s
          ON s.exchange = i.exchange AND s.symbol_token = i.symbol_token
        WHERE i.exchange = 'NFO'
          AND i.instrumenttype IN ('FUTIDX','FUTSTK','OPTIDX','OPTSTK')
          AND i.expiry BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '1 year'
          AND UPPER(COALESCE(i.name, '')) NOT LIKE '%TEST%'
          AND (s.last_seen_ts AT TIME ZONE 'Asia/Kolkata')::date = (NOW() AT TIME ZONE 'Asia/Kolkata')::date
      ),
      classified AS (
        SELECT *,
          (ABS(COALESCE(percent_change, 0)) >= CASE WHEN instrumenttype LIKE 'OPT%' THEN 20 ELSE 3 END) AS excess_price_move,
          (COALESCE(last_ask_qty, 0) >= GREATEST(COALESCE(lotsize, 1) * 5, 100)
            AND COALESCE(last_ask_qty, 0) >= GREATEST(COALESCE(last_bid_qty, 0), 1) * 5) AS big_ask,
          (COALESCE(last_bid_qty, 0) >= GREATEST(COALESCE(lotsize, 1) * 5, 100)
            AND COALESCE(last_bid_qty, 0) >= GREATEST(COALESCE(last_ask_qty, 0), 1) * 5) AS big_bid,
          (COALESCE(spread_pct, 0) >= CASE WHEN instrumenttype LIKE 'OPT%' THEN 8 ELSE 1 END) AS wide_spread
        FROM base
      )
      , scored AS (
        SELECT *, GREATEST(
          LEAST(ABS(COALESCE(percent_change, 0)) / CASE WHEN instrumenttype LIKE 'OPT%' THEN 20 ELSE 3 END, 10),
          LEAST(COALESCE(last_ask_qty, 0)::double precision / GREATEST(COALESCE(last_bid_qty, 0), 1) / 5, 20),
          LEAST(COALESCE(last_bid_qty, 0)::double precision / GREATEST(COALESCE(last_ask_qty, 0), 1) / 5, 20),
          LEAST(COALESCE(spread_pct, 0) / CASE WHEN instrumenttype LIKE 'OPT%' THEN 8 ELSE 1 END, 10)
        )::double precision AS severity_score
        FROM classified
        WHERE excess_price_move OR big_ask OR big_bid OR wide_spread
      ), diversified AS (
        SELECT *, ROW_NUMBER() OVER (
          PARTITION BY underlying
          ORDER BY severity_score DESC,
            GREATEST(
              COALESCE(last_bid, 0) * COALESCE(last_bid_qty, 0),
              COALESCE(last_ask, 0) * COALESCE(last_ask_qty, 0)
            ) DESC,
            last_seen_ts DESC,
            tradingsymbol
        ) AS underlying_rank
        FROM scored
      )
      SELECT *
      FROM diversified
      WHERE underlying_rank <= 2
      ORDER BY severity_score DESC,
        GREATEST(
          COALESCE(last_bid, 0) * COALESCE(last_bid_qty, 0),
          COALESCE(last_ask, 0) * COALESCE(last_ask_qty, 0)
        ) DESC,
        last_seen_ts DESC,
        tradingsymbol
      LIMIT 36
    `)
  ]);

  const asOf = new Date().toISOString();
  const indexBySymbol = new Map(indexRows.map((r) => [r.symbol, r]));

  const nifty = makeIndexQuote("NIFTY50", "NIFTY 50", indexBySymbol.get("NIFTY50") ?? null, asOf);
  const indices = {
    nifty50: nifty,
    bankNifty: makeIndexQuote("BANKNIFTY", "BANK NIFTY", indexBySymbol.get("BANKNIFTY") ?? null, asOf),
    indiaVix: makeIndexQuote("INDIAVIX", "INDIA VIX", indexBySymbol.get("INDIAVIX") ?? null, asOf)
  };

  const contractSummary = contractSummaryRows[0];
  const anomalies: FnoContractAnomaly[] = contractAnomalyRows.map((row) => {
    const anomalyTypes: FnoContractAnomaly["anomalyTypes"] = [];
    if (row.excess_price_move) anomalyTypes.push("EXCESS_PRICE_MOVE");
    if (row.big_ask) anomalyTypes.push("BIG_ASK");
    if (row.big_bid) anomalyTypes.push("BIG_BID");
    if (row.wide_spread) anomalyTypes.push("WIDE_SPREAD");
    const bid = nullableNumber(row.last_bid);
    const ask = nullableNumber(row.last_ask);
    const bidQty = nullableNumber(row.last_bid_qty);
    const askQty = nullableNumber(row.last_ask_qty);
    return {
      symbolToken: row.symbol_token,
      tradingSymbol: row.tradingsymbol,
      underlying: row.underlying,
      instrumentType: row.instrumenttype,
      expiry: toIso(row.expiry).slice(0, 10),
      strike: nullableNumber(row.strike),
      right: row.instrumenttype.startsWith("FUT") ? "FUT" : row.tradingsymbol.endsWith("CE") ? "CE" : "PE",
      lotSize: row.lotsize,
      last: nullableNumber(row.last_price),
      changePct: nullableNumber(row.percent_change),
      bid,
      ask,
      bidQty,
      askQty,
      bidNotional: bid != null && bidQty != null ? bid * bidQty : null,
      askNotional: ask != null && askQty != null ? ask * askQty : null,
      spreadPct: nullableNumber(row.spread_pct),
      depthImbalance: nullableNumber(row.depth_imbalance),
      lastUpdated: row.last_seen_ts ? toIso(row.last_seen_ts) : null,
      anomalyTypes,
      severityScore: toNumber(row.severity_score)
    };
  });
  const derivatives: DerivativesOverview = {
    universe: "ALL_ACTIVE_NSE_FNO_CONTRACTS",
    contractCount: Number(contractSummary?.contract_count ?? 0),
    underlyingCount: Number(contractSummary?.underlying_count ?? 0),
    observedContractCount: Number(contractSummary?.observed_contract_count ?? 0),
    observedTodayCount: Number(contractSummary?.observed_today_count ?? 0),
    anomalyCount: Number(contractSummary?.anomaly_count ?? 0),
    bigAskCount: Number(contractSummary?.big_ask_count ?? 0),
    bigBidCount: Number(contractSummary?.big_bid_count ?? 0),
    excessPriceMoveCount: Number(contractSummary?.excess_price_move_count ?? 0),
    wideSpreadCount: Number(contractSummary?.wide_spread_count ?? 0),
    asOf: contractSummary?.latest_at ? toIso(contractSummary.latest_at) : null,
    anomalies
  };

  const quotes = stockRows.map(asQuote);
  return buildOverviewFromQuotes(asOf, nifty, quotes, indices, derivatives);
}

async function getSeedSchemaOverview(prisma: PrismaClient): Promise<OverviewPayload> {
  const asOf = new Date().toISOString();
  const stocks = await prisma.stock.findMany({
    where: {
      OR: [{ symbol: "NIFTY50" }, { isNifty100: true }]
    },
    include: { sector: true }
  });

  const stockIds = stocks.map((s) => s.id);
  const dayKey = marketDayKeyUtc();
  const dayStart = marketDayStartUtc();

  const dailyToday = await prisma.dailySnapshot.findMany({
    where: { stockId: { in: stockIds }, date: dayKey }
  });
  const dailyByStock = new Map(dailyToday.map((d) => [d.stockId, d]));

  if (dailyByStock.size < stockIds.length) {
    const latestDailyDates = await prisma.dailySnapshot.groupBy({
      by: ["stockId"],
      where: { stockId: { in: stockIds } },
      _max: { date: true }
    });

    const ors = latestDailyDates
      .filter((g) => g._max.date)
      .map((g) => ({ stockId: g.stockId, date: g._max.date! }));

    if (ors.length) {
      const latestRows = await prisma.dailySnapshot.findMany({ where: { OR: ors } });
      for (const row of latestRows) {
        if (!dailyByStock.has(row.stockId)) dailyByStock.set(row.stockId, row);
      }
    }
  }

  const latestTsByStock = await prisma.intradayBar.groupBy({
    by: ["stockId"],
    where: { stockId: { in: stockIds }, ts: { gte: dayStart } },
    _max: { ts: true }
  });

  const barOrs = latestTsByStock
    .filter((g) => g._max.ts)
    .map((g) => ({ stockId: g.stockId, ts: g._max.ts! }));

  const latestBars = barOrs.length ? await prisma.intradayBar.findMany({ where: { OR: barOrs } }) : [];

  const barByStock = new Map(latestBars.map((b) => [b.stockId, b]));

  const quotes: Quote[] = stocks
    .filter((s) => s.symbol !== "NIFTY50")
    .map((s) => {
      const daily = dailyByStock.get(s.id);
      const prevClose = daily ? toNumber(daily.prevClose) : 0;
      const dayClose = daily ? toNumber(daily.close) : 0;

      const bar = barByStock.get(s.id);
      const last = bar ? toNumber(bar.close) : dayClose;

      const change = last - prevClose;
      const changePct = prevClose ? (change / prevClose) * 100 : 0;

      return {
        symbol: s.symbol,
        name: s.name,
        sector:
          s.symbol === "TMCV" || s.symbol === "TMPV"
            ? "Automobile and Auto Components"
            : (s.sector?.name ?? "OTHER"),
        last,
        change,
        changePct,
        volume: bar ? toSafeVolume(bar.volume) : daily ? toSafeVolume(daily.volume) : null,
        timestamp: bar ? bar.ts.toISOString() : asOf,
        rsi: null,
        willr: null,
        ...emptyQuoteEnrichment()
      };
    });

  const niftyStock = stocks.find((s) => s.symbol === "NIFTY50");
  if (!niftyStock) {
    throw new Error("NIFTY50 not found");
  }
  const niftyDaily = dailyByStock.get(niftyStock.id);
  const niftyBar = barByStock.get(niftyStock.id);
  const prevClose = niftyDaily ? toNumber(niftyDaily.prevClose) : 0;
  const last = niftyBar ? toNumber(niftyBar.close) : niftyDaily ? toNumber(niftyDaily.close) : 0;
  const change = last - prevClose;
  const changePct = prevClose ? (change / prevClose) * 100 : 0;

  const nifty: Quote = {
    symbol: "NIFTY50",
    name: "NIFTY 50",
    sector: "INDEX",
    last,
    change,
    changePct,
    volume: niftyBar ? toSafeVolume(niftyBar.volume) : niftyDaily ? toSafeVolume(niftyDaily.volume) : null,
    timestamp: niftyBar ? niftyBar.ts.toISOString() : asOf,
    rsi: null,
    willr: null,
    ...emptyQuoteEnrichment()
  };

  const emptyIndex = (symbol: string, name: string): Quote => ({
    symbol,
    name,
    sector: "INDEX",
    last: 0,
    change: 0,
    changePct: 0,
    volume: 0,
    timestamp: asOf,
    rsi: null,
    willr: null,
    ...emptyQuoteEnrichment()
  });

  return buildOverviewFromQuotes(asOf, nifty, quotes, {
    nifty50: nifty,
    bankNifty: emptyIndex("BANKNIFTY", "BANK NIFTY"),
    indiaVix: emptyIndex("INDIAVIX", "INDIA VIX")
  }, emptyDerivativesOverview());
}

export async function getOverview(prisma: PrismaClient): Promise<OverviewPayload> {
  try {
    return await getTradingStackOverview(prisma);
  } catch (err) {
    if (!isMissingRelationError(err)) throw err;
    return getSeedSchemaOverview(prisma);
  }
}

const OVERVIEW_SNAPSHOT_DEFINITION: SnapshotDefinition<OverviewPayload> = {
  key: "overview",
  cacheControl: "private, max-age=60, stale-while-revalidate=300",
  freshnessMs: 60_000,
  build: getOverview
};

async function loadOverviewSnapshot(prisma: PrismaClient) {
  const ttlSeconds = Math.ceil(OVERVIEW_SNAPSHOT_DEFINITION.freshnessMs / 1000);
  const snapshotDate = OVERVIEW_SNAPSHOT_DEFINITION.snapshotDate?.() ?? marketDayIso();
  const stored = await getStoredSnapshot<OverviewPayload>(prisma, OVERVIEW_SNAPSHOT_DEFINITION.key, snapshotDate, ttlSeconds);
  if (stored.record !== null) {
    return {
      record: stored.record,
      source: stored.source,
      freshnessMs: OVERVIEW_SNAPSHOT_DEFINITION.freshnessMs
    };
  }

  const record = await materializeSnapshot(prisma, OVERVIEW_SNAPSHOT_DEFINITION);
  return {
    record,
    source: "build" as const,
    freshnessMs: OVERVIEW_SNAPSHOT_DEFINITION.freshnessMs
  };
}

export async function getLeaderboard(prisma: PrismaClient, limit: number) {
  const overviewSnapshot = await loadOverviewSnapshot(prisma);
  const overview = overviewSnapshot.record.payload;
  const all = overview.sectors.flatMap((s) => s.stocks).sort((a, b) => b.changePct - a.changePct);
  const safeLimit = Math.max(1, Math.min(200, Math.trunc(limit) || 20));
  const ageMs = Date.now() - new Date(overviewSnapshot.record.generatedAt).getTime();
  return {
    asOf: overview.asOf,
    snapshot: {
      key: overviewSnapshot.record.snapshotKey,
      generatedAt: overviewSnapshot.record.generatedAt,
      source: overviewSnapshot.source,
      ageMs,
      fresh: ageMs <= overviewSnapshot.freshnessMs
    },
    items: all.slice(0, safeLimit),
    gainers: all.slice(0, safeLimit),
    losers: [...all].reverse().slice(0, safeLimit)
  };
}

export function registerOverview(app: Express, prisma: PrismaClient) {
  app.get("/v1/overview", async (req, res) => serveSnapshotRoute(req, res, prisma, OVERVIEW_SNAPSHOT_DEFINITION));

  app.get("/v1/leaderboard", async (req, res) => {
    const limit = Number(req.query.limit ?? 20);
    try {
      const payload = await getLeaderboard(prisma, limit);
      res.setHeader("Cache-Control", OVERVIEW_SNAPSHOT_DEFINITION.cacheControl);
      res.setHeader("X-Snapshot-Key", payload.snapshot.key);
      res.setHeader("X-Snapshot-Generated-At", payload.snapshot.generatedAt);
      res.setHeader("X-Snapshot-Source", payload.snapshot.source);
      res.setHeader("X-Snapshot-Age-Sec", String(Math.max(0, Math.floor(payload.snapshot.ageMs / 1000))));
      res.setHeader("X-Snapshot-Status", payload.snapshot.fresh ? "hit" : "stale");
      return res.json(payload);
    } catch (err) {
      return res.status(500).json({
        error: {
          code: "LEADERBOARD_FAILED",
          message: err instanceof Error ? err.message : "Unable to build leaderboard"
        }
      });
    }
  });
}
