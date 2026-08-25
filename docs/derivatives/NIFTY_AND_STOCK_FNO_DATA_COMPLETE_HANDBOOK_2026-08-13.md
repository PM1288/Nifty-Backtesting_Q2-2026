# NIFTY and Stock F&O Data — Complete Collection, Storage, API and UI Handbook

**Document date:** 13 August 2026
**Repository:** `/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026`
**Deployment mirror inspected:** `/home/novius2/trading-stack`
**Database inspected:** PostgreSQL 16, database `tradingdb`
**Timezone policy:** data timestamps are stored in UTC; market/session interpretation is `Asia/Kolkata`
**Scope:** NIFTY index options, stock F&O contracts, futures, quotes, volume, open interest, bid/ask, five-level depth, Greeks, derived chain analytics, F&O volatility signals, participant derivatives reports, APIs, UI consumers, schedules, retention, freshness, limitations and operational verification.

---

## 1. Purpose and truth labels

This is the single reference for derivatives data presently represented in the repository and deployed PostgreSQL estate. It deliberately separates four states:

| Label | Meaning |
|---|---|
| **LIVE / PERSISTED** | The running stack writes the dataset and live PostgreSQL contains rows. |
| **DERIVED** | Calculated from persisted source rows; not an exchange-native field. |
| **AVAILABLE IN SCHEMA** | The table/field exists, but current coverage can be empty, stale or partial. |
| **NOT COLLECTED / NOT RECOVERABLE** | The source does not provide it or it was not archived historically. The UI must not invent it. |

This document is descriptive. It does not change collector behavior, pricing logic, OIIS, paper trading, broker order routes or database schemas.

For the focused field-by-field comparison of NIFTY option data from SmartAPI and the separate NSE
scraper container, including current live coverage and strategy ownership, see
`docs/derivatives/NIFTY_OPTION_DATA_SMARTAPI_VS_NSE_WATCHER_2026-08-14.md`.

---

## 2. Executive inventory

### 2.1 What is collected now

| Data family | NIFTY / index | Stock F&O | Source | Current status |
|---|---:|---:|---|---|
| Instrument/token master | Yes | Yes | SmartAPI instrument master | **LIVE / PERSISTED** |
| Contract identity, expiry, strike, right, lot and tick size | Yes | Yes | SmartAPI instrument master | **LIVE / PERSISTED** |
| Futures current/next contract identity | Yes | Yes | Token plan + instrument universe | **LIVE / PERSISTED** |
| LTP and OHLC snapshot | Yes | Yes | SmartAPI WebSocket and REST FULL quote | **LIVE / PERSISTED** |
| Day volume | Yes | Yes | SmartAPI quote/tick | **LIVE / PERSISTED** |
| Open interest and OI change | Yes | Yes | SmartAPI quote/tick/aggregate | **LIVE / PERSISTED** |
| Best bid/ask price and quantity | Yes | Yes | SmartAPI SNAPQUOTE/FULL | **LIVE / PERSISTED** |
| Five-level bid/ask depth | Contract-plan dependent | Yes | SmartAPI SNAPQUOTE | **LIVE / PERSISTED**, short retention |
| Orders per depth level | Contract-plan dependent | Yes | SmartAPI SNAPQUOTE | **LIVE / PERSISTED**, short retention |
| Total buy/sell quantity | Yes | Yes | SmartAPI quote/tick | **LIVE / PERSISTED** |
| Spread, midpoint, microprice and depth imbalance | Yes | Yes | Derived from bid/ask and best-five | **DERIVED** |
| NIFTY option chain, ATM ± 6 strikes | Yes | No | NSE option-chain watcher | **LIVE / PERSISTED** |
| Broad stock-option snapshot, usually 14 contracts/underlying | No | Yes | SmartAPI contract plan + quote archive | **LIVE / PERSISTED** |
| Broker IV and Greeks | API supports it | API supports it | SmartAPI option Greek endpoint | **AVAILABLE**, broker coverage currently absent in latest stock-chain snapshot |
| Local IV and Greeks | Yes | Yes | Black-Scholes/Black-76 calculation | **LIVE / DERIVED** |
| PCR snapshots | Yes | Yes where an expiry set is scheduled | SmartAPI aggregate task | **LIVE / PERSISTED** |
| Max pain | NIFTY-oriented historical rows | Possible by model | Derived job | **AVAILABLE BUT STALE** in live DB |
| Call/put walls and migration | NIFTY | Not exposed as canonical stock API | NIFTY option-chain legs | **DERIVED** |
| Futures basis and annualised basis | Yes | Yes | Futures state joined to cash state | **DERIVED / LIVE API** |
| Futures price/OI buildup classification | Yes | Yes | Futures price change + OI change | **DERIVED / LIVE API** |
| F&O volatility candidates | Stock F&O | Stock F&O | EOD + intraday + chain snapshot | **LIVE / PERSISTED**, PAPER only |
| FII/client derivatives positioning | Index and stock futures/options aggregates | Aggregate, not contract-level | NSE/CDSL daily files | **LIVE DAILY** |
| Historical market-by-order queue position | No | No | Not supplied by best-five feed | **NOT COLLECTED** |
| Historical depth before capture began | No | No | Broker does not provide a recovery archive | **NOT RECOVERABLE** |
| Full expired option-chain history before archive deployment | No | No | Broker master removes expired contracts | **NOT RECOVERABLE** |

### 2.2 Two different option-chain systems

Do not combine these systems in code or analysis without stating the source:

1. **NSE NIFTY option-chain watcher**
   - Source: NSE option-chain JSON through a Playwright request context.
   - Universe: configured symbol `NIFTY`.
   - Expiry: current expiry returned by the source.
   - Window: ATM plus/minus six strikes, both CE and PE.
   - Frequency: every 120 seconds.
   - Tables: `public.option_chain_snapshots`, `public.option_chain_legs`.

2. **SmartAPI broad stock F&O archive**
   - Source: existing SmartAPI WebSocket/REST quote estate.
   - Universe: daily effective stock-derivative token plan.
   - Latest observed universe: 187 stock underlyings, 2,200 active OPTSTK plan rows for the latest plan date.
   - Latest snapshot shape: up to 14 selected option contracts per stock, normally seven strikes times CE/PE around ATM for the nearest expiry.
   - Frequency: a five-minute chain archive built from already-collected quotes; no additional per-contract network call.
   - Table: `public.smartapi_option_chain_snapshots` and view `public.v_latest_option_chain`.

The first is a focused NIFTY exchange-chain feed. The second is a wide stock-F&O monitoring archive.

---

## 3. End-to-end architecture

```text
SmartAPI instrument master
  -> public.instruments
  -> public.instrument_master_snapshot
  -> public.instrument_universe
  -> public.derivative_token_plan

SmartAPI WebSocket SNAPQUOTE/LTP
  -> public.instrument_state                 latest operational state
  -> public.market_ticks                     sampled raw tick archive
  -> public.depth_5_snapshots                five bid + five ask levels
  -> public.depth_5_metrics                  spread/imbalance/microprice
  -> public.bars_1m                          OHLCV bars where enabled

SmartAPI REST FULL quote, central rate queue
  -> public.quote_snapshots                  quote/OHLC/volume/OI/best bid-ask
  -> public.oi_snapshots_options             option OI time series
  -> public.oi_snapshots_futures             futures OI time series

SmartAPI option Greek endpoint
  -> public.option_greeks                    broker IV/Greeks archive

Token plan + current quotes + local solver
  -> public.smartapi_option_chain_snapshots  stock chain evidence
  -> public.v_latest_option_chain            latest contract rows
  -> fno_volatility.*                        movement and option candidates

NSE option-chain JSON watcher
  -> public.option_chain_snapshots            NIFTY snapshot header
  -> public.option_chain_legs                 NIFTY CE/PE strike evidence
  -> /option-chain/api/*                      watcher API and analytics UI

NSE/CDSL daily derivatives reports
  -> institutional_flow.*
  -> market_data.nse_fii_*
  -> Futures / FII-DII UI context
```

### 3.1 Source precedence

For live UI and calculation:

1. `public.instrument_state` or a fresh canonical snapshot/archive row.
2. Existing SmartAPI service through its centralized rate-safe queue.
3. Explicit unavailable/stale state.

Delayed public data must never be presented as live. NSE watcher data and SmartAPI chain data must retain separate provenance.

---

## 4. Instrument and contract identity

### 4.1 `public.instruments`

Current SmartAPI instrument master. Primary key is `(exchange, symbol_token)`.

| Field | Meaning |
|---|---|
| `exchange` | Segment such as `NSE`, `NFO`, `BSE`, `BFO`. |
| `symbol_token` | Broker token; use with exchange as the operational key. |
| `tradingsymbol` | Exchange/broker trading symbol. |
| `name` | Underlying/display name when supplied. |
| `instrumenttype` | `FUTIDX`, `FUTSTK`, `OPTIDX`, `OPTSTK`, equity or index type. |
| `expiry` | Contract expiry date; null for cash/index instruments. |
| `strike` | Option strike; null for cash/futures. |
| `lotsize` | Contract lot size. |
| `tick_size` | Minimum permitted price increment. |
| `raw` | Original instrument-master object for audit. |
| `updated_at` | Latest master refresh time. |
| `is_cas_enabled` | Closing-auction eligibility when known. |

Observed NFO/BFO master counts at document generation:

| Exchange | Type | Rows |
|---|---|---:|
| NFO | FUTIDX | 42 |
| NFO | FUTSTK | 1,461 |
| NFO | OPTIDX | 14,485 |
| NFO | OPTSTK | 104,922 |
| BFO | FUTIDX | 31 |
| BFO | FUTSTK | 1,678 |
| BFO | OPTIDX | 16,692 |
| BFO | OPTSTK | 106,963 |

These are master rows, including multiple expiries and strikes. They are not all simultaneously subscribed.

### 4.2 `public.instrument_master_snapshot`

Daily immutable token/contract snapshot. Primary key: `(snapshot_date, exchange, symbol_token)`.

Fields: `snapshot_date`, `captured_at`, `source_hash`, `exchange`, `symbol_token`, `tradingsymbol`, `name`, `instrumenttype`, `expiry`, `strike`, `lotsize`, `tick_size`, `is_cas_enabled`, `raw`.

Purpose:

- reconstruct expired contract identity after SmartAPI removes it from the current master;
- audit lot-size and tick-size changes;
- retain exact source hash and original payload;
- prevent today’s symbol master from rewriting historical identity.

### 4.3 `public.instrument_universe`

Effective-dated universe mapping.

Fields: `universe_name`, `exchange`, `symbol_token`, `tradingsymbol`, `underlying`, `expiry`, `strike`, `right`, `instrumenttype`, `weight`, `metadata`, `active_from`, `active_to`.

This is used by the Futures workspace and other downstream services. `active_to IS NULL` identifies the current effective row.

### 4.4 `public.derivative_token_plan`

Daily executable subscription/collection plan. Primary key: `(plan_name, plan_date, exchange, symbol_token)`.

| Field | Meaning |
|---|---|
| `plan_name` | Named plan, currently consumed as `NIFTY250_STOCK_DERIVATIVES` by the F&O volatility service. |
| `plan_date` | Effective plan date. Always filter to the latest eligible date. |
| `underlying` | Canonical underlying. |
| `exchange`, `symbol_token`, `tradingsymbol` | Contract identity. |
| `mode` | Required stream/quote mode. |
| `contract_kind` | `FUT` or `OPTSTK` in the current stock plan. |
| `selection_label` | Why/how the contract was selected. |
| `expiry`, `expiry_rank`, `is_monthly_expiry` | Expiry identity and relative order. |
| `strike`, `right`, `strike_step`, `strike_offset` | Option placement around ATM. |
| `underlying_price` | Price used when generating the strike plan. |
| `instrumenttype`, `lotsize` | Contract type and lot quantity. |
| `priority`, `active`, `reason`, `metadata` | Scheduling and audit data. |
| `generated_at` | Plan generation time. |

Latest plan-date facts (`2026-08-13`):

- 188 underlyings with 375 active futures rows across two expiries.
- 187 underlyings with 2,200 active stock-option rows for the nearest stock-option expiry.
- The token plan is regenerated during the session; consumers must filter by `plan_date`, not by `active` alone across all history.

### 4.5 `catalog.option_contract_observation`

Point-in-time contract catalog used by research/reproducibility components.

Fields: `observation_id`, `instrument_id`, `underlying_symbol`, `exchange`, `segment`, `trading_symbol`, `expiry`, `strike`, `option_right`, `lot_size`, `tick_size`, `available_at`, `active_from`, `active_to`, `source_ref`, `metadata`.

This table currently has no analyzed rows according to planner statistics; treat it as **AVAILABLE IN SCHEMA**, not a live canonical source.

---

## 5. Live latest state, quotes and ticks

### 5.1 `public.instrument_state`

One mutable latest-state row per `(exchange, symbol_token)`.

Fields:

- identity/timestamps: `exchange`, `symbol_token`, `last_seen_ts`, `last_source`, `updated_at`;
- price: `last_price`, `last_open`, `last_high`, `last_low`, `last_close`, `avg_price`, `net_change`, `percent_change`;
- best market: `last_bid`, `last_ask`, `last_bid_qty`, `last_ask_qty`;
- activity: `last_trade_qty`, `last_volume`, `total_buy_qty`, `total_sell_qty`;
- derivatives: `last_oi`, `last_oi_change_pct`;
- controls/context: `upper_circuit`, `lower_circuit`, `week52_high`, `week52_low`.

Use this for the fastest current value. It is not a historical audit table.

### 5.2 `public.quote_snapshots`

Partitioned REST FULL-quote archive. Parent primary key: `(ts, exchange, symbol_token)`.

| Field group | Fields |
|---|---|
| Identity | `ts`, `exchange`, `symbol_token` |
| Price/OHLC | `ltp`, `open`, `high`, `low`, `close`, `avg_price`, `net_change`, `percent_change` |
| Activity | `volume`, `last_trade_qty`, `total_buy_qty`, `total_sell_qty` |
| Derivatives | `oi` |
| Best market | `bid`, `ask`, `bid_qty`, `ask_qty` |
| Exchange time | `exch_feed_time`, `exch_trade_time` |
| Limits/context | `upper_circuit`, `lower_circuit`, `week52_high`, `week52_low`, `reference_limit_price`, `session_phase` |
| Audit | `raw` |

Important semantics:

- `volume` is the cumulative day traded volume supplied by the source at snapshot time.
- `oi` is the currently reported open interest, not volume.
- `bid`/`ask` are best prices; `bid_qty`/`ask_qty` are their quantities.
- `total_buy_qty`/`total_sell_qty` are aggregate market quantities, not best-level size.
- `raw` preserves source fields but must not be returned wholesale to ordinary UI routes.

Configured cadence:

- primary quote snapshots: every 60 seconds;
- option quote snapshots: every 60 seconds;
- batch maximum: 50 instruments per SmartAPI quote request;
- global quote limiter: one request/second with configured minute/hour caps;
- rotating option budget: up to 500 tokens per option cycle.

### 5.3 `public.market_ticks`

Partitioned sampled WebSocket archive.

Fields: `exchange_ts`, `received_ts`, `connection_id`, `sequence_no`, `subscription_mode`, `exchange`, `symbol_token`, `session_phase`, `ltp`, `last_trade_qty`, `avg_price`, `day_volume`, `total_buy_qty`, `total_sell_qty`, `open`, `high`, `low`, `close`, `last_trade_ts`, `oi`, `oi_change_pct`, `upper_circuit`, `lower_circuit`, `week52_high`, `week52_low`, `raw`.

Configured behavior:

- one archive sample/token/second;
- bounded channel of 65,536 samples;
- batched inserts of 2,000;
- overflow is counted and must never block the operational feed;
- WebSocket maximum three connections and 1,000 token-mode subscriptions per connection;
- option and futures streaming mode is `SNAPQUOTE`.

The sequence and connection fields enable duplicate/gap detection. A sequence gap must degrade readiness and trigger snapshot recovery; it must not be treated as a zero move.

### 5.4 Time and session phases

The collector operates in `Asia/Kolkata`, with normal configured collection window `09:15` to `15:40`. Persisted `session_phase` can be:

`PREOPEN`, `REGULAR`, `CAS_REFERENCE`, `CAS_ORDER_ENTRY`, `CAS_RANDOM_CLOSE`, `CAS_MATCHING`, `CAS_TRANSITION`, `POST_CLOSE`, `FNO_EXTENDED`, or `CLOSED`.

Do not merge CAS values into a regular-session label. F&O collection may continue to 15:40 IST while the regular market close is earlier.

---

## 6. Bid, ask and market-depth data

### 6.1 Best bid/ask

Best prices and quantities exist in:

- `public.instrument_state`: latest only;
- `public.quote_snapshots`: periodic archive;
- `public.smartapi_option_chain_snapshots`: option-contract chain archive;
- `public.option_chain_legs`: NSE NIFTY chain best buy/sell;
- `fno_volatility.option_candidate`: selected call/put bid and ask at decision time.

### 6.2 `public.depth_5_snapshots`

One row per side and level. Parent key: `(ts, exchange, symbol_token, side, level)`.

| Field | Meaning |
|---|---|
| `ts` | Snapshot time. |
| `exchange`, `symbol_token` | Contract identity. |
| `side` | Bid/buy or ask/sell side. |
| `level` | Depth rank, normally 1 through 5. |
| `price` | Price at the level. |
| `quantity` | Quantity at that level. |
| `orders` | Number of orders represented at that level. |
| `cumulative_quantity` | Sum of quantities from level 1 through this level. |
| `cumulative_notional` | Sum of `price × quantity` from level 1 through this level. |

Configured snapshot interval is five seconds for `EQUITY`, `INDEX`, `FUT`, `OPTIDX`, and `OPTSTK` where subscribed in the required mode.

### 6.3 `public.depth_5_metrics`

One derived row per token/time.

Fields: `ts`, `exchange`, `symbol_token`, `best_bid`, `best_ask`, `midpoint`, `spread`, `spread_pct`, `bid_notional_5`, `ask_notional_5`, `depth_imbalance`, `microprice`, `session_phase`.

Formulas:

```text
midpoint = (best_bid + best_ask) / 2
spread = best_ask - best_bid
spread_pct = spread / midpoint

depth_imbalance =
  (sum_bid_qty_5 - sum_ask_qty_5) /
  (sum_bid_qty_5 + sum_ask_qty_5)

microprice =
  (best_ask * level1_bid_qty + best_bid * level1_ask_qty) /
  (level1_bid_qty + level1_ask_qty)
```

If either side is absent, two-sided calculations remain null or receive an explicit missing status. Zero must not be substituted.

### 6.4 What depth does not contain

- no market-by-order participant identity;
- no queue position;
- no recoverable historical depth before collection;
- no guaranteed executable fill for the full displayed quantity;
- no 20-level depth after provider deprecation.

### 6.5 Retention

Configured retention is deliberately short:

- best-five raw snapshots: one day / one-hour age window under current cleanup policy;
- maximum best-five storage target: 1 GB;
- quote snapshots: 90 days, with intraday cleanup policy also using a five-hour window;
- OI snapshots: five-hour intraday retention target;
- option Greeks: 90 days.

Because depth is not recoverable, analysts requiring longer depth history must change retention only after a capacity test.

---

## 7. NIFTY option-chain watcher

### 7.1 Scope and polling

Runtime configuration:

| Setting | Value |
|---|---:|
| Symbol | `NIFTY` |
| Poll interval | 120,000 ms (2 minutes) |
| Strikes around ATM | 6 |
| Legs per normal complete snapshot | 26 (13 strikes × CE/PE) |
| Raw source JSON retention | Disabled |
| Cleanup minimum history | 14 days |
| Risk-free rate for local Greeks | 0.06 |
| Dividend yield | 0 |
| Screenshot endpoint | Disabled |

The service is currently healthy and continued polling successfully at the time of this review.

### 7.2 `public.option_chain_snapshots`

Snapshot header fields:

| Field | Meaning |
|---|---|
| `id` | Snapshot primary key. |
| `captured_at` | Watcher capture time. |
| `symbol` | Configured underlying, currently `NIFTY`. |
| `expiry_date` | Selected expiry. |
| `underlying_value` | Source underlying level. |
| `atm_strike` | Nearest listed strike to underlying value. |
| `strikes_around` | Window radius, currently six. |
| `source` | Source label, default `nseindia`. |
| `fetch_ms` | Network/fetch duration. |
| `raw` | Optional source JSON; disabled in current runtime. |

Indexes support `(symbol, captured_at DESC)`, `(symbol, expiry_date)`, and snapshot ID lookup.

### 7.3 `public.option_chain_legs`

Per-strike/per-right fields:

| Field | Meaning |
|---|---|
| `id`, `snapshot_id` | Row and parent snapshot identity. |
| `strike` | Strike price. |
| `option_type` | `CE` or `PE`. |
| `last_price` | Last traded premium. |
| `change` | Premium change supplied by NSE. |
| `implied_volatility` | Source IV percentage. |
| `total_traded_volume` | Cumulative contract volume. |
| `open_interest` | Current OI. |
| `change_in_oi` | Change in OI. |
| `bid_qty`, `bid_price` | Best buy quantity/price. |
| `ask_qty`, `ask_price` | Best sell quantity/price. |
| `instrument_identifier` | Source identifier when present. |
| `delta`, `gamma`, `theta`, `vega` | Locally calculated Greeks. |

Greeks are calculated only when underlying, positive IV and positive time-to-expiry exist. Theta is per day and vega is per one percentage-point IV change in this service. Missing/zero-IV legs retain null Greeks.

### 7.4 NIFTY chain derived analytics

The watcher and dashboard derive:

- ATM and selected strike window;
- available expiries;
- DTE in days/hours and expiry progress;
- CE/PE normalized price equilibrium;
- equilibrium/crossover flags;
- dynamic-ATM call premium + put premium (`ATM combo`);
- combo delta and percentage change;
- call/put OI walls;
- wall migration across recent snapshots;
- PCR by expiry;
- IV term structure;
- delta/gamma concentration proxies;
- diagnostics: freshness, strike coverage, missing CE/PE series, timestamp drift, fallback counts and crossover count.

These are analytical outputs, not additional exchange fields.

### 7.5 Watcher HTTP API

Base through nginx: `/option-chain/`.

| Method/path | Purpose | Key parameters |
|---|---|---|
| `GET /option-chain/healthz` | Process health and last poll state | none |
| `GET /option-chain/readyz` | Database readiness | none |
| `GET /option-chain/api/latest` | Latest header and all selected legs | `compareMinutes=1..1440` optional |
| `GET /option-chain/api/series` | ATM series | `minutes=1..10080`, capped result |
| `GET /option-chain/api/analytics` | Linked chain/equilibrium/ATM analytics | `minutes`, `compareMinutes`, `strikesAround`, `expiry` |
| `GET /option-chain/api/screenshot` | PNG UI capture | disabled in current runtime |

`/api/latest` exposes snapshot, legs, optional comparison snapshot, watcher state and capabilities. `/api/analytics` performs batched database reads; it does not issue one request per strike.

---

## 8. SmartAPI stock option-chain archive

### 8.1 `public.smartapi_option_chain_snapshots`

Partitioned table, unique per `(ts, exchange, symbol_token)`.

#### Contract identity

| Field | Meaning |
|---|---|
| `ts` | Chain snapshot time. |
| `underlying` | Stock underlying. |
| `expiry` | Contract expiry. |
| `exchange`, `symbol_token`, `tradingsymbol` | Broker/exchange identity. |
| `strike`, `right` | Strike and `CE`/`PE`. |
| `lotsize` | One-lot quantity. |

#### Underlying/reference prices

| Field | Meaning |
|---|---|
| `spot_price` | Cash-equity price used for reference. |
| `futures_price` | Nearest future price where available. |

#### Executable market and liquidity

| Field | Meaning |
|---|---|
| `bid`, `ask` | Best option bid and ask. |
| `midpoint` | `(bid + ask) / 2` when two-sided. |
| `spread` | `ask - bid`. |
| `spread_pct` | Spread divided by midpoint/reference as implemented. |
| `volume` | Day option contract volume. |
| `oi` | Current option open interest. |
| `oi_change_pct` | Source/current OI percentage change. |
| `total_buy_qty`, `total_sell_qty` | Aggregate displayed quantities from quote source. |
| `depth_imbalance` | Best-five derived imbalance where depth is available. |

#### Broker and local Greeks

| Broker fields | Local fields |
|---|---|
| `broker_iv` | `local_iv` |
| `broker_delta` | `local_delta` |
| `broker_gamma` | `local_gamma` |
| `broker_theta` | `local_theta` |
| `broker_vega` | `local_vega` |

`greek_validation_status` states whether broker/local values are present and valid. Broker and local values remain separate; a local calculation never overwrites a broker value.

#### Quality and provenance

| Field | Meaning |
|---|---|
| `quote_age_seconds` | Source quote age at archive generation. |
| `source_quote_ts` | Actual source quote time. |
| `session_phase` | Market phase. |
| `data_quality_status` | `FULL`, `QUOTE_STALE`, `QUOTE_MISSING`, or `TWO_SIDED_QUOTE_MISSING`. |

### 8.2 Latest observed stock-chain coverage

Snapshot time: `2026-08-13 10:07:06+00` (`15:37:06 IST`).

| Measure | Result |
|---|---:|
| Contract rows | 2,577 |
| Distinct stock underlyings | 187 |
| Distinct expiries | 1 |
| Rows with bid and ask columns populated | 2,577 |
| Rows with volume | 2,577 |
| Rows with OI | 2,577 |
| Rows with broker IV | 0 |
| Rows with valid local IV/Greeks | 2,567 |
| `FULL` rows | 2,457 |
| `QUOTE_STALE` rows | 118 |
| `TWO_SIDED_QUOTE_MISSING` rows | 2 |

Interpretation: the stock-chain archive is materially populated, but the broker Greek feed was absent for this snapshot. Local values covered nearly all contracts. A non-null bid/ask column does not override an explicit stale/two-sided quality state.

### 8.3 `public.v_latest_option_chain`

View returning the latest archived row per contract with the same fields as the parent chain. Use this for current-chain inspection when an immutable decision-time snapshot is not required.

### 8.4 Local pricing method

The collector archive uses an executable midpoint when valid and the current future as the underlying reference, with spot fallback. It applies a bounded Black-76 solver using configured risk-free rate 0.06. Invalid, crossed, absent or stale quotes do not receive invented values.

The separate F&O volatility service uses Black-Scholes scenario pricing for stock-option structures. The model used must be stated with every analysis; Black-76 archive Greeks and Black-Scholes scenario outputs are not interchangeable labels.

---

## 9. Open interest, volume and aggregate derivatives snapshots

### 9.1 `public.oi_snapshots_options`

Fields: `ts`, `exchange`, `symbol_token`, `oi`, `oi_change`, `oi_change_pct`, `raw`.

Configured cadence: 60 seconds. Current storage is monthly partitioned. OI is not traded volume.

### 9.2 `public.oi_snapshots_futures`

Same fields and cadence as the option OI table, for futures contracts.

### 9.3 `public.pcr_snapshots`

Fields: `ts`, `underlying`, `expiry`, `pcr`, `ce_oi`, `pe_oi`, `raw`.

Configured cadence: 300 seconds. Typical calculation is put OI divided by call OI for the selected underlying/expiry; the stored `raw` record and implementation remain the audit source.

### 9.4 `public.gainers_losers_snapshots`

Fields: `ts`, `exchange`, `label`, `params`, `raw`.

Configured cadence: 300 seconds. Current requests use nearest-expiry percentage price gainers and losers. These are broker aggregate responses, not locally re-ranked chain rows unless a consumer explicitly performs its own ranking.

### 9.5 `public.oibuildup_snapshots`

Fields: `ts`, `exchange`, `label`, `params`, `raw`.

Configured cadence: 300 seconds for nearest-expiry `Long Built Up` and `Short Built Up` aggregate requests.

### 9.6 Price/OI buildup labels used by the Futures workspace

```text
price change > 0 and OI change > 0 -> LONG_BUILDUP
price change < 0 and OI change > 0 -> SHORT_BUILDUP
price change > 0 and OI change < 0 -> SHORT_COVERING
price change < 0 and OI change < 0 -> LONG_UNWINDING
otherwise                              NEUTRAL
```

These labels describe price/OI co-movement. They do not identify a participant and are not automatically a trade recommendation.

---

## 10. Option Greeks

### 10.1 `public.option_greeks`

Fields:

`ts`, `underlying`, `expiry`, `tradingsymbol`, `strike`, `right`, `iv`, `delta`, `gamma`, `theta`, `vega`, `ltp`, `raw`, `trade_volume`.

Primary uniqueness is `(ts, tradingsymbol)`. Indexes support underlying/expiry/time and symbol/time lookup.

Configured behavior:

- Greek task every 60 seconds;
- base configured underlyings include `NIFTY50` and `BANKNIFTY`;
- dynamic stock shortlist size is 20;
- one centralized Greek request/second;
- requests are coalesced by underlying/expiry.

### 10.2 Meaning of Greeks

| Field | Interpretation |
|---|---|
| `iv` | Implied volatility under the stated model and market price. |
| `delta` | First-order option price sensitivity to underlying price. |
| `gamma` | Change in delta for a unit underlying move. |
| `theta` | Time decay; unit convention depends on source/model and must be displayed. |
| `vega` | Sensitivity to a volatility change; unit convention must be displayed. |

Do not compare broker and local theta/vega without confirming units. Do not show a zero Greek where input data is absent; show `—` plus quality reason.

### 10.3 NIFTY watcher Greeks versus SmartAPI Greeks

- NIFTY watcher: local Black-Scholes using NSE IV, risk-free rate and dividend yield.
- SmartAPI `option_greeks`: broker values from the Greek endpoint.
- SmartAPI stock-chain archive: broker values if available plus local Black-76 validation/fallback fields.

The UI should identify which value is displayed.

---

## 11. PCR, walls, max pain and equilibrium

### 11.1 PCR

PCR is stored by underlying and expiry in `public.pcr_snapshots`. It must include timestamp and expiry; a single unlabeled PCR across expiries is ambiguous.

### 11.2 Call and put walls

The dashboard derives candidate walls from NIFTY `option_chain_legs`, ranking OI and OI change while considering distance from spot. The wall is an OI concentration, not guaranteed support/resistance.

### 11.3 Max pain tables

| Table | Purpose |
|---|---|
| `public.max_pain_runs` | Run metadata: underlying, expiry, spot, counts, status/error. |
| `public.max_pain_levels` | Per-strike CE/PE OI and calculated CE/PE/total pain. |
| `public.max_pain_summary` | Latest chosen max-pain strike and totals. |

The latest `max_pain_summary` row in the inspected database was from March 2026. Therefore max pain is currently **STALE** and must not be presented as current August data.

### 11.4 Equilibrium tables

| Table | Purpose |
|---|---|
| `public.equilibrium_current_snapshot` | Current reference strike and normalized CE/PE values. |
| `public.equilibrium_strike_snapshot` | Per-strike CE/PE closing and normalized values. |
| `public.equilibrium_mean_series` | Time series of mean normalized CE/PE values and counts. |
| `public.equilibrium_summary` | Aggregate mean values by underlying/expiry. |

The latest equilibrium rows in the inspected database were from March 2026. Treat these legacy tables as stale. The watcher’s runtime equilibrium calculation uses current chain snapshots and must expose its own as-of time.

---

## 12. Futures data

### 12.1 Contract data available

For current and next stock/index futures the estate can provide:

- underlying and trading symbol;
- expiry and relative expiry rank;
- lot/tick metadata;
- LTP, open, high, low, previous close;
- volume;
- OI and OI change percentage;
- best bid/ask and quantities;
- best-five depth where subscribed;
- spot/cash reference price;
- basis and annualised basis;
- price/OI buildup label;
- source timestamp and freshness.

### 12.2 Futures API calculations

The dashboard API joins active `public.instrument_universe` futures to `public.instrument_state` and the cash token:

```text
basis = futures_price - spot_price
basis_pct = basis / spot_price * 100
annualised_basis_pct = basis / spot_price * 365 / max(days_to_expiry, 1) * 100
```

The calculation uses calendar days in the present API query. The UI must label this convention. Near expiry, annualisation can become unstable and must not be interpreted without DTE.

### 12.3 Futures API

`GET /n50/api/v1/workspace/futures`

Response groups:

- `contracts`: current/next futures analytics;
- `participantRows` / `rows`: recent client-type derivatives participant records;
- `asOf`: API generation time.

The participant table is aggregate report data and is not contract-level tick evidence.

---

## 13. F&O volatility and option-entry intelligence

### 13.1 Safety boundary

Strategy ID: `FNO_VOLATILITY_TWO_GATE`, version `1.0.0`, environment `PAPER`. Automatic submission is disabled. Entry price source is current ask, exit price source is current bid, and the configured quantity is one lot.

This is not OIIS and must not be presented as an OIIS extension.

### 13.2 Schedule

| Stage | IST time |
|---|---|
| Premarket ranking | 08:30 |
| Live checks | 09:30, 09:45, 10:00 |
| Entry cutoff | 11:00 |
| Fixed modeled exit | 15:15 |
| Service poll loop | 30 seconds |

### 13.3 `fno_volatility.signal_run`

Run identity and quality fields:

`run_id`, `strategy_id`, `strategy_version`, `trade_date`, `run_slot`, `decision_as_of`, `execution_timestamp`, `stage`, `status`, `requested_underlyings`, `evaluated_underlyings`, `shortlisted_underlyings`, `actionable_signals`, `source_eod_date`, `source_minute_ts`, `source_quote_ts`, `data_quality`, `result_hash`, `error_detail`, `started_at`, `completed_at`.

Unique identity prevents duplicate strategy/version/date/slot/stage runs.

### 13.4 `fno_volatility.universe_snapshot`

Per-run stock-contract coverage: cash token, nearest future token/expiry, nearest option expiry, active call/put counts and data status.

### 13.5 `fno_volatility.movement_prediction`

Per-underlying movement model fields:

- ranks/scores: `movement_rank`, `move_score_pre`, `move_score_live`;
- forecast: `predicted_abs_move_p50`, `p75`, `p90`, `probability_top_quintile`, `probability_up`, `direction_entropy`;
- live confirmation: `opening_gap_pct`, `opening_range_pct`, `opening_volume_pace`;
- audit: `features`, `feature_availability`, `shortlisted`, `model_kind`, `created_at`.

Premarket features include ATR percentage, Bollinger width, volume versus SMA20, absolute prior return, ADX and a market-volatility proxy. Missing histories remain unavailable.

### 13.6 `fno_volatility.option_candidate`

#### Identity/structure

`candidate_id`, `run_id`, `underlying`, `structure_type`, `expiry`, `call_token`, `call_symbol`, `call_strike`, `put_token`, `put_symbol`, `put_strike`, `lot_size`.

#### Market/entry fields

`spot_price`, `futures_price`, `call_bid`, `call_ask`, `put_bid`, `put_ask`, `combined_entry_ask`, `combined_mark_bid`, `combined_spread_pct`, `implied_move_pct`, `call_iv`, `put_iv`.

#### Forecast/risk fields

`predicted_iv_change`, `forecast_implied_ratio`, `expected_return_pct`, `probability_profit`, `pnl_p10`, `pnl_p50`, `pnl_p90`, `expected_shortfall_95`, `greek_edge_pct`.

#### Quality/audit fields

`quote_as_of`, `quote_source_as_of`, `quote_age_seconds`, `data_status`, `rejection_reasons`, `scenario_summary`, `created_at`.

Entry is modeled from both asks. Mark/exit is modeled from both bids. This avoids the optimistic error of entering or exiting at LTP/midpoint.

### 13.7 `fno_volatility.trade_signal`

Fields: `signal_id`, `run_id`, `candidate_id`, `underlying`, `decision`, `confidence`, `rank`, `reason_codes`, `paper_submit_status`, `paper_trade_intent_id`, `paper_trade_group_id`, `created_at`.

An `option_candidate` is evidence; a `trade_signal` is the governed decision. A candidate must not be called a trade unless the decision is `BUY_STRADDLE` or `BUY_STRANGLE` and the configured gates pass.

### 13.8 Decision gates

Current policy requires:

- forecast/implied ratio at least 1.15;
- expected return at least 0.05;
- probability of profit at least 0.55;
- direction entropy at least 0.90;
- combined spread percentage no more than 0.05;
- full data status and at least two two-sided contracts;
- quote age no more than 120 seconds for the source policy.

The explainable dashboard layer also derives data-quality, movement-readiness, live-confirmation, value-edge, contract-quality and final-readiness scores. These are UI/API derived scores and do not replace stored decision gates.

### 13.9 F&O APIs

| Method/path | Purpose |
|---|---|
| `GET /n50/api/v1/fno-volatility/dashboard` | Raw runs, premarket/live rows, heartbeats, universe and chain health. |
| `GET /n50/api/v1/options-intelligence/summary` | Explainable funnel, gate failures, chain health and candidate scores. |
| `GET /n50/api/v1/options-intelligence/candidates/{symbol}` | Selected stock prediction, immutable decision snapshot, latest contract chain, 120-minute chain history and provenance. |

Candidate detail returns bid, ask, midpoint, spread, volume, OI, total buy/sell quantity, depth imbalance, broker/local Greeks, quality, OI change from an earlier snapshot and selected call/put markers.

---

## 14. Institutional/FII derivatives reports

These are daily published position/flow aggregates, not live chain ticks.

### 14.1 `institutional_flow.normalized_nse_derivatives_participants`

Fields: `market_date`, `client_type`, `instrument_type`, `buy_contracts`, `sell_contracts`, `open_interest_long`, `open_interest_short`, `call_long`, `call_short`, `put_long`, `put_short`, `source_dataset`.

Latest inspected market date: `2026-08-12`.

### 14.2 `institutional_flow.participant_positioning_summary`

Fields: `date`, `client_type`, index/stock futures long/short, index option call/put long/short and derived `net_bias`.

### 14.3 `market_data.nse_fii_derivatives_stats`

Fields: run metadata, trade date, derivative category, buy/sell/open contracts and values in crore, source/parsed files. The inspected rows were loaded in April 2026; this is not the newest participant source.

### 14.4 `market_data.nse_fii_participant_open_interest`

Per date/client type: index future, stock future, index option and stock option call/put long/short contract counts plus totals and source files.

### 14.5 `market_data.nse_fii_participant_volume`

Same dimensional structure as participant OI, but for volume.

Every UI value must show the report date and source age. Transport-connected does not mean the daily participant report is current.

---

## 15. Dashboard/API consumption map

| UI route | API | Canonical data |
|---|---|---|
| `/n50/options/structure` | `/v1/analytics/options-structure` | NIFTY chain legs + PCR + Greeks + max pain + equilibrium; stale submodules must be marked |
| `/n50/options/snapshot` | current analytics route family | NIFTY chain latest/strike evidence |
| `/n50/options/prediction` or Options Intelligence | `/v1/options-intelligence/summary` | F&O volatility runs + SmartAPI stock-chain archive |
| Stock option candidate detail | `/v1/options-intelligence/candidates/{symbol}` | Decision-time candidate + latest chain + history |
| `/n50/options/volatility-signals` | `/v1/fno-volatility/dashboard` | `fno_volatility.*` |
| `/n50/futures` | `/v1/workspace/futures` | instrument universe/state + participant report |
| `/option-chain/` | watcher native API | NIFTY NSE option-chain snapshots/legs |

### 15.1 UI display rules

- Limit ordinary display precision to at most two decimal places; Greek detail may use more only when methodologically useful and explicitly labelled.
- Keep full precision in storage and calculations; round only for display.
- Never convert missing bid, ask, OI, volume, IV or Greek values to zero.
- Show contract expiry, lot size, data as-of and source.
- Separate current-chain monitoring from the immutable decision snapshot.
- Mark max-pain/equilibrium legacy rows stale instead of blending them into current NIFTY chain evidence.
- Make bid/ask and spread visible for any entry-quality conclusion.
- Use volume and OI as separate measures.
- Color must not be the only indication of call/put, positive/negative or current/stale.

---

## 16. Collection schedules and rate limits

| Job/data | Configured frequency | Source/rate policy |
|---|---:|---|
| SmartAPI WebSocket ticks | event driven; archive sampled 1 second/token | max 3 connections; 1,000 token-mode subscriptions/connection |
| Best-five snapshot | 5 seconds | existing SNAPQUOTE stream |
| Instrument-state flush | 5 seconds | in-memory operational state |
| REST primary quotes | 60 seconds | bulk 50/request; 1 request/second |
| REST option quote rotation | 60 seconds | up to 500 rotating tokens/cycle |
| OI snapshots | 60 seconds | central REST/aggregate queue |
| Option Greeks | 60 seconds | 1 request/second; coalesced by underlying/expiry |
| PCR | 300 seconds | aggregate endpoint |
| Gainers/losers | 300 seconds | nearest-expiry aggregate endpoint |
| OI buildup | 300 seconds | nearest-expiry aggregate endpoint |
| SmartAPI stock-chain archive | 300 seconds | database join; no new per-contract call |
| WebSocket health | 60 seconds | local collector metric |
| NIFTY NSE chain watcher | 120 seconds | one warmed NSE option-chain request |
| F&O volatility service loop | 30 seconds | checks due stages; canonical DB inputs |
| Instrument master snapshot | daily/refresh-driven | SmartAPI master |
| Daily historical cash/index bars | 18:00 IST | lower-priority history queue |

Rate caps from current collector configuration:

- quote: 1 request/second, 500/minute, 5,000/hour;
- candles: 2 requests/second, 120/minute, 5,000/hour;
- Greeks: 1 request/second;
- aggregate APIs: 1 request/second, 60/minute, 1,000/hour.

No dashboard, n8n workflow or F&O service should create a second SmartAPI connection or perform one REST call per stock/contract.

---

## 17. Live PostgreSQL storage snapshot

The following is an observed snapshot, not a permanent capacity guarantee.

| Logical dataset | Approx. rows | Approx. storage | Earliest | Latest |
|---|---:|---:|---|---|
| `public.market_ticks` | 38.87 million | 28 GB | 10 Aug 2026 | 13 Aug 2026 10:38 UTC |
| `public.quote_snapshots` | 5.33 million | 11 GB | 8 Aug 2026 | 13 Aug 2026 14:02 UTC |
| `public.oi_snapshots_options` | 18.81 million | 10.05 GB | 8 Aug 2026 | 13 Aug 2026 14:02 UTC |
| `public.oi_snapshots_futures` | 3.02 million | 1.61 GB | 8 Aug 2026 | 13 Aug 2026 14:02 UTC |
| `public.depth_5_metrics` | 14.82 million | 3.79 GB | 10 Aug 2026 | 13 Aug 2026 14:02 UTC |
| `public.depth_5_snapshots` | 0.50 million planner estimate | 1.36 GB | 13 Aug 2026 | 13 Aug 2026 14:02 UTC |
| `public.option_greeks` | 52,305 | 34 MB | 11 May 2026 | 13 Aug 2026 14:02 UTC |
| `public.smartapi_option_chain_snapshots` | 305,943 | 169 MB | 11 Aug 2026 | 13 Aug 2026 10:07 UTC |
| `public.option_chain_snapshots` | about 1,890 | about 1.2 MB | 10 Aug 2026 | 13 Aug 2026 14:01 UTC |
| `public.option_chain_legs` | about 50,882 | 39 MB | linked to watcher snapshots | latest 13 Aug 2026 |
| `public.pcr_snapshots` | 1.36 million | not separately measured | 15 May 2026 | 13 Aug 2026 14:05 UTC |
| `public.gainers_losers_snapshots` | 23,658 | not separately measured | 15 May 2026 | 13 Aug 2026 14:02 UTC |
| `public.oibuildup_snapshots` | 24,251 | not separately measured | 15 May 2026 | 13 Aug 2026 14:02 UTC |

Planner estimates can differ from exact counts until `ANALYZE`. Partition parents often show zero bytes/rows; capacity is in monthly child partitions.

---

## 18. Freshness and quality rules

### 18.1 Independent states

Every UI should separate:

```text
Transport: CONNECTED | RECONNECTING | DISCONNECTED
Freshness: CURRENT | DELAYED | STALE | UNKNOWN
Readiness: READY | DEGRADED | INCOMPLETE | NO_DATA | RECOVERING | FAILED
```

### 18.2 Chain quality states

| State | Meaning |
|---|---|
| `FULL` | Required quote evidence is present and within freshness rules. |
| `QUOTE_STALE` | Quote exists but its source age exceeds the chain threshold. |
| `QUOTE_MISSING` | Contract has no usable quote. |
| `TWO_SIDED_QUOTE_MISSING` | Cannot form an executable midpoint/spread. |

### 18.3 Required checks before analytical use

- current effective instrument/token mapping;
- expiry has not passed and is the intended rank;
- quote belongs to the current session;
- source quote time, not only database insertion time, is fresh;
- both bid and ask are positive and not crossed for execution-quality analysis;
- OI and volume are not confused or carried as zero;
- enough strikes/rights exist for the calculation;
- model inputs and units are explicit;
- session phase is appropriate;
- sequence gaps have been reconciled;
- decision snapshot is not silently rewritten with current data.

### 18.4 Known current gaps

1. Broker Greeks were missing from the latest broad stock-chain snapshot; local Greeks supplied most coverage.
2. Latest broad stock-chain snapshot occurred at 15:37 IST, while other collector tables continued into the configured extended window. The UI must use per-module timestamps.
3. Legacy max-pain and equilibrium tables are stale from March 2026.
4. NIFTY watcher stores the focused current expiry/window, not every NIFTY expiry/strike.
5. SmartAPI stock chain currently selects the nearest planned expiry/window; it is not a full all-expiry chain.
6. Historical best-five depth and expired-chain data before archive activation cannot be recovered.
7. `catalog.option_contract_observation` exists but is not presently populated enough to be a source.
8. The current SmartAPI daily stock token plan includes 187 option underlyings, not every equity in the master.

---

## 19. Operational health and verification

### 19.1 Containers

Relevant running services:

- `trading-stack-novius2-collector-1`
- `trading-stack-novius2-option-chain-watcher-1`
- `trading-stack-novius2-fno-volatility-1`
- `trading-stack-novius2-market-data-gateway-1`
- `trading-stack-novius2-n50-dashboard-1`
- `trading-stack-novius2-postgres-1`

### 19.2 Safe database checks

```sql
-- Latest operational token state by type
SELECT i.instrumenttype,
       count(*) AS instruments,
       max(s.last_seen_ts) AS latest_seen
FROM public.instrument_state s
JOIN public.instruments i
  ON i.exchange = s.exchange AND i.symbol_token = s.symbol_token
WHERE i.instrumenttype IN ('FUTIDX','FUTSTK','OPTIDX','OPTSTK')
GROUP BY i.instrumenttype
ORDER BY i.instrumenttype;

-- Latest daily plan only
WITH latest AS (
  SELECT max(plan_date) AS plan_date
  FROM public.derivative_token_plan
)
SELECT contract_kind,
       count(*) AS contracts,
       count(DISTINCT underlying) AS underlyings,
       min(expiry) AS nearest_expiry,
       max(expiry) AS furthest_expiry,
       max(generated_at) AS generated_at
FROM public.derivative_token_plan p
JOIN latest l USING (plan_date)
WHERE active
GROUP BY contract_kind;

-- Latest broad stock-chain quality
WITH latest AS (
  SELECT max(ts) AS ts FROM public.smartapi_option_chain_snapshots
)
SELECT c.ts,
       count(*) AS contracts,
       count(DISTINCT underlying) AS underlyings,
       count(*) FILTER (WHERE bid > 0 AND ask >= bid) AS two_sided,
       count(*) FILTER (WHERE data_quality_status = 'FULL') AS full_rows,
       count(*) FILTER (WHERE data_quality_status = 'QUOTE_STALE') AS stale_rows,
       count(*) FILTER (WHERE coalesce(local_iv, broker_iv) > 0) AS greek_rows,
       max(quote_age_seconds) AS maximum_quote_age_seconds
FROM public.smartapi_option_chain_snapshots c
JOIN latest l USING (ts)
GROUP BY c.ts;

-- Latest NIFTY chain
SELECT s.id, s.captured_at, s.symbol, s.expiry_date,
       s.underlying_value, s.atm_strike,
       count(l.*) AS legs,
       count(*) FILTER (WHERE l.bid_price IS NOT NULL AND l.ask_price IS NOT NULL) AS two_sided_legs
FROM public.option_chain_snapshots s
LEFT JOIN public.option_chain_legs l ON l.snapshot_id = s.id
WHERE s.id = (SELECT id FROM public.option_chain_snapshots ORDER BY captured_at DESC LIMIT 1)
GROUP BY s.id;

-- Bid/ask sanity
SELECT count(*) FILTER (WHERE bid IS NULL OR ask IS NULL) AS missing_side,
       count(*) FILTER (WHERE bid > ask) AS crossed,
       count(*) FILTER (WHERE bid = 0 OR ask = 0) AS zero_side,
       max(ts) AS latest
FROM public.quote_snapshots
WHERE ts >= now() - interval '15 minutes'
  AND exchange IN ('NFO','BFO');

-- OI and volume freshness
SELECT 'options' AS family, max(ts) AS latest, count(*) AS rows
FROM public.oi_snapshots_options
WHERE ts >= now() - interval '15 minutes'
UNION ALL
SELECT 'futures', max(ts), count(*)
FROM public.oi_snapshots_futures
WHERE ts >= now() - interval '15 minutes';

-- F&O strategy runs and data gates
SELECT trade_date, stage, run_slot, status,
       requested_underlyings, evaluated_underlyings,
       shortlisted_underlyings, actionable_signals,
       source_quote_ts, completed_at, data_quality
FROM fno_volatility.signal_run
ORDER BY started_at DESC
LIMIT 20;

-- Detect stale legacy derived tables
SELECT 'max_pain' AS module, max(updated_at) AS data_as_of
FROM public.max_pain_summary
UNION ALL
SELECT 'equilibrium', max(updated_at)
FROM public.equilibrium_current_snapshot;
```

### 19.3 Service checks

```bash
curl -fsS http://127.0.0.1:19090/option-chain/healthz
curl -fsS http://127.0.0.1:19090/option-chain/readyz
curl -fsS http://127.0.0.1:19090/option-chain/api/latest
curl -fsS http://127.0.0.1:19090/n50/api/v1/options-intelligence/summary
curl -fsS http://127.0.0.1:19090/n50/api/v1/workspace/futures
```

Authenticated dashboard endpoints may return an authentication response when called without a valid session. That is expected and must not be bypassed.

### 19.4 Alert conditions

Alert operations when:

- collector or watcher readiness fails;
- NIFTY watcher has no successful poll for more than two expected intervals during market hours;
- current stock-chain snapshot age exceeds 15 minutes during its operating window;
- quote/OI coverage falls below the expected contract plan;
- crossed/zero markets materially increase;
- sequence gaps grow without recovery;
- option/futures tokens are missing for the latest plan;
- one-sided quotes prevent entry-quality evaluation;
- Greek coverage unexpectedly collapses;
- PostgreSQL partitions or retention jobs fail;
- F&O runs are `BLOCKED_DATA` or fail to complete at their due slots.

---

## 20. Data definitions and common mistakes

| Term | Correct meaning | Common error to avoid |
|---|---|---|
| LTP | Last traded price | Treating it as currently executable |
| Bid | Highest displayed buy price | Using it as entry price for a purchase |
| Ask | Lowest displayed sell price | Using it as exit price for a sale |
| Spread | Ask minus bid | Showing negative/crossed spread as valid |
| Volume | Contracts traded during the session | Treating it as outstanding contracts |
| OI | Outstanding open contracts | Treating it as day trading activity |
| OI change | Change in outstanding contracts | Assuming it identifies buyer/seller direction alone |
| PCR | Put OI divided by call OI for a defined expiry/universe | Showing one unlabeled global value |
| IV | Model-implied volatility | Presenting it as realized volatility |
| Delta/Gamma/Theta/Vega | Model sensitivities | Mixing source/local units or models |
| Depth imbalance | Relative best-five quantity imbalance | Claiming full order-book pressure |
| Basis | Futures minus spot | Calling positive basis a guaranteed bullish signal |
| Annualised basis | Basis scaled by DTE convention | Omitting DTE near expiry |
| Max pain | OI-based expiry payout calculation | Presenting a stale value as a prediction |
| Call/put wall | OI concentration | Treating it as guaranteed support/resistance |

---

## 21. Security and safety

- SmartAPI credentials are runtime secrets and must never be copied into this document, OpenAPI, UI payloads, logs or fixtures.
- The collector is the only SmartAPI client for the configured account/session.
- Dashboards and n8n must consume database/API outputs, not call SmartAPI directly.
- The F&O volatility service is `PAPER` only and `auto_submit` is false.
- No endpoint described here is authorization to place a live broker order.
- Raw source JSON can contain provider-specific data and should not be exposed without field whitelisting.
- Health/metrics logs must not contain credentials or full raw payloads at INFO.

During this review, runtime configuration inspection showed sensitive values are present in container environment variables. They are intentionally omitted here. Secret rotation and migration to the repository’s approved secret mechanism should be handled operationally without printing them.

---

## 22. Repository source map

### Collector and SmartAPI

- `cmd/collector/main.go`
- `cmd/collector/tasks.go`
- `cmd/collector/option_chain_archive.go`
- `cmd/collector/tick_archive.go`
- `cmd/collector/depth_snapshots.go`
- `internal/smartapi/rest_quote.go`
- `internal/smartapi/rest_option_greeks.go`
- `internal/smartapi/ws.go`
- `internal/smartapi/ws_manager.go`
- `internal/store/smartapi_archive.go`
- `internal/instruments/master.go`
- `internal/universe/derivatives.go`
- `config.example.yaml`
- `docs/SMARTAPI_RATE_SAFE_DATA_ARCHIVE.md`

### NIFTY option-chain watcher

- `services/option-chain-watcher/src/main.ts`
- `services/option-chain-watcher/src/config.ts`
- `services/option-chain-watcher/src/nseClient.ts`
- `services/option-chain-watcher/src/transform.ts`
- `services/option-chain-watcher/src/greeks.ts`
- `services/option-chain-watcher/src/store.ts`
- `services/option-chain-watcher/src/migrate.ts`
- `services/option-chain-watcher/README.md`

### F&O volatility/options intelligence

- `services/fno_volatility/config/policy.json`
- `services/fno_volatility/src/fno_volatility/model.py`
- `services/fno_volatility/src/fno_volatility/service.py`
- `services/fno_volatility/sql/001_fno_volatility.sql`
- `neon-stock-terminal/apps/api/src/routes/fnoVolatility.ts`
- `neon-stock-terminal/apps/web/src/pages/FnoVolatilityPage.tsx`
- `neon-stock-terminal/apps/web/src/pages/OptionsIntelligencePage.tsx`

### NIFTY structure/futures UI and APIs

- `neon-stock-terminal/apps/api/src/routes/analyticsOptionsStructure.ts`
- `neon-stock-terminal/apps/api/src/routes/workspace.ts`
- `neon-stock-terminal/apps/web/src/pages/AnalyticsOptionsStructurePage.tsx`
- `neon-stock-terminal/apps/web/src/pages/AnalyticsOptionsPage.tsx`
- `neon-stock-terminal/apps/web/src/pages/WorkspacePages.tsx`

### Existing contract documentation

- `neon-stock-terminal/docs/options/data-model.md`
- `neon-stock-terminal/docs/options/runbook.md`
- `docs/options-intelligence/OPTIONS_INTELLIGENCE_IMPLEMENTATION_2026-08-11.md`
- `docs/database/POSTGRES_COMPLETE_SCHEMA_AND_FRESHNESS_2026-08-12.md`
- `/home/novius2/NIFTY50/backend-openapi-documentation-2026-08-13/services/option-chain-watcher.openapi.yaml`
- `/home/novius2/NIFTY50/backend-openapi-documentation-2026-08-13/services/dashboard-api.openapi.yaml`

---

## 23. Completion statement

The deployed estate currently collects meaningful derivatives data for both NIFTY and stock F&O: token/contract metadata, futures and options prices, OHLC, volume, OI, best bid/ask, best-five depth, liquidity metrics, local Greeks, PCR/aggregate snapshots and paper-only option-candidate evidence. It does **not** provide a recoverable pre-deployment historical depth/full-chain archive, full market-by-order queue information or universally current broker Greeks.

The most important operational distinction is:

```text
NIFTY current-expiry exchange-chain evidence
  !=
SmartAPI broad stock-option monitoring archive
  !=
F&O strategy candidate/decision records
  !=
daily participant/FII derivatives reports
```

Every consumer must carry the source, contract identity, expiry, data-as-of time and quality state so these datasets are not blended into a misleading “current derivatives” badge.
