import type { Express } from "express";
import type { PrismaClient } from "@prisma/client";

type Row = Record<string, any>;
export function observationState(seen: string | Date | null, open: string | Date | null, close: string | Date | null, now: number, streaming: boolean) {
  if (!open || !close) return "UNKNOWN_SESSION";
  if (!seen) return "MISSING";
  const timestamp = new Date(seen).getTime();
  if (!Number.isFinite(timestamp) || timestamp > now + 60_000) return "INVALID_TIME";
  if (timestamp < new Date(open).getTime()) return "OLDER_SESSION";
  if (now > new Date(close).getTime()) return "OBSERVED_SESSION";
  return now - timestamp <= (streaming ? 180_000 : 900_000) ? "RECENT" : "STALE";
}

// Small state tables and indexed metadata only: never scan raw ticks/depth.
export async function readDataHealth(prisma: PrismaClient) {
  const [sessions, instruments, days, requests] = await Promise.all([
    prisma.$queryRawUnsafe<Row[]>(`SELECT trade_date::text,market_open_ts,market_close_ts FROM trading_calendar
      WHERE is_trading_day AND market_open_ts<=now() ORDER BY trade_date DESC LIMIT 1`),
    prisma.$queryRawUnsafe<Row[]>(`WITH universe AS (
      SELECT exchange,symbol_token,tradingsymbol,underlying,kind,expiry,strike,"right",true streaming,NULL::date plan_date
      FROM subscriptions WHERE active
      UNION ALL
      SELECT exchange,symbol_token,tradingsymbol,underlying,contract_kind,expiry,strike,"right",false,plan_date
      FROM derivative_token_plan WHERE plan_name='NIFTY250_STOCK_DERIVATIVES'
        AND plan_date=(SELECT max(plan_date) FROM derivative_token_plan WHERE plan_name='NIFTY250_STOCK_DERIVATIVES')
    ), distinct_instruments AS (
      SELECT DISTINCT ON (exchange,symbol_token) * FROM universe ORDER BY exchange,symbol_token,streaming DESC
    ) SELECT u.*,u.expiry::text expiry,u.plan_date::text plan_date,i.last_seen_ts,i.updated_at,i.last_source,
      i.last_price::float8 price,i.last_oi::text oi,i.last_volume::text volume
      FROM distinct_instruments u LEFT JOIN instrument_state i USING(exchange,symbol_token)
      ORDER BY u.underlying,u.tradingsymbol`),
    prisma.$queryRawUnsafe<Row[]>(`WITH latest AS (
      SELECT DISTINCT ON (source_date,report_name) source_date,report_name,status
      FROM nse.ingest_run_reports WHERE source_date>=CURRENT_DATE-30
      ORDER BY source_date,report_name,started_at DESC,run_report_id DESC
    ), retained AS (
      SELECT source_date,report_name,bool_or(lower(load_status)='loaded') parsed,
        bool_or(lower(load_status) IN ('loaded','archived')) retained,sum(bytes)::float8 bytes
      FROM nse.file_registry WHERE source_date>=CURRENT_DATE-30 GROUP BY 1,2
    ), daily AS (SELECT l.source_date,count(*)::int attempted,
      count(*) FILTER(WHERE r.parsed)::int parsed,
      count(*) FILTER(WHERE r.retained AND NOT r.parsed)::int archived,
      count(*) FILTER(WHERE NOT COALESCE(r.retained,false))::int unavailable,
      count(*) FILTER(WHERE upper(l.status) NOT IN ('LOADED','REUSED','SKIPPED','ARCHIVED'))::int retry_issues,
      sum(r.bytes)::float8 bytes FROM latest l LEFT JOIN retained r USING(source_date,report_name)
      GROUP BY l.source_date)
    SELECT c.trade_date::text AS day,c.is_trading_day,d.attempted,d.parsed,d.archived,d.unavailable,d.retry_issues,d.bytes
    FROM trading_calendar c LEFT JOIN daily d ON d.source_date=c.trade_date
    WHERE c.trade_date>=CURRENT_DATE-30 AND c.market_open_ts<=now()
    ORDER BY c.trade_date DESC LIMIT 31`),
    prisma.$queryRawUnsafe<Row[]>(`SELECT name,count(*)::int requests,count(*) FILTER(WHERE NOT success)::int failed,
      count(*) FILTER(WHERE throttled)::int throttled,round(avg(latency_ms))::int latency_ms,max(ts) last_at
      FROM api_request_log WHERE ts>=now()-interval '24 hours' GROUP BY name ORDER BY name`),
  ]);
  const now = Date.now();
  const session = sessions[0] ?? null;
  return { generatedAt: new Date(now).toISOString(), session,
    marketOpen: !!session && now <= new Date(session.market_close_ts).getTime(),
    scope: "Active subscriptions plus latest NIFTY250 stock-derivative plan; latest observations, not a completeness audit of every candle.",
    instruments: instruments.map(row => ({ ...row, state: observationState(row.last_seen_ts, session?.market_open_ts, session?.market_close_ts, now, row.streaming) })),
    days, requests };
}

export function registerDataHealth(app: Express, prisma: PrismaClient) {
  let cached: Awaited<ReturnType<typeof readDataHealth>> | undefined;
  let pending: ReturnType<typeof readDataHealth> | undefined;
  app.get("/v1/data-health", async (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      if (!cached || Date.now() - Date.parse(cached.generatedAt) > 30_000) {
        pending ??= readDataHealth(prisma).finally(() => { pending = undefined; });
        cached = await pending;
      }
      res.json(cached);
    } catch { res.status(503).json({ error: "Collection health unavailable. No healthy status can be confirmed." }); }
  });
}
