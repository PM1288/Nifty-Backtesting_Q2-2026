import {
  chainMetrics,
  nearestPairs,
  numeric,
  type Facts,
} from "./tradingAnalytics";

export type EvidenceReader = (
  source: string,
  sql: string,
  ...args: unknown[]
) => Promise<Facts[]>;

export function smartApiQuoteState(
  row: Facts,
  asOf: string,
  close: unknown,
): string {
  const feed =
    row.exchange_feed_at == null
      ? NaN
      : Date.parse(String(row.exchange_feed_at));
  const now = Date.parse(asOf);
  if (!Number.isFinite(feed)) return "EXCHANGE_TIME_UNAVAILABLE";
  if (feed > now) return "INVALID_FUTURE_TIMESTAMP";
  const end = close == null ? NaN : Date.parse(String(close));
  if (
    Number.isFinite(end) &&
    now >= end &&
    feed >= end - 60000 &&
    feed <= end + 60000
  )
    return "SESSION_CLOSED_LAST_QUOTE";
  return now - feed > 60000 ? "STALE" : "OBSERVED";
}

// Reuse the sole collector's durable FULL quote requests; never create another broker session.
export async function loadSmartApiNifty(
  read: EvidenceReader,
  asOf: string,
  requestedExpiry?: string,
) {
  const [spotRows, expiries, calendar] = await Promise.all([
    read(
      "smartapi_spot",
      `SELECT ltp::float8,ts,exch_feed_time FROM public.quote_snapshots WHERE exchange='NSE' AND symbol_token='99926000' AND ts BETWEEN $1::timestamptz-interval '7 days' AND $1::timestamptz ORDER BY ts DESC LIMIT 1`,
      asOf,
    ),
    read(
      "smartapi_expiries",
      `SELECT DISTINCT expiry::text expiry FROM public.instruments WHERE exchange='NFO' AND name='NIFTY' AND instrumenttype='OPTIDX' AND expiry>=($1::timestamptz AT TIME ZONE 'Asia/Kolkata')::date AND updated_at<=$1::timestamptz ORDER BY expiry LIMIT 12`,
      asOf,
    ),
    read(
      "smartapi_calendar",
      `SELECT market_close_ts FROM public.trading_calendar WHERE trade_date=($1::timestamptz AT TIME ZONE 'Asia/Kolkata')::date AND is_trading_day`,
      asOf,
    ),
  ]);
  const spot = numeric(spotRows[0]?.ltp);
  const expiry = requestedExpiry ?? String(expiries[0]?.expiry ?? "");
  const contracts =
    expiry && spot != null
      ? await read(
          "smartapi_contracts",
          `WITH strikes AS (
    SELECT strike FROM public.instruments WHERE exchange='NFO' AND name='NIFTY' AND instrumenttype='OPTIDX' AND expiry=$2::date AND updated_at<=$1::timestamptz
    GROUP BY strike HAVING count(DISTINCT right(tradingsymbol,2))=2 ORDER BY abs(strike-$3::numeric),strike LIMIT 10
  ) SELECT i.symbol_token,i.tradingsymbol instrument_identifier,i.strike::float8 strike,right(i.tradingsymbol,2) option_type,i.lotsize,
    q.ts collected_at,q.exch_feed_time exchange_feed_at,q.exch_trade_time exchange_trade_at,q.ltp::float8 last_price,
    q.oi::text open_interest,q.volume::text total_traded_volume,q.bid::float8 bid_price,q.ask::float8 ask_price,q.bid_qty::text bid_qty,q.ask_qty::text ask_qty,
    q.open::float8 day_open,q.high::float8 day_high,q.low::float8 day_low,q.close::float8 previous_close,
    q.total_buy_qty::text total_buy_qty,q.total_sell_qty::text total_sell_qty,q.raw
    FROM public.instruments i JOIN strikes s USING(strike)
    LEFT JOIN LATERAL (SELECT * FROM public.quote_snapshots q WHERE q.exchange=i.exchange AND q.symbol_token=i.symbol_token AND q.ts BETWEEN $1::timestamptz-interval '1 day' AND $1::timestamptz ORDER BY q.ts DESC LIMIT 1) q ON true
    WHERE i.exchange='NFO' AND i.name='NIFTY' AND i.instrumenttype='OPTIDX' AND i.expiry=$2::date AND i.updated_at<=$1::timestamptz
    ORDER BY i.strike,option_type`,
          asOf,
          expiry,
          spot,
        )
      : [];
  const rows = contracts.map((r) => ({
    ...r,
    quote_state: smartApiQuoteState(r, asOf, calendar[0]?.market_close_ts),
    source: "smartapi",
    oi_unit: "PROVIDER_NATIVE_UNVERIFIED",
    change_in_oi: null,
  }));
  const paired =
    spot == null
      ? { legs: [], strikes: [], shortfall: 10 }
      : nearestPairs(rows, spot);
  return {
    source: "smartapi",
    asOf,
    expiry: expiry || null,
    expiries: expiries.map((r) => r.expiry),
    spot: spotRows[0] ?? null,
    legs: paired.legs,
    strikes: paired.strikes,
    shortfall: paired.shortfall,
    metrics: chainMetrics(paired.legs),
    note: "Existing collector FULL quotes, individually timestamped; not an atomic exchange-chain snapshot. After-close collection does not make prices live. OI is provider-native, not normalized lots/contracts. FII participant OI is a separate NSE report. Day change in OI is unavailable from this quote payload.",
  };
}
