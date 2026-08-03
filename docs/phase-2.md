You are an expert Go engineer extending an existing Go repo (Phase-1 SmartAPI collector) into PHASE 2. The Phase-1 repository already supports:
- config YAML
- Dockerfile + docker-compose with Postgres
- instrument master download/cache + instruments table
- CSV NIFTY100 equity token resolution
- WebSocket subscription for equities/indices in LTP mode
- 1-minute OHLCV aggregation and bars_1m upserts
- watermarks table
- health endpoint

PHASE 2 objective:
Add robust, rate-limit-safe support for Futures & Options (F&O), option greeks, quote/OI/PCR snapshots, and a daily history loader (3 years for equities + indices only). 1-minute bars are WS-primary; when WebSocket is down or stale, use REST candle fallback for equities + indices only. Keep the service Dockerized, single-instance, crash-tolerant, and compatible with any Postgres DB.

Safety requirement:
- Live trading must remain disabled. `smartapi.disable_live_orders` must stay true and any order/GTT endpoints must be blocked.

########################################
# MUST-HAVE PHASE 2 FEATURES (BUILD ALL)
########################################

1) Universe expansion: Futures & Options resolution
- Use the already-loaded OpenAPIScripMaster.json instrument master and DB instruments table.
- From the NIFTY100 equity underlyings list, detect which underlyings have F&O by checking NFO instruments:
  - FUTSTK and OPTSTK for stock underlyings
  - FUTIDX and OPTIDX for index underlyings (NIFTY50, BANKNIFTY)
- Resolve and subscribe:
  A) Stock futures (NFO FUTSTK): nearest expiry (rank configurable)
  B) Index futures (NFO FUTIDX): nearest expiry
  C) Index options (NFO OPTIDX): nearest expiry (weekly) + strikes around ATM
  D) Stock options (NFO OPTSTK): nearest expiry available (monthly-like) + strikes around ATM
- Enforce current-month only for all F&O instruments (skip expiries outside the current calendar month).
- IMPORTANT: Must not explode subscriptions. Provide config caps and enforce them deterministically.

2) Dynamic strike selection and refresh
- Determine ATM strike using latest underlying price:
  - Primary: last known LTP from WebSocket ticks for that underlying
  - Fallback: REST quote snapshot for underlying token
- Infer strike step automatically:
  - Collect all strikes for the underlying+expiry+right; sort unique strikes; compute diffs; pick the most common diff as step.
- Select strikes:
  - from (ATM - strikes_each_side*step) to (ATM + strikes_each_side*step)
  - include BOTH CE and PE for each strike
- Refresh strike list:
  - every strike_refresh_minutes
  - OR if ATM moves by >= atm_shift_rebuild_steps * step since last build
- On refresh:
  - update subscriptions table (activate new tokens, deactivate removed tokens)
  - apply websocket subscribe/unsubscribe changes live without restarting

3) Multiple WebSocket connections (sharding)
- SmartAPI allows up to 3 websocket connections per client code; each connection supports up to ~1000 token subscriptions per session; token+mode counts.
- Implement a WS manager that can maintain up to ws.max_connections (default 3).
- Partition active subscriptions across WS connections:
  - Each subscription is (exchange, token, mode)
  - Use deterministic sharding:
     - connection 0: equities + indices + futures in LTP (or configured)
     - connection 1: options in QUOTE or SNAPQUOTE (configurable)
     - connection 2: overflow / reserved
  - Ensure each connection stays <= ws.max_tokens_per_connection (default 1000)
- If still over capacity:
  - enforce priority order (highest to lowest):
    1) indices
    2) equities
    3) futures
    4) index options
    5) stock options
  - drop lowest priority subscriptions deterministically (log warning + persist dropped list in DB field active=false)

4) REST job system (queue + workers) with per-endpoint adaptive rate limiter
Implement an in-memory job queue with:
- Per-endpoint limiters:
  - Quote snapshots limiter: max 1 rps, max 50 symbols per request
  - Candles limiter: max 3 rps AND rolling 5000/hour cap
  - OptionGreeks limiter: configurable rps (start with 1 rps) and adaptive
  - Market aggregates limiter: low RPS (default 1) with per-minute/hour caps
- Adaptive limiter behavior MUST match:
  - NO exponential backoff for throttling
  - On throttle (HTTP 429 OR HTTP 403 with message indicating rate limit):
     - pause 1s and reduce RPS by 1 step down to min_rps
     - if throttled again, pause 2s (cap at 2s); keep min_rps=1
  - If stable for adaptive_step_up_after_seconds (e.g., 5s), increase RPS by 1 until max
- Rolling hourly cap for candles:
  - Track request timestamps in memory (ring buffer) to enforce <=5000/hour
  - If cap reached, delay candle jobs until cap window clears

5) REST Quote snapshots (bulk)
- Every quote_snapshot_interval_seconds:
  - Fetch quote snapshots in bulk for:
    - all equities + indices + futures
    - options snapshots optional (config), default off to avoid huge load
  - Chunk tokens into batches of <=50
  - Respect quote limiter 1 rps
- Store results into quote_snapshots table (JSON raw + selected normalized columns).
 - Add rotation budget for secondary kinds (FUT/OPT/large index sets) so REST-only
   snapshots remain responsive under rate limits.

6) OI snapshots (dedicated tables by type)
- Capture OI wherever SmartAPI exposes it (QUOTE/SNAPQUOTE/option chain responses).
- Store into dedicated tables per type (equity/index/futures/options). Do not combine with bars or quote snapshots.

7) PCR/OCR snapshots (if SmartAPI exposes, else derive PCR from option OI)
- PCR is computed per underlying + expiry using CE/PE OI totals from current-month options.
- Store into a dedicated pcr_snapshots table (one row per underlying+expiry per interval) with raw JSON.

7b) Market aggregates (REST)
- Capture SmartAPI market aggregates:
  - gainersLosers
  - OIBuildup
  - putCallRatio
- Store each response into dedicated tables (no mixing with other snapshots).
  Payloads are config-driven to match SmartAPI request schema.

8) Option Greeks snapshots
- Every option_greeks_interval_seconds:
  - For each configured underlying (e.g., NIFTY50, BANKNIFTY, optionally selected stocks) and selected expiry:
    - call optionGreek endpoint
    - store greeks rows into option_greeks table with ts + raw JSON (including tradeVolume)
- If endpoint requires expiry date and underlying name, build those from instrument master.
- Use limiter for greeks calls.

8b) Max pain snapshots (options OI-based)
- Compute max pain for configured underlyings using latest options OI snapshots + instrument metadata.
- Inputs:
  - `oi_snapshots_options` (latest OI per option token)
  - `instruments` (strike, expiry, right/CE/PE)
  - `instrument_state` (latest underlying price)
- Algorithm (per underlying + expiry):
  - Use the most recent OI snapshot per option token within max_data_staleness_minutes.
  - For each strike, aggregate CE/PE OI totals.
  - For each candidate strike S:
    - call_pain = sum(ce_oi * max(0, spot_price - strike))
    - put_pain  = sum(pe_oi * max(0, strike - spot_price))
    - total_pain = call_pain + put_pain
  - Max pain strike is the strike with the minimum total_pain.
- Schedule:
  - run every max_pain.run_interval_seconds during market hours
  - if run_outside_market_hours is true, allow execution but skip if OI data is stale
- Store results into dedicated tables (max_pain_runs, max_pain_levels, max_pain_summary).
- Optional alerts:
  - send a webhook when max pain changes (title_prefix: "max_pain").

9) Daily history loader (equities + indices only, 3 years)
- Load daily candles via REST historical endpoint using interval ONE_DAY.
- Scope: equities + indices only. Do NOT load daily history for futures/options.
- Range: last 3 years (rolling), chunked into configurable windows (e.g., 365 days per request).
- Schedule: run once on startup and then daily after market close (IST).
- Store into bars_1d with source='rest' using ON CONFLICT DO UPDATE.

10) Intraday retention cleanup (90-day rolling window)
- Periodically delete intraday data older than retention.intraday_days.
- Apply to: bars_1m, quote_snapshots, oi_snapshots_* tables, pcr_snapshots, option_greeks,
  gainers_losers_snapshots, oibuildup_snapshots, putcallratio_snapshots.
- Do NOT delete bars_1d (kept for 3-year history).

11) Data model updates + migrations
Add new tables and columns (CREATE TABLE IF NOT EXISTS) under schema:

A) Extend subscriptions table:
- add columns if not exists:
  - underlying TEXT NULL
  - expiry DATE NULL
  - strike NUMERIC NULL
  - right TEXT NULL   # CE/PE
  - instrumenttype TEXT NULL
  - priority INT NOT NULL DEFAULT 100
  - reason TEXT NULL

B) quote_snapshots (if not exists)
- ts TIMESTAMPTZ NOT NULL
- exchange TEXT NOT NULL
- symbol_token TEXT NOT NULL
- ltp NUMERIC NULL
- open NUMERIC NULL
- high NUMERIC NULL
- low NUMERIC NULL
- close NUMERIC NULL
- volume BIGINT NULL
- oi BIGINT NULL
- bid NUMERIC NULL
- ask NUMERIC NULL
- bid_qty BIGINT NULL
- ask_qty BIGINT NULL
- raw JSONB NOT NULL
PRIMARY KEY (ts, exchange, symbol_token)

C) oi_snapshots_equity / oi_snapshots_index / oi_snapshots_futures / oi_snapshots_options (if not exists)
- ts TIMESTAMPTZ NOT NULL
- exchange TEXT NOT NULL
- symbol_token TEXT NOT NULL
- oi BIGINT NULL
- oi_change BIGINT NULL
- oi_change_pct NUMERIC NULL
- raw JSONB NOT NULL
PRIMARY KEY (ts, exchange, symbol_token)

D) pcr_snapshots (if not exists)
- ts TIMESTAMPTZ NOT NULL
- underlying TEXT NOT NULL
- expiry DATE NOT NULL
- pcr NUMERIC NULL
- ce_oi BIGINT NULL
- pe_oi BIGINT NULL
- raw JSONB NOT NULL
PRIMARY KEY (ts, underlying, expiry)

E) option_greeks (if not exists)
- ts TIMESTAMPTZ NOT NULL
- underlying TEXT NOT NULL
- expiry DATE NOT NULL
- tradingsymbol TEXT NOT NULL
- strike NUMERIC NULL
- right TEXT NULL
- iv NUMERIC NULL
- delta NUMERIC NULL
- gamma NUMERIC NULL
- theta NUMERIC NULL
- vega NUMERIC NULL
- ltp NUMERIC NULL
- trade_volume NUMERIC NULL
- raw JSONB NOT NULL
PRIMARY KEY (ts, tradingsymbol)

F) bars_1d (if not exists)
- trade_date DATE NOT NULL
- exchange TEXT NOT NULL
- symbol_token TEXT NOT NULL
- open NUMERIC NOT NULL
- high NUMERIC NOT NULL
- low NUMERIC NOT NULL
- close NUMERIC NOT NULL
- volume BIGINT NOT NULL DEFAULT 0
- source TEXT NOT NULL DEFAULT 'rest'
- created_at TIMESTAMPTZ NOT NULL DEFAULT now()
PRIMARY KEY (trade_date, exchange, symbol_token)

G) gainers_losers_snapshots (if not exists)
- ts TIMESTAMPTZ NOT NULL
- exchange TEXT NOT NULL
- label TEXT NOT NULL
- params JSONB NOT NULL
- raw JSONB NOT NULL
PRIMARY KEY (ts, exchange, label)

H) oibuildup_snapshots (if not exists)
- ts TIMESTAMPTZ NOT NULL
- exchange TEXT NOT NULL
- label TEXT NOT NULL
- params JSONB NOT NULL
- raw JSONB NOT NULL
PRIMARY KEY (ts, exchange, label)

I) putcallratio_snapshots (if not exists)
- ts TIMESTAMPTZ NOT NULL
- label TEXT NOT NULL
- params JSONB NOT NULL
- raw JSONB NOT NULL
PRIMARY KEY (ts, label)

J) max_pain_runs (if not exists)
- run_id TEXT PRIMARY KEY
- started_at TIMESTAMPTZ NOT NULL
- finished_at TIMESTAMPTZ NULL
- underlying TEXT NOT NULL
- expiry DATE NOT NULL
- spot_price NUMERIC NULL
- strike_count INT NOT NULL DEFAULT 0
- option_count INT NOT NULL DEFAULT 0
- status TEXT NOT NULL DEFAULT 'running'
- error TEXT NULL

K) max_pain_levels (if not exists)
- run_id TEXT NOT NULL
- underlying TEXT NOT NULL
- expiry DATE NOT NULL
- strike NUMERIC NOT NULL
- ce_oi BIGINT NULL
- pe_oi BIGINT NULL
- ce_pain NUMERIC NULL
- pe_pain NUMERIC NULL
- total_pain NUMERIC NULL
- PRIMARY KEY (run_id, strike)

L) max_pain_summary (if not exists)
- underlying TEXT NOT NULL
- expiry DATE NOT NULL
- max_pain_strike NUMERIC NULL
- total_pain NUMERIC NULL
- ce_oi BIGINT NULL
- pe_oi BIGINT NULL
- spot_price NUMERIC NULL
- updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
- PRIMARY KEY (underlying, expiry)

11) Update README + docker-compose
- Update config.example.yaml to include all Phase-2 sections.
- Update docker-compose.yml to mount ./state and expose health port.
- Provide a second compose override example enabling option greeks and options subscriptions.
- Ensure tzdata present in runtime container.

########################################
# UPDATED CONFIG (YAML) - ADD THESE KEYS
########################################
Add/extend config.example.yaml with:

universe:
  equities_exchange: "NSE"
  derivatives_exchange: "NFO"
  include_indices: ["NIFTY50","BANKNIFTY"]
  fno_current_month_only: true
  futures:
    enable_stock_futures: true
    enable_index_futures: true
    expiry_rank: 0
  options:
    enable_index_options: true
    enable_stock_options: true
    index_underlyings: ["NIFTY50","BANKNIFTY"]
    stock_underlyings_max: 15
    expiry_rank_index: 0
    expiry_rank_stock: 0
    strikes_each_side: 10
    strike_refresh_minutes: 5
    atm_shift_rebuild_steps: 2

ws:
  max_connections: 3
  max_tokens_per_connection: 1000
  mode_equities: "LTP"
  mode_indices: "LTP"
  mode_futures: "LTP"
  mode_options: "QUOTE"          # QUOTE or SNAPQUOTE
  max_reconnect_backoff_seconds: 30

rest_tasks:
  enable_quote_snapshots: true
  quote_snapshot_interval_seconds: 60
  quote_snapshot_include_options: false
  quote_snapshot_primary_kinds: ["EQUITY","INDEX"]
  quote_snapshot_rotation_max_tokens: 200
  enable_option_quote_snapshots: false
  option_quote_snapshot_interval_seconds: 600
  option_quote_snapshot_rotation_max_tokens: 300
  enable_option_greeks: true
  option_greeks_interval_seconds: 60
  option_greeks_underlyings: ["NIFTY50","BANKNIFTY"]
  enable_oi_snapshots: true
  oi_snapshot_interval_seconds: 60
  enable_pcr_snapshots: true
  pcr_snapshot_interval_seconds: 300
  enable_gainers_losers: true
  gainers_losers_interval_seconds: 300
  gainers_losers_payloads:
    - datatype: "PercPriceGainers"
      expirytype: "NEAR"
    - datatype: "PercPriceLosers"
      expirytype: "NEAR"
  enable_oi_buildup: true
  oi_buildup_interval_seconds: 300
  oi_buildup_payloads:
    - datatype: "Long Built Up"
      expirytype: "NEAR"
    - datatype: "Short Built Up"
      expirytype: "NEAR"
  enable_put_call_ratio: true
  put_call_ratio_interval_seconds: 300
  enable_rest_fallback: true
  rest_fallback_interval_seconds: 60
  rest_fallback_stale_seconds: 90
  rest_fallback_lookback_minutes: 2

  # If an explicit expiry date is provided and is on/before today (IST),
  # the collector will auto-roll to expirytype=NEAR on expiry days.

max_pain:
  enable: true
  run_interval_seconds: 300
  run_outside_market_hours: false
  underlyings: ["NIFTY50","BANKNIFTY"]
  expiry_ranks: [0]
  max_data_staleness_minutes: 10
  alerts:
    enable_webhook: true
    webhook_url: "https://n8ncloud.digii4.co.in/webhook/master-post-request"
    webhook_timeout_seconds: 5
    webhook_headers:
      Authorization: "Basic YWRtaW46YWRtaW4xMjM0"
    title_prefix: "max_pain"
    max_per_run: 5

history:
  enable_daily: true
  daily_years: 3
  daily_chunk_days: 365
  daily_run_time_ist: "18:00"
  track_kinds: ["EQUITY","INDEX"]

limits:
  quote_rps: 1
  quote_per_minute_cap: 500
  quote_per_hour_cap: 5000
  quote_max_symbols_per_request: 50
  candles_rps: 3
  candles_per_hour_cap: 5000
  greeks_rps: 1
  aggregates_rps: 1
  aggregates_per_minute_cap: 60
  aggregates_per_hour_cap: 1000
  adaptive_min_rps: 1
  adaptive_step_up_after_seconds: 5

retention:
  enable_cleanup: true
  intraday_days: 90
  cleanup_run_time_ist: "18:30"

########################################
# IMPLEMENTATION DETAILS & EXPECTATIONS
########################################

A) Instrument classification
Implement robust instrumenttype detection:
- EQUITY: exchange NSE and instrumenttype EQ (or tradingsymbol ends with -EQ)
- INDEX: NSE index tokens for NIFTY50/BANKNIFTY using name/tradingsymbol heuristics
- FUT: NFO instrumenttype FUTSTK / FUTIDX
- OPT: NFO instrumenttype OPTSTK / OPTIDX with CE/PE inferred from symbol/tradingsymbol and/or optiontype field if present
- Enforce current-month-only expiry filtering for all derivatives.

B) Deterministic priority
Assign priority ints:
- INDEX: 10
- EQUITY: 20
- FUT: 30
- OPTIDX: 40
- OPTSTK: 50
Use this priority in subscription capacity enforcement and in shard partition.

C) WebSocket subscription delta updates
Implement subscription reconciliation loop:
- periodically (every 30s) load desired active subscriptions from DB
- compare with currently subscribed set per connection
- call subscribe/unsubscribe accordingly
- maintain thread-safe maps

D) Minute bar aggregation improvements
- Support OI if websocket tick contains it (store oi as BIGINT nullable in bars_1m; if schema already created without oi from Phase-1, add ALTER TABLE to add oi BIGINT NULL).
- If QUOTE mode provides volume cumulative, derive minute volume; else fallback sum qty.
- 1-minute data comes from WebSocket when connected; use REST candle fallback only for equities + indices when WebSocket is stale.
- Continue idempotent upserts.

E) REST error handling
- Treat network errors and 5xx as retryable with short delay (e.g., 1s) but DO NOT use exponential for throttles.
- For throttles, use adaptive limiter logic.

F) Tests to add
- Strike step inference test
- ATM rounding test
- Option token resolution test from a mocked master list
- Subscription capacity enforcement and deterministic dropping
- Rolling hourly cap logic for candles
- PCR computation from OI snapshots
- Daily history chunking (3-year pull)
- Daily history chunking (3-year pull)

########################################
# DELIVERABLES
########################################
Update existing repo with:
- new/updated Go code implementing all Phase-2 features
- updated config.example.yaml
- updated docker-compose.yml
- updated migrations
- updated README describing:
  - how to enable futures/options
  - how to cap subscriptions safely
  - rate-limit behavior
  - daily history behavior
- ensure `docker compose up --build` works

Now implement PHASE 2 in the repository.
