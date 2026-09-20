import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { deriveScalperOiHistory, type OptionOiBaseline, type RawOptionOiObservation, type SpotObservation } from "../services/scalperOiHistory";

type Row = Record<string, unknown>;

function argument(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? null;
}

function requiredDay(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Use --date=YYYY-MM-DD.");
  return value;
}

function number(value: unknown) {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function main() {
  const tradeDate = requiredDay(argument("date"));
  const symbol = (argument("symbol") ?? "NIFTY").toUpperCase();
  const strikesAround = Math.max(0, Math.min(20, Number(argument("strikes-around") ?? 6)));
  const prisma = new PrismaClient();
  try {
    const sessions = await prisma.$queryRawUnsafe<Row[]>(
      `SELECT trade_date::text,market_open_ts,market_close_ts
       FROM public.trading_calendar WHERE trade_date=$1::date AND is_trading_day`, tradeDate,
    );
    const session = sessions[0];
    if (!session) throw new Error(`No trading-calendar session for ${tradeDate}.`);
    const sessionOpen = new Date(String(session.market_open_ts));
    const sessionClose = new Date(String(session.market_close_ts));

    const expiryInput = argument("expiry");
    const expiryRows = await prisma.$queryRawUnsafe<Row[]>(
      `SELECT DISTINCT expiry::text
       FROM public.instruments
       WHERE exchange='NFO' AND name=$1 AND instrumenttype='OPTIDX'
         AND expiry>= $2::date AND ($3::date IS NULL OR expiry=$3::date)
       ORDER BY expiry LIMIT 1`, symbol, tradeDate, expiryInput,
    );
    const expiry = expiryRows[0]?.expiry == null ? null : String(expiryRows[0].expiry);
    if (!expiry) throw new Error(`No OPTIDX expiry found for ${symbol} on ${tradeDate}.`);

    const native = await prisma.$queryRawUnsafe<Row[]>(
      `SELECT count(*)::int count FROM public.option_chain_snapshots
       WHERE symbol=$1 AND expiry_date=$2::date
         AND (captured_at AT TIME ZONE 'Asia/Kolkata')::date=$3::date`, symbol, expiry, tradeDate,
    );
    if (Number(native[0]?.count ?? 0) > 0) {
      console.info(JSON.stringify({ event: "scalper_oi_history_native_session_present", symbol, expiry, tradeDate, state: "SKIPPED" }));
      return;
    }

    const [rawObservations, rawBaselines, rawSpots] = await Promise.all([
      prisma.$queryRawUnsafe<Row[]>(
        `SELECT extract(epoch FROM q.ts)*1000 captured_at_ms,q.symbol_token token,
                i.strike::float8 strike,
                CASE WHEN i.tradingsymbol LIKE '%CE' THEN 'CE' ELSE 'PE' END side,
                q.oi::text oi_underlying_units,i.lotsize
         FROM public.quote_snapshots q
         JOIN public.instruments i ON i.exchange=q.exchange AND i.symbol_token=q.symbol_token
         WHERE q.exchange='NFO' AND i.name=$1 AND i.instrumenttype='OPTIDX' AND i.expiry=$2::date
           AND (i.tradingsymbol LIKE '%CE' OR i.tradingsymbol LIKE '%PE')
           AND q.ts BETWEEN $3::timestamptz AND $4::timestamptz
           AND q.exch_feed_time BETWEEN $3::timestamptz AND $4::timestamptz
           AND q.oi IS NOT NULL ORDER BY q.ts`, symbol, expiry, sessionOpen.toISOString(), sessionClose.toISOString(),
      ),
      prisma.$queryRawUnsafe<Row[]>(
        `SELECT DISTINCT ON (q.symbol_token) q.symbol_token token,q.oi::text oi_underlying_units,i.lotsize
         FROM public.quote_snapshots q
         JOIN public.instruments i ON i.exchange=q.exchange AND i.symbol_token=q.symbol_token
         WHERE q.exchange='NFO' AND i.name=$1 AND i.instrumenttype='OPTIDX' AND i.expiry=$2::date
           AND (i.tradingsymbol LIKE '%CE' OR i.tradingsymbol LIKE '%PE')
           AND q.ts<$3::timestamptz AND q.ts>=$3::timestamptz-interval '7 days' AND q.oi IS NOT NULL
         ORDER BY q.symbol_token,q.ts DESC`, symbol, expiry, sessionOpen.toISOString(),
      ),
      prisma.$queryRawUnsafe<Row[]>(
        `SELECT extract(epoch FROM q.ts)*1000 captured_at_ms,q.ltp::float8 value
         FROM public.quote_snapshots q
         JOIN public.instruments i ON i.exchange=q.exchange AND i.symbol_token=q.symbol_token
         WHERE q.exchange='NSE' AND i.name=$1 AND i.instrumenttype='AMXIDX'
           AND q.ts BETWEEN $2::timestamptz AND $3::timestamptz AND q.ltp IS NOT NULL
         ORDER BY q.ts`, symbol, sessionOpen.toISOString(), sessionClose.toISOString(),
      ),
    ]);

    const observations = rawObservations.map((row): RawOptionOiObservation => ({
      capturedAtMs: Number(row.captured_at_ms), token: String(row.token), strike: Number(row.strike), side: String(row.side) as "CE" | "PE",
      oiUnderlyingUnits: number(row.oi_underlying_units), lotSize: number(row.lotsize),
    }));
    const baselines = rawBaselines.map((row): OptionOiBaseline => ({
      token: String(row.token), oiUnderlyingUnits: number(row.oi_underlying_units), lotSize: number(row.lotsize),
    }));
    const spots = rawSpots.map((row): SpotObservation => ({ capturedAtMs: Number(row.captured_at_ms), value: Number(row.value) }));
    if (observations.length === 0 || spots.length === 0) throw new Error(`No usable retained SmartAPI observations for ${symbol} ${expiry} on ${tradeDate}.`);

    const bucketEndsMs: number[] = [];
    for (let value = sessionOpen.getTime() + 5 * 60_000; value <= sessionClose.getTime(); value += 5 * 60_000) bucketEndsMs.push(value);
    const points = deriveScalperOiHistory({ observations, baselines, spots, bucketEndsMs, strikesAround });
    const payload = points.map((point) => ({
      symbol, expiry_date: expiry, trade_date: tradeDate, captured_at: point.capturedAt,
      source: "smartapi_quote_backfill_v1", baseline_kind: "PRE_SESSION_LAST_CAPTURE", unit: "contracts", strikes_around: strikesAround,
      strike_count: point.strikeCount, ce_contract_count: point.ceContractCount, ce_observed_count: point.ceObservedCount,
      ce_oi: point.ceOi, pe_contract_count: point.peContractCount, pe_observed_count: point.peObservedCount, pe_oi: point.peOi,
      ce_change_observed_count: point.ceChangeObservedCount, ce_change_oi: point.ceChangeOi,
      pe_change_observed_count: point.peChangeObservedCount, pe_change_oi: point.peChangeOi,
      cohort: point.cohort, quality: { ...point.quality, bucketMinutes: 5, rawObservationCount: observations.length },
    }));
    await prisma.$executeRawUnsafe(
      `INSERT INTO public.scalper_oi_history (
         symbol,expiry_date,trade_date,captured_at,source,baseline_kind,unit,strikes_around,strike_count,
         ce_contract_count,ce_observed_count,ce_oi,pe_contract_count,pe_observed_count,pe_oi,
         ce_change_observed_count,ce_change_oi,pe_change_observed_count,pe_change_oi,cohort,quality
       ) SELECT symbol,expiry_date::date,trade_date::date,captured_at::timestamptz,source,baseline_kind,unit,strikes_around,strike_count,
                ce_contract_count,ce_observed_count,ce_oi,pe_contract_count,pe_observed_count,pe_oi,
                ce_change_observed_count,ce_change_oi,pe_change_observed_count,pe_change_oi,cohort,quality
         FROM jsonb_to_recordset($1::jsonb) AS row(
           symbol text,expiry_date text,trade_date text,captured_at text,source text,baseline_kind text,unit text,strikes_around int,strike_count int,
           ce_contract_count int,ce_observed_count int,ce_oi bigint,pe_contract_count int,pe_observed_count int,pe_oi bigint,
           ce_change_observed_count int,ce_change_oi bigint,pe_change_observed_count int,pe_change_oi bigint,cohort jsonb,quality jsonb)
       ON CONFLICT (symbol,expiry_date,captured_at,source) DO UPDATE SET
         strike_count=excluded.strike_count,ce_contract_count=excluded.ce_contract_count,ce_observed_count=excluded.ce_observed_count,
         ce_oi=excluded.ce_oi,pe_contract_count=excluded.pe_contract_count,pe_observed_count=excluded.pe_observed_count,pe_oi=excluded.pe_oi,
         ce_change_observed_count=excluded.ce_change_observed_count,ce_change_oi=excluded.ce_change_oi,
         pe_change_observed_count=excluded.pe_change_observed_count,pe_change_oi=excluded.pe_change_oi,
         cohort=excluded.cohort,quality=excluded.quality,generated_at=now()`, JSON.stringify(payload),
    );
    console.info(JSON.stringify({
      event: "scalper_oi_history_materialized", symbol, expiry, tradeDate, points: points.length,
      completeOiPoints: points.filter((point) => point.ceOi != null && point.peOi != null).length,
      completeChangePoints: points.filter((point) => point.ceChangeOi != null && point.peChangeOi != null).length,
      rawObservations: observations.length, baselines: baselines.length, spotObservations: spots.length,
    }));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ event: "scalper_oi_history_materialize_failed", error: error instanceof Error ? error.message : String(error) }));
  process.exit(1);
});
