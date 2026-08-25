# NIFTY option data: SmartAPI versus the NSE option-chain watcher

**Document date:** 14 August 2026
**Repository:** `/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026`
**Deployment mirror:** `/home/novius2/trading-stack`
**Database:** PostgreSQL `tradingdb`
**Timezone:** storage timestamps are UTC; exchange-session interpretation is `Asia/Kolkata`

## 1. Executive answer

NIFTY option data arrives through two independent pipelines. They overlap, but they are not
interchangeable.

| Question | SmartAPI collector | NSE option-chain watcher |
|---|---|---|
| Provider | Angel One SmartAPI | NSE India option-chain JSON |
| Primary purpose | Broker-token quotes, OI, depth, instruments and broad derivatives archive | Canonical focused NIFTY weekly option-chain snapshot |
| Current NIFTY option coverage | 162 nearest-expiry NIFTY option tokens observed in the latest ten-minute window | ATM plus/minus six strikes: 13 strikes and 26 CE/PE legs |
| Expiry selection | Token/subscription and quote rotation plan | Nearest current expiry returned by NSE contract-info API |
| Update style | WebSocket latest state plus rate-safe REST snapshots | One NSE chain request approximately every 120 seconds |
| Session handling | Individual jobs carry session state; some REST OI/quote rows are still timestamped before regular open | Polling and persistence are now suppressed outside `trading_calendar` sessions |
| Unchanged rows | Depends on the SmartAPI table/job | Suppressed using an exchange-native fingerprint |
| Primary NIFTY weekly strategy use | Contract master, lot size and NIFTY daily price history | Chain quotes, OI, OI change, bid/ask, IV and strike evidence |
| Current authority | Supporting/corroborating broker feed | Canonical NIFTY weekly-chain source |

The NIFTY Weekly Options strategy does **not** silently average or overwrite one source with the
other. Every field retains provenance.

## 2. Current live evidence

The following was reconciled directly from the deployed PostgreSQL database on 14 August 2026.
These are observations, not hard-coded application values.

### 2.1 NSE watcher

| Observation | Value |
|---|---:|
| Retained valid NIFTY snapshots | 582 |
| Retained expiry dates | 2 |
| First retained snapshot | 2026-08-11 03:46:32.877 UTC |
| Latest retained snapshot | 2026-08-13 10:09:45.459 UTC |
| Latest expiry | 2026-08-18 |
| Latest underlying value | 24,395.85 |
| Latest ATM strike | 24,400 |
| Latest strikes / legs | 13 / 26 |
| CE / PE legs | 13 / 13 |
| OI present | 26 of 26 |
| OI change present | 26 of 26 |
| Bid and ask present | 26 of 26 |
| Invalid out-of-session snapshots after cleanup | 0 |

At inspection time the watcher health state was `SUPPRESSED / BEFORE_MARKET_OPEN`. This is healthy:
it means no NSE request or database insert occurs before the effective market open.

### 2.2 SmartAPI

| Observation | Value |
|---|---:|
| Active future-dated NIFTY `OPTIDX` master rows | 1,747 contracts |
| Expiries represented in current master | 18 |
| Nearest / furthest master expiry | 2026-08-18 / 2031-06-24 |
| Effective NIFTY option lot size | 65 |
| NIFTY tokens seen in latest ten-minute OI window | 162 |
| Latest NIFTY token strike span | 22,400 to 26,400 |
| Latest token expiry | 2026-08-18 |
| OI rows in that ten-minute window | 2,220 |
| OI values present | 2,220 |
| OI-change values present | 1,620 |
| Quote rows in the latest ten-minute window | 660 |
| Quote tokens represented | 162 |
| Bid / ask / volume / OI present in those quote rows | 660 / 660 / 660 / 660 |
| Latest PCR record | `NIFTY50`, expiry 2026-08-18, PCR approximately 0.75 |
| NIFTY rows in latest `smartapi_option_chain_snapshots` batch | 0 |

The final row matters: `public.smartapi_option_chain_snapshots` is presently generated from the
stock-derivative token plan and contained 187 stock underlyings in its latest batch. It is **not**
the canonical NIFTY index-option chain. NIFTY SmartAPI evidence exists instead in the lower-level
quote, OI, PCR, instrument-state and instrument-master tables.

The latest SmartAPI OI/quote timestamps observed during this review were before regular market open.
Those timestamps mean “collector observed/stored at this time”; they do not prove the exchange value
changed at that time. Consumers must use session phase, exchange timestamps and value-change checks
before calling these records current market movement.

## 3. SmartAPI NIFTY option pipeline

### 3.1 Flow

```text
SmartAPI instrument master
  -> public.instruments
  -> contract identity, expiry, strike, option right, lot size and tick size

SmartAPI WebSocket
  -> public.instrument_state
  -> latest LTP, OHLC, volume, OI, bid/ask, quantities and source time
  -> public.market_ticks
  -> public.depth_5_snapshots / public.depth_5_metrics

Central rate-safe SmartAPI REST FULL/SNAPQUOTE jobs
  -> public.quote_snapshots
  -> public.oi_snapshots_options
  -> public.pcr_snapshots
  -> public.option_greeks

Stock derivative token plan plus latest broker state
  -> public.smartapi_option_chain_snapshots
  -> stock F&O chains only in the current deployment, not NIFTY
```

No independent SmartAPI connection is created by the UI or by n8n. The collector owns broker
authentication, subscription planning and rate limits.

### 3.2 SmartAPI tables and fields

#### `public.instruments`

Contract master keyed by `(exchange, symbol_token)`.

Important option fields:

- `exchange`, normally `NFO` for NIFTY options;
- `symbol_token`;
- `tradingsymbol` and `name`;
- `instrumenttype`, with NIFTY options represented as `OPTIDX`;
- `expiry`;
- `strike`;
- `lotsize`;
- `tick_size`;
- original `raw` master object and `updated_at`.

This is the source used by the NIFTY Weekly Options strategy for the effective lot size. It is also
needed to map SmartAPI token rows back to strike, expiry and option right.

#### `public.instrument_state`

One mutable latest-state row per broker token.

Relevant fields:

- `last_seen_ts`, `last_source`, `updated_at`;
- `last_price`, open, high, low and close;
- `last_bid`, `last_ask`, `last_bid_qty`, `last_ask_qty`;
- `last_volume`, `last_oi`, `last_oi_change_pct`;
- `total_buy_qty`, `total_sell_qty`;
- `net_change`, `percent_change`.

This is operational latest state, not an immutable historical series.

#### `public.quote_snapshots`

Rate-safe broker quote archive.

Fields include:

- collection and exchange times: `ts`, `exch_feed_time`, `exch_trade_time`;
- identity: `exchange`, `symbol_token`;
- price: `ltp`, open, high, low, close, average and net/percentage change;
- activity: volume and last-trade quantity;
- derivatives: OI;
- best market: bid, ask, bid quantity and ask quantity;
- total buy/sell quantity;
- circuits and 52-week range;
- `session_phase` and original `raw` payload.

This table is the better SmartAPI source when price, volume, OI and best bid/ask must be evaluated
together at the same collection timestamp.

#### `public.oi_snapshots_options`

Partitioned option OI time series keyed by `(ts, exchange, symbol_token)`.

Fields:

- `ts`;
- `exchange`, `symbol_token`;
- `oi`;
- `oi_change`;
- `oi_change_pct`;
- complete broker `raw` response.

It contains NIFTY option rows. Join to `public.instruments` to recover expiry, strike, right, lot
size and trading symbol. Never interpret a token without its exchange and effective contract master.

#### `public.pcr_snapshots`

Expiry-level aggregate generated from collected SmartAPI option OI.

Fields:

- `ts`;
- `underlying`;
- `expiry`;
- `ce_oi`, `pe_oi`;
- `pcr = pe_oi / ce_oi`;
- audit `raw`.

The deployed configuration writes this approximately every five minutes. PCR quality depends on the
completeness of the option-token set accumulated for that expiry. A PCR row must therefore be shown
with its coverage/source timestamp rather than treated as an unconditional full-chain truth.

#### `public.depth_5_snapshots` and `public.depth_5_metrics`

Five-level SNAPQUOTE evidence where the subscription plan includes the contract.

Raw depth fields:

- side and level;
- price, quantity and order count;
- cumulative quantity and notional.

Derived metrics:

- best bid/ask;
- midpoint and spread;
- spread percentage;
- bid and ask notional across five levels;
- depth imbalance;
- microprice;
- session phase.

This is best-five market depth, not market-by-order queue data. It cannot reconstruct queue priority.

#### `public.option_greeks`

Broker option-Greek endpoint archive:

- underlying, expiry, strike and right;
- IV, delta, gamma, theta and vega;
- LTP and trade volume;
- original raw response.

The deployed job is configured for `NIFTY50` and `BANKNIFTY` every 60 seconds, but current NIFTY
coverage is sparse and rotating rather than a certified complete chain. `tradingsymbol` was blank in
the inspected NIFTY records. This dataset must not replace the NSE watcher or be presented as a
complete current NIFTY Greek surface until coverage validation passes.

#### `public.smartapi_option_chain_snapshots`

Derived five-minute option-chain archive assembled from existing broker state without making one
REST request per contract.

It contains:

- contract identity and lot size;
- spot and futures prices;
- bid, ask, midpoint and spread;
- volume, OI and OI-change percentage;
- total buy/sell quantity and depth imbalance;
- broker and locally calculated Greeks;
- quote age, source quote time, session phase and data-quality status.

Current deployment scope is stock `OPTSTK` contracts from the stock derivative token plan. The
latest batch contained zero NIFTY rows. Do not query this table expecting the NIFTY chain.

### 3.3 Configured SmartAPI cadence

| Job | Deployed configuration |
|---|---:|
| Option quote snapshots | enabled, 60 seconds, rotating maximum 500 tokens |
| Option OI snapshots | enabled, 60 seconds |
| PCR snapshots | enabled, 300 seconds |
| Broker option Greeks | enabled, 60 seconds for configured underlyings |
| Derived stock option-chain archive | enabled, 300 seconds |
| WebSocket instrument state | event-driven while connected/subscribed |

The configured interval is a target cadence, not proof of a fresh exchange update. Rate queues,
rotation, session state, subscription coverage and broker responses can change actual coverage.

## 4. NSE option-chain watcher pipeline

### 4.1 Flow

```text
public.trading_calendar
  -> validate trading day and effective open/close
  -> suppress request outside session

Playwright API request context
  -> warm NSE cookies at /option-chain
  -> GET /api/option-chain-contract-info?symbol=NIFTY
  -> select nearest current expiry
  -> GET /api/option-chain-v3?type=Indices&symbol=NIFTY&expiry=...

NSE response
  -> determine underlying and nearest ATM strike
  -> retain ATM plus/minus six strikes
  -> map CE and PE exchange fields
  -> calculate local Black-Scholes Greeks when IV is usable
  -> suppress unchanged exchange-native fingerprint
  -> public.option_chain_snapshots
  -> public.option_chain_legs
```

### 4.2 `public.option_chain_snapshots`

One header per stored chain state:

- `id`;
- `captured_at`;
- `symbol`, currently `NIFTY`;
- `expiry_date`;
- `underlying_value`;
- `atm_strike`;
- `strikes_around`, currently six;
- `source`, currently `nseindia`;
- request `fetch_ms`;
- optional `raw` JSON, disabled in the deployed configuration.

### 4.3 `public.option_chain_legs`

One CE or PE record per selected strike and snapshot:

- `snapshot_id`;
- `strike`, `option_type`;
- `last_price`, price `change`;
- exchange `implied_volatility`;
- `total_traded_volume`;
- `open_interest`, `change_in_oi`;
- best `bid_qty`, `bid_price`, `ask_qty`, `ask_price`;
- NSE `instrument_identifier`;
- locally calculated `delta`, `gamma`, `theta`, `vega`.

The local Greeks are calculated from the stored NSE underlying, strike, time to expiry, IV and the
configured risk-free/dividend assumptions. They are derived values, not exchange-supplied Greeks.

### 4.4 Persistence and cadence

Deployed watcher settings:

| Setting | Value |
|---|---:|
| Symbol | NIFTY |
| Poll interval | 120,000 ms |
| Strikes around ATM | 6 |
| Raw response retention | disabled |
| Risk-free rate for local Greeks | 0.06 |
| Dividend yield | 0 |
| Minimum cleanup retention | 14 days |
| Session source | `public.trading_calendar` |

Persistence rules:

1. No NSE call before open, after close, on holidays or when session times are unavailable.
2. During a valid session, fetch approximately every two minutes.
3. Do not insert when underlying, expiry, prices, IV, volume, OI, OI change and bid/ask depth are
   unchanged.
4. Capture time, raw-response metadata and locally decaying Greeks do not independently create a
   history row.
5. A genuine quote, volume, OI, OI-change or depth change creates a new immutable snapshot.

### 4.5 Watcher APIs

Through the deployed ingress:

| Endpoint | Purpose |
|---|---|
| `/option-chain/healthz` | Liveness plus session/suppression counters |
| `/option-chain/readyz` | Database readiness plus watcher state |
| `/option-chain/api/latest` | Latest snapshot and all selected legs |
| `/option-chain/api/latest?compareMinutes=10` | Latest plus nearest stored comparison snapshot |
| `/option-chain/api/series?minutes=120` | Bounded ATM time series |
| `/option-chain/api/analytics` | Expiry/ATM context, normalized CE/PE equilibrium, crossover and ATM-combination evidence |

The watcher API is operational evidence. The authenticated trader application consumes the same
database through its own typed backend route rather than calling NSE from the browser.

## 5. What the NIFTY Weekly Options strategy uses

Dashboard:

`/n50/strategy/nifty-weekly-options`

Authenticated API:

`GET /n50/v1/nifty-weekly-options/summary`

| Strategy field | Current source |
|---|---|
| Current expiry | NSE watcher `option_chain_snapshots.expiry_date` |
| NIFTY spot used with chain | NSE watcher `underlying_value` |
| ATM and strike ladder | NSE watcher snapshots and legs |
| CE/PE bid and ask | NSE watcher legs |
| IV, volume, OI and OI change | NSE watcher legs |
| Call/put OI walls | Derived from NSE watcher legs |
| ATM-window PCR | Derived from NSE watcher legs |
| Same-session OI movement | Current versus earlier NSE watcher snapshot |
| Local delta/other Greeks displayed in ladder | NSE watcher local calculation |
| Contract lot size | SmartAPI `public.instruments` effective `NIFTY OPTIDX` master |
| Historical NIFTY daily closes | SmartAPI `public.bars_1d`, NSE index token `99926000` |
| Expected movement proxy | Derived from the SmartAPI-backed daily close series |
| Trading-session count | `public.trading_calendar` |

The SmartAPI NIFTY quote/OI/PCR rows are currently corroborating evidence; they are not blended into
the strategy’s canonical NSE chain totals. This avoids mixing different capture times and strike
sets. A future cross-provider validator should compare matched expiry/strike/right rows and report
disagreement rather than selecting whichever value is more favourable.

The strategy remains `PAPER_RESEARCH` and `SHADOW_NO_TRADE`. Neither data source can bypass the
uncalibrated target-probability veto or create a paper/live order.

## 6. Source comparison by field

| Field | SmartAPI | NSE watcher | Current strategy authority |
|---|---|---|---|
| Contract token / trading symbol | Yes | NSE identifier only | SmartAPI master |
| Expiry / strike / right | Yes | Yes | NSE watcher for selected chain |
| Lot size / tick size | Yes | No | SmartAPI master |
| Underlying / spot | Yes | Yes | NSE watcher chain spot |
| LTP and day OHLC | Yes | LTP and change; no full per-leg OHLC | NSE watcher LTP for chain |
| Volume | Yes | Yes | NSE watcher for chain |
| OI | Yes | Yes | NSE watcher for chain |
| Absolute OI change | `oi_snapshots_options.oi_change` | `change_in_oi` | NSE watcher for chain |
| OI-change percentage | Yes | Derivable, not stored directly | SmartAPI corroboration only |
| Best bid/ask and quantities | Yes | Yes | NSE watcher for chain |
| Five-level depth and order counts | Selected contracts | No | SmartAPI only when coverage is valid |
| Total buy/sell quantity | Yes | No | SmartAPI only |
| Broker Greeks | Sparse archive | No | Not canonical |
| Local Greeks | SmartAPI derived chain for stocks | NIFTY watcher | NSE watcher for weekly NIFTY |
| PCR | SmartAPI expiry aggregate | Derived ATM-window PCR | NSE ATM-window PCR with explicit scope |
| Full broad current-expiry NIFTY token span | 162 tokens observed | No, focused 26 legs | SmartAPI corroboration |
| Stable two-minute NIFTY chain history | Not as one unified NIFTY chain table | Yes | NSE watcher |

## 7. Critical limitations and data-quality rules

1. **Do not call collection time exchange time.** SmartAPI can store a new row while the underlying
   exchange values are unchanged. Prefer exchange feed/trade timestamps and session phase.
2. **Do not call ATM-window PCR full-chain PCR.** The NSE strategy PCR covers only persisted ATM
   plus/minus six strikes.
3. **Do not call rotating SmartAPI coverage complete without counting tokens.** PCR and aggregates
   depend on the accumulated contract set.
4. **Do not use `smartapi_option_chain_snapshots` for NIFTY today.** Its deployed plan is stock
   options and the latest batch contained zero NIFTY rows.
5. **Do not treat sparse broker Greeks as a complete surface.** Current NIFTY records are not a
   validated full two-sided chain.
6. **Do not mix providers at unmatched times.** Compare by expiry, strike, right and a bounded time
   tolerance, then expose the difference.
7. **Do not replace missing fields with zero.** Use `—` plus a reason and freshness state.
8. **Do not infer readiness from connectivity.** Transport, freshness, coverage and analytical
   readiness are separate.
9. **Do not use either source to bypass strategy safety.** The NIFTY weekly strategy remains
   research-only until target outcomes are calibrated.

## 8. Safe inspection queries

### Latest NSE chain

```sql
SELECT s.id, s.captured_at, s.expiry_date, s.underlying_value, s.atm_strike,
       count(*) AS legs
FROM public.option_chain_snapshots s
JOIN public.option_chain_legs l ON l.snapshot_id = s.id
WHERE s.id = (
  SELECT id
  FROM public.option_chain_snapshots
  WHERE symbol = 'NIFTY'
  ORDER BY captured_at DESC
  LIMIT 1
)
GROUP BY s.id;
```

### Latest NSE legs

```sql
SELECT l.strike, l.option_type, l.last_price, l.implied_volatility,
       l.total_traded_volume, l.open_interest, l.change_in_oi,
       l.bid_qty, l.bid_price, l.ask_qty, l.ask_price,
       l.delta, l.gamma, l.theta, l.vega
FROM public.option_chain_legs l
WHERE l.snapshot_id = (
  SELECT id
  FROM public.option_chain_snapshots
  WHERE symbol = 'NIFTY'
  ORDER BY captured_at DESC
  LIMIT 1
)
ORDER BY l.strike, l.option_type;
```

### Recent SmartAPI NIFTY option OI

```sql
WITH nifty_options AS (
  SELECT exchange, symbol_token, tradingsymbol, expiry, strike, lotsize
  FROM public.instruments
  WHERE exchange = 'NFO'
    AND instrumenttype = 'OPTIDX'
    AND upper(name) = 'NIFTY'
)
SELECT o.ts, i.tradingsymbol, i.expiry, i.strike,
       o.oi, o.oi_change, o.oi_change_pct
FROM public.oi_snapshots_options o
JOIN nifty_options i USING (exchange, symbol_token)
WHERE o.ts >= now() - interval '10 minutes'
ORDER BY o.ts DESC, i.expiry, i.strike;
```

### Latest SmartAPI NIFTY PCR

```sql
SELECT ts, underlying, expiry, ce_oi, pe_oi, pcr
FROM public.pcr_snapshots
WHERE upper(underlying) IN ('NIFTY', 'NIFTY50')
ORDER BY ts DESC
LIMIT 20;
```

### Confirm SmartAPI derived-chain scope

```sql
WITH latest AS (
  SELECT max(ts) AS ts
  FROM public.smartapi_option_chain_snapshots
)
SELECT s.underlying, count(*) AS contracts
FROM public.smartapi_option_chain_snapshots s
JOIN latest l USING (ts)
GROUP BY s.underlying
ORDER BY s.underlying;
```

## 9. Code ownership

SmartAPI collector and storage:

- `cmd/collector/main.go`
- `cmd/collector/tasks.go`
- `cmd/collector/option_chain_archive.go`
- `internal/store/smartapi_archive.go`
- `internal/store/migrations.go`
- deployed configuration: `/home/novius2/trading-stack/config/config.yaml`

NSE watcher:

- `services/option-chain-watcher/src/nseClient.ts`
- `services/option-chain-watcher/src/transform.ts`
- `services/option-chain-watcher/src/sessionPolicy.ts`
- `services/option-chain-watcher/src/store.ts`
- `services/option-chain-watcher/src/main.ts`

NIFTY Weekly Options strategy:

- `neon-stock-terminal/apps/api/src/routes/niftyWeeklyOptions.ts`
- `neon-stock-terminal/apps/web/src/pages/NiftyWeeklyOptionsPage.tsx`

Related documents:

- `docs/derivatives/NIFTY_AND_STOCK_FNO_DATA_COMPLETE_HANDBOOK_2026-08-13.md`
- `docs/derivatives/NIFTY_OI_SESSION_CLEANUP_2026-08-14.md`
- `docs/long-options/FNO_FUNNEL_AND_NIFTY_WEEKLY_2026-08-13.md`

## 10. Summary decision

- Keep the NSE watcher as the canonical persisted NIFTY weekly-chain source.
- Keep SmartAPI as the broker-token, contract-master, quote/OI/depth and corroboration source.
- Use SmartAPI lot size and NIFTY daily history where those are already canonical.
- Do not silently merge PCR, OI or Greeks from differently scoped/timed observations.
- Add a future cross-provider comparison as an explicit quality check, not as an entry-score boost.
- Keep NIFTY Weekly Options `SHADOW_NO_TRADE` until calibrated outcome evidence passes its gates.
