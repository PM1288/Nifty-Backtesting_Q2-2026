# SmartAPI rate-safe data archive

Status: implemented for paper/research use. No broker order route is added or enabled.

## Architecture

`collector` remains the only SmartAPI client for the configured client code. It owns login/session refresh, the three-connection WebSocket manager and all REST scheduling. Dashboards, OIIS, F&O volatility research and paper trading consume PostgreSQL; they do not call SmartAPI independently.

The archive is downstream of existing market feeds:

1. WebSocket ticks are decoded once.
2. Operational latest state and one-minute bars continue unchanged.
3. A per-token sampler copies at most one raw tick per configured interval into a bounded, non-blocking channel.
4. Batched PostgreSQL writes persist raw fields without slowing the live feed. Dropped archive samples are counted in `websocket_health`.
5. REST `FULL` quotes remain a rotating snapshot/recovery path, limited to 50 tokens per request and the existing one-request-per-second shared limiter.
6. Option-chain snapshots are database joins over data already captured by WebSocket/REST and therefore make no additional quote request.
7. Option Greeks calls are coalesced by underlying/expiry and extended only to the latest F&O volatility shortlist.

The gateway has no order-placement implementation. `smartapi.disable_live_orders` remains mandatory and true in the deployed configuration.

## PostgreSQL contract

Migration `025_smartapi_archive` is additive. Existing tables and history are not renamed or deleted.

| Table/view | Purpose |
|---|---|
| `public.instrument_master_snapshot` | Permanent daily token, contract, expiry, strike, lot, tick-size and CAS eligibility snapshot with source hash and original JSON. |
| `public.market_ticks` | Partitioned sampled WebSocket payload archive: exchange/receive timestamps, connection, sequence, mode, OHLC, LTP, volume, OI, depth totals, circuits, 52-week values and raw packet. |
| `public.depth_5_snapshots` | Existing best-five levels, extended with cumulative quantity and notional. |
| `public.depth_5_metrics` | Partitioned midpoint, spread, percentage spread, bid/ask top-five notional, imbalance and microprice. |
| `public.smartapi_option_chain_snapshots` | Partitioned internal chain joining contract plan, spot/future, executable bid/ask, spread, volume, OI, depth and broker/local Greeks. This distinct name preserves the pre-existing raw `option_chain_snapshots` table. |
| `public.websocket_health` | Connection-level tick count, last tick, sequence gaps and archive overflow count. |
| `public.api_request_log` | Existing endpoint audit, extended with retry count, cache-hit and API error-code fields. |
| `public.v_latest_option_chain` | Latest archived row per contract. |

Existing `quote_snapshots` gains `reference_limit_price` and `session_phase`; `instruments` gains `is_cas_enabled`.

## Session phases

The collector stores `PREOPEN`, `REGULAR`, `CAS_REFERENCE`, `CAS_ORDER_ENTRY`, `CAS_RANDOM_CLOSE`, `CAS_MATCHING`, `CAS_TRANSITION`, `POST_CLOSE`, `FNO_EXTENDED` or `CLOSED`. NFO/BFO collection remains open through 15:40 IST. Cash CAS data is separated from continuous-session data and is never silently blended into a regular-session label.

## Rate and capacity controls

| Surface | Collector policy |
|---|---|
| REST `FULL` quote | One shared adaptive bucket, one request per second, at most 50 instruments/request. Used only for snapshots/recovery. |
| WebSocket | Maximum 3 connections and 1,000 token-mode subscriptions/connection. One mode per token. |
| Broad market | Equities/indices/futures use the configured streaming mode. |
| Options | Dynamic `SNAP_QUOTE`; top candidates and current contract plan receive priority. |
| Historical candles | Existing low-priority queue and rolling limits; never competes directly with live quote work. |
| Greeks | One coalesced underlying-expiry request schedule; dynamic shortlist defaults to 20 underlyings. |
| PostgreSQL archive | One sample/token/second by default, 32,768 bounded channel, batches of 1,000. Overflow never blocks market ingestion and is recorded. |

The raw archive sampling cadence is deliberately configurable. A zero cadence records every received update but must only be enabled after a database-capacity test.

## Derived data

Depth calculations use all available best-five levels:

`imbalance = (sum_bid_qty - sum_ask_qty) / (sum_bid_qty + sum_ask_qty)`

`microprice = (ask * level1_bid_qty + bid * level1_ask_qty) / (level1_bid_qty + level1_ask_qty)`

The option archive calculates local implied volatility and delta/gamma/theta/vega with a bounded Black-76 solver using the executable midpoint and current future (spot fallback). Broker and local values are stored separately. Invalid or missing quotes do not receive invented Greeks. The risk-free-rate assumption is versioned in configuration (`archive.local_greek_risk_free_rate`, default 0.06).

## Data quality and recovery

- Exchange sequence numbers and receive timestamps are stored and sequence gaps counted.
- Quotes carry `source_quote_ts`, age and `FULL`, `QUOTE_STALE`, `QUOTE_MISSING` or `TWO_SIDED_QUOTE_MISSING` status.
- Missing data remains null; it is never converted to zero.
- REST recovery uses the same central rate queue.
- Daily instrument snapshots make expired-token identity reconstructable after SmartAPI removes the contract.
- Existing one-minute bar backfill remains responsible for candle gaps. Historical best-five data cannot be recovered from SmartAPI; it must be captured while live.

## Configuration

```yaml
runtime:
  trading_end: "15:40"
ws:
  depth_snapshot_kinds: ["EQUITY", "INDEX", "FUT", "OPTIDX", "OPTSTK"]
archive:
  enable: true
  enable_market_ticks: true
  tick_sample_milliseconds: 1000
  tick_buffer_size: 32768
  tick_batch_size: 1000
  enable_instrument_snapshots: true
  enable_option_chain_snapshots: true
  option_chain_interval_seconds: 300
  enable_websocket_health: true
  websocket_health_interval_seconds: 60
  dynamic_greeks_shortlist_size: 20
  local_greek_risk_free_rate: 0.06
```

## Verification queries

```sql
SELECT version, applied_at FROM public.schema_migrations
WHERE version = '025_smartapi_archive';

SELECT snapshot_date, count(*) AS instruments
FROM public.instrument_master_snapshot GROUP BY snapshot_date ORDER BY snapshot_date DESC;

SELECT date_trunc('minute', exchange_ts), count(*)
FROM public.market_ticks GROUP BY 1 ORDER BY 1 DESC LIMIT 20;

SELECT * FROM public.websocket_health ORDER BY ts DESC LIMIT 20;

SELECT underlying, expiry, count(*), max(ts)
FROM public.smartapi_option_chain_snapshots GROUP BY underlying, expiry ORDER BY max(ts) DESC;

SELECT endpoint, count(*), count(*) FILTER (WHERE throttled), max(retry_count)
FROM public.api_request_log WHERE ts > now() - interval '1 day' GROUP BY endpoint;
```

## Official references

- SmartAPI quote batching/rate: <https://smartapi.angelone.in/smartapi/forum/topic/4056/live-market-data-api-quote-endpoint-enhanced-with-50-symbol-bulk-fetch-and-1-request-per-second-rate-limit>
- WebSocket implementation: <https://github.com/angel-one/smartapi-python/blob/main/SmartApi/smartWebSocketV2.py>
- Best-five depth/20-depth deprecation: <https://smartapi.angelone.in/smartapi/forum/topic/5217/deprecation-of-20-market-depth-from-websocket-2-0-effective-april-25-2025>
- Option Greeks: <https://smartapi.angelone.in/smartapi/forum/topic/4254/announcing-option-greeks-api-for-smartapi-users>
- Historical candles: <https://smartapi.angelone.in/smartapi/forum/topic/4012/release-note-free-historical-data-access-for-indices-nse-nfo-bse-bfo-mcx-and-cds-with-smartapi>
- CAS and 15:40 F&O close: <https://smartapi.angelone.in/smartapi/forum/topic/5633/closing-auction-session-cas-upcoming-changes-from-03-aug-2026>
- API rate table: <https://smartapi.angelone.in/smartapi/forum/topic/4387/changes-in-api-rate-limit>

## Known external limitations

SmartAPI does not provide a recoverable archive for expired derivatives, historical depth or historical option-chain/Greek surfaces. This implementation prevents future loss by collecting them now; it cannot fabricate missing history from before deployment. Full exchange market-by-order data and queue position are not available from best-five depth.
