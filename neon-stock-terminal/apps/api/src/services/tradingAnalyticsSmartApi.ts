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

export function observedOiChange(current: unknown, previous: unknown) {
  const a = numeric(current), b = numeric(previous);
  return a == null || b == null ? null : a - b;
}

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
    q.total_buy_qty::text total_buy_qty,q.total_sell_qty::text total_sell_qty,q.raw,
    prev.oi::text previous_open_interest,prev.ts previous_collected_at,
    prev.exch_feed_time previous_exchange_feed_at
    FROM public.instruments i JOIN strikes s USING(strike)
    LEFT JOIN LATERAL (SELECT * FROM public.quote_snapshots q WHERE q.exchange=i.exchange AND q.symbol_token=i.symbol_token AND q.ts BETWEEN $1::timestamptz-interval '1 day' AND $1::timestamptz ORDER BY q.ts DESC LIMIT 1) q ON true
    LEFT JOIN LATERAL (SELECT p.oi,p.ts,p.exch_feed_time FROM public.quote_snapshots p WHERE p.exchange=i.exchange AND p.symbol_token=i.symbol_token AND p.ts<q.ts AND p.ts>=$1::timestamptz-interval '1 day' ORDER BY p.ts DESC LIMIT 1) prev ON true
    WHERE i.exchange='NFO' AND i.name='NIFTY' AND i.instrumenttype='OPTIDX' AND i.expiry=$2::date AND i.updated_at<=$1::timestamptz
    ORDER BY i.strike,option_type`,
          asOf,
          expiry,
          spot,
        )
      : [];
  const greeks = expiry ? await read(
    "smartapi_greeks",
    `SELECT DISTINCT ON (strike,"right") strike::float8 strike,"right" option_type,ts greeks_collected_at,underlying greeks_underlying,tradingsymbol greeks_source_symbol,iv::float8 implied_volatility,delta::float8,gamma::float8,theta::float8,vega::float8 FROM public.option_greeks WHERE underlying IN ('NIFTY','NIFTY50') AND expiry=$2::date AND ts BETWEEN $1::timestamptz-interval '1 day' AND $1::timestamptz ORDER BY strike,"right",ts DESC`,
    asOf, expiry,
  ) : [];
  const rows = contracts.map((r) => ({
    ...r,
    quote_state: smartApiQuoteState(r, asOf, calendar[0]?.market_close_ts),
    source: "smartapi",
    oi_unit: "PROVIDER_NATIVE_UNVERIFIED",
    change_in_oi: null,
    previous_snapshot_delta: observedOiChange(r.open_interest,r.previous_open_interest),
    ...(() => {
      const g = greeks.find(g => numeric(g.strike) === numeric(r.strike) && g.option_type === r.option_type);
      return {
        implied_volatility: g?.implied_volatility ?? null,
        delta: g?.delta ?? null, gamma: g?.gamma ?? null, theta: g?.theta ?? null, vega: g?.vega ?? null,
        greeks_collected_at: g?.greeks_collected_at ?? null,
        greeks_source_symbol: g?.greeks_source_symbol ?? null,
        greeks_state: g ? "RETAINED_OBSERVATION_EXCHANGE_TIME_UNVERIFIED" : "NO_MATCHING_RETAINED_GREEKS",
      };
    })(),
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
    note: "Existing collector FULL quotes, individually timestamped; not an atomic chain snapshot. OI uses provider-native units, not verified lots/contracts. Prior snapshot ΔOI = current OI minus the immediately preceding retained quote for the same token; not day change. Provider day ΔOI is unavailable in FULL quotes. Option Delta is a Greek, not ΔOI; Greeks match underlying/expiry/strike/right and carry their own collection time, not verified exchange freshness. Missing is never zero. FII/DII cash is a separate NSE report.",
  };
}
