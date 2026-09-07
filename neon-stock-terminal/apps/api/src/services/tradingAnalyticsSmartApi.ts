import {
  chainMetrics,
  nearestPairs,
  numeric,
  type Facts,
} from "./tradingAnalytics";
import { niftyUnderlying, type AnalyticsUnderlying } from './tradingAnalyticsUniverse';

export type EvidenceReader = (
  source: string,
  sql: string,
  ...args: unknown[]
) => Promise<Facts[]>;

export function observedOiChange(current: unknown, previous: unknown) {
  const a = numeric(current), b = numeric(previous);
  return a == null || b == null ? null : a - b;
}

// A common positive lot/unit multiplier cannot change the minimizing strike.
// This is an observed-window estimate, NOT a full-chain or INR payout claim.
export function windowMaxPain(legs: Facts[]) {
  const lot=numeric(legs[0]?.lotsize);
  const valid=lot!=null && lot>0 && legs.length>0 && legs.every(l=>numeric(l.lotsize)===lot
    && numeric(l.open_interest)!=null && numeric(l.open_interest)!>=0);
  const total=legs.reduce((sum,l)=>sum+(numeric(l.open_interest)??0),0);
  const estimate=valid && total>0 ? chainMetrics(legs.map(l=>({...l,oi_units:l.open_interest}))).maxPainStrikes : [];
  return { indicativeMaxPainStrikes:estimate, maxPainState:estimate.length?'INDICATIVE_PAIRED_WINDOW_COMMON_UNIT_ASSUMPTION':'DATA_INSUFFICIENT',
    maxPainScope:'Retained paired strikes only; assumes common provider OI units and equal lot size; not full-chain max pain or verified rupee payout.' };
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
  underlying: AnalyticsUnderlying = niftyUnderlying,
) {
  const [spotRows, expiries, calendar] = await Promise.all([
    read(
      "smartapi_spot",
      `SELECT ltp::float8,ts,exch_feed_time FROM public.quote_snapshots WHERE exchange='NSE' AND symbol_token=$2 AND ts BETWEEN $1::timestamptz-interval '7 days' AND $1::timestamptz AND exch_feed_time<=$1::timestamptz ORDER BY ts DESC LIMIT 1`,
      asOf,
      underlying.token,
    ),
    read(
      "smartapi_expiries",
      `SELECT DISTINCT expiry::text expiry FROM public.instruments WHERE exchange='NFO' AND name=$2 AND instrumenttype=$3 AND expiry>=($1::timestamptz AT TIME ZONE 'Asia/Kolkata')::date AND updated_at<=$1::timestamptz ORDER BY expiry LIMIT 12`,
      asOf,
      underlying.symbol,underlying.optionType,
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
    SELECT strike FROM public.instruments WHERE exchange='NFO' AND name=$4 AND instrumenttype=$5 AND expiry=$2::date AND updated_at<=$1::timestamptz
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
    WHERE i.exchange='NFO' AND i.name=$4 AND i.instrumenttype=$5 AND i.expiry=$2::date AND i.updated_at<=$1::timestamptz
    ORDER BY i.strike,option_type`,
          asOf,
          expiry,
          spot,
          underlying.symbol,underlying.optionType,
        )
      : [];
  const greeks = expiry ? await read(
    "smartapi_greeks",
    `SELECT DISTINCT ON (strike,"right") strike::float8 strike,"right" option_type,ts greeks_collected_at,underlying greeks_underlying,tradingsymbol greeks_source_symbol,iv::float8 implied_volatility,delta::float8,gamma::float8,theta::float8,vega::float8 FROM public.option_greeks WHERE underlying=ANY($3::text[]) AND expiry=$2::date AND ts BETWEEN $1::timestamptz-interval '1 day' AND $1::timestamptz ORDER BY strike,"right",ts DESC`,
    asOf, expiry, underlying.symbol==='NIFTY'?['NIFTY','NIFTY50']:[underlying.symbol],
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
  // The stock-option collector persists its own immutable chain cohort. Do not
  // stitch its rows into individually timed FULL quotes or invent a last price
  // from bid/ask midpoint. Use one whole cohort only when FULL OI is absent.
  const fallback = expiry && (!paired.legs.length || paired.legs.some(l=>numeric(l.open_interest)==null))
    ? await read('smartapi_stock_chain', `SELECT ts collected_at,source_quote_ts exchange_feed_at,
      underlying,expiry::text,symbol_token,tradingsymbol instrument_identifier,strike::float8 strike,"right" option_type,lotsize,
      spot_price::float8,oi::text open_interest,volume::text total_traded_volume,
      bid::float8 bid_price,ask::float8 ask_price,midpoint::float8 indicative_midpoint,
      broker_iv::float8 implied_volatility,broker_delta::float8 delta,broker_gamma::float8 gamma,
      broker_theta::float8 theta,broker_vega::float8 vega,quote_age_seconds,data_quality_status,
      NULL::float8 last_price,NULL::float8 previous_snapshot_delta,
      'smartapi_option_chain_snapshots'::text source
      FROM public.smartapi_option_chain_snapshots
      WHERE underlying=$2 AND expiry=$3::date AND ts=(SELECT max(ts) FROM public.smartapi_option_chain_snapshots
        WHERE underlying=$2 AND expiry=$3::date AND ts BETWEEN $1::timestamptz-interval '7 days' AND $1::timestamptz)
      AND (source_quote_ts IS NULL OR source_quote_ts<=$1::timestamptz) ORDER BY strike,"right"`,asOf,underlying.symbol,expiry)
    : [];
  const fallbackSpot=numeric(fallback[0]?.spot_price);
  const cohort=fallback.length && fallbackSpot!=null ? nearestPairs(fallback.map(r=>({...r,
    quote_state:smartApiQuoteState(r,asOf,calendar[0]?.market_close_ts),oi_unit:'PROVIDER_NATIVE_UNVERIFIED'})),fallbackSpot):paired;
  const hasCohort=fallback.length>0 && fallbackSpot!=null;
  const useCohortQuotes=hasCohort && !paired.legs.some(l=>numeric(l.open_interest)!=null);
  const chosen=useCohortQuotes?cohort:paired;
  const selectedSource=useCohortQuotes?'smartapi_option_chain_snapshots':'smartapi';
  // Preserve partial FULL quote evidence, but never fill missing legs from a
  // different observation. A complete fallback cohort gets its own metric scope.
  const metricWindow=hasCohort?cohort:chosen;
  return {
    source: selectedSource,
    asOf,
    expiry: expiry || null,
    expiries: expiries.map((r) => r.expiry),
    spot: spotRows[0] ?? (fallbackSpot!=null?{ltp:fallbackSpot,ts:fallback[0].collected_at,source:'chain_underlying_reference'}:null),
    legs: chosen.legs,
    strikes: chosen.strikes,
    shortfall: chosen.shortfall,
    metrics: {...chainMetrics(metricWindow.legs),...windowMaxPain(metricWindow.legs),
      source:hasCohort?'smartapi_option_chain_snapshots':selectedSource,
      strikes:metricWindow.strikes,
      collectedAt:hasCohort?fallback[0].collected_at:null},
    metricLegs:metricWindow.legs,
    fallbackNote: selectedSource==='smartapi_option_chain_snapshots'?'One retained stock-chain cohort; midpoint is not LTP; missing prior OI change remains null.':null,
    note: "Existing collector FULL quotes, individually timestamped; not an atomic chain snapshot. OI uses provider-native units, not verified lots/contracts. Prior snapshot ΔOI = current OI minus the immediately preceding retained quote for the same token; not day change. Provider day ΔOI is unavailable in FULL quotes. Option Delta is a Greek, not ΔOI; Greeks match underlying/expiry/strike/right and carry their own collection time, not verified exchange freshness. Missing is never zero. FII/DII cash is a separate NSE report.",
  };
}
