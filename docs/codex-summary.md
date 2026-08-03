Historical implementation brief.

Last reviewed: 2026-03-31

This file is preserved as an earlier agent/build prompt and is not a current-state architecture or operations document.

Use these instead for live system shape:

- [Source of truth](./SOURCE_OF_TRUTH.md)
- [Current architecture](./ARCHITECTURE_CURRENT.md)
- [Current stack inventory](./stack-current.md)
- [Endpoints reference](./endpoints.md)

---

You are an expert Go engineer building a production-grade market-data collector for Angel One SmartAPI (SmartAPI). Build a standalone Go service that runs in Docker and stores data into ANY Postgres database given credentials via config. The service will ingest NIFTY100 equity symbols from a CSV file, resolve SmartAPI tokens using the OpenAPI Scrip Master JSON, subscribe via SmartAPI WebSocket, build 1-minute OHLCV(+OI where available) bars, and store the results in Postgres with idempotent upserts. It must also resolve and optionally subscribe to related F&O instruments (stock futures, index futures, index options, stock options) based on configurable rules (nearest expiry, strike selection around ATM). Use REST only where needed and obey rate limits with a smart adaptive limiter (no exponential backoff; degrade for short cooldowns and step back up when stable).

### Overrides (2026-01-11)
- 1-minute data is WebSocket-primary; REST fallback runs for equities + indices when WebSocket is stale (no full backfill).
- Daily history loader: 3 years, equities + indices only.
- F&O limited to current-month expiries only.
- Use NIFTY50 naming for index underlyings and tokens.
- PCR/OI snapshots must be stored in dedicated tables per type (do not mix with bars/quotes).
- Intraday retention: delete data older than 90 days for bars_1m and snapshots (bars_1d retained).
- REST market aggregates (gainers/losers, OI buildup, putCallRatio) are captured into dedicated tables.
- REST quote snapshots support a rotation budget for secondary kinds to stay responsive under rate limits.

### Hard constraints & assumptions
- Single instance process.
- In-memory queues are fine, but system must be crash-tolerant via database watermarks and backfill.
- “Multiple programs” are NOT part of this build; this single service owns all SmartAPI calls and DB writes.
- Primary data plane is WebSocket streaming. REST is secondary (snapshots/backfill/greeks).
- Universe: NIFTY100 equities from a user-provided CSV file (path in config).
- Must be robust: reconnection logic, graceful shutdown, idempotent writes, REST fallback when WebSocket is stale.
- Timezone: Asia/Kolkata for minute boundaries (store timestamps as timestamptz in UTC, but align minute buckets using IST).

### Inputs
1) config YAML file (path passed by CLI flag --config)
2) CSV file of symbols (path in config). CSV may have header and may use columns like:
   - symbol (e.g., RELIANCE, INFY)
   - tradingsymbol (e.g., RELIANCE-EQ)
   Program must accept either: take first non-empty column value per row; strip spaces; upper-case.
3) Postgres connection info in config.

### SmartAPI resources to use
- Instrument master JSON (download at startup and daily refresh; cache to disk):
  https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json
- SmartAPI REST base URL configurable (default https://apiconnect.angelone.in)
- SmartAPI WebSocket endpoint configurable (default wss://smartapisocket.angelone.in/smart-stream)
- REST quote endpoint: bulk up to 50 symbols per request; rate limit 1 request/sec for quote.
- Historical candle endpoint: 3/sec, 180/min, 5000/hour (use only for gap backfill; enforce 5000/hour rolling cap).
- WebSocket subscription constraints: plan for up to 1000 token subscriptions per websocket session and up to 3 connections.

### What data to pull/store (must support)
A) Live trading / intraday:
- Ticks from WebSocket for:
  - NIFTY100 equities (NSE cash)
  - NIFTY index token (and optional BANKNIFTY) if enabled
  - Stock futures for NIFTY100 stocks that have F&O (NFO)
  - Index futures (NFO) if enabled
  - Index options strikes around ATM for nearest expiry if enabled
  - Stock options strikes around ATM for nearest expiry if enabled (but keep within subscription quotas; config must cap how many underlyings/strikes)
- Build and store 1-minute bars from ticks:
  - open/high/low/close
  - volume (derive from cumulative if only cumulative provided; else sum qty)
  - oi (store last OI in minute if provided)
  - vwap/avg traded price if available (optional)
- Store a minute-end snapshot record for selected instruments (optional): LTP, bid/ask, depth (if feed mode provides).

B) Helpful algo trading info:
- Store instrument metadata for all resolved instruments (equity/index/fut/opt).
- Store subscription inventory (what tokens are being tracked, why, expiry/strike/right).
- Optional: call Option Greeks REST endpoint (/marketData/v1/optionGreek) per minute for NIFTY (and optionally selected stocks), store greeks snapshot by strike/right.
- REST fallback: fetch recent 1-minute candles for equities + indices only when WebSocket is stale, respecting candle rate limits.

### Deliverables
Produce a complete repository with:
- Go source code with clean module structure
- Dockerfile
- docker-compose.yml example for local Postgres
- Sample config file: config.example.yaml
- SQL migrations or auto-migration code that creates tables if missing
- README with run instructions

### Required Go packages / tech choices
- Go 1.22+
- HTTP: net/http with proper timeouts
- WebSocket: gorilla/websocket
- Postgres: pgx/v5 + pgxpool
- YAML: gopkg.in/yaml.v3
- CSV: encoding/csv
- TOTP (if needed for login): github.com/pquerna/otp/totp
- Logging: zap OR slog (choose one)
- Use context cancellation and errgroup for goroutines.
- Use monotonic clock timers for rate limiting (time.Now is OK but use time.Since patterns where possible).

### Code structure (recommended)
cmd/collector/main.go
internal/config/...
internal/smartapi/rest.go
internal/smartapi/ws.go
internal/instruments/master.go
internal/universe/builder.go
internal/ratelimit/adaptive.go
internal/aggregate/minute.go
internal/store/postgres.go
internal/store/migrations.go
internal/backfill/candles.go
internal/util/timebucket.go

### Config file requirements (YAML)
Create config struct + example file. MUST include:
smartapi:
  api_key: "..."
  client_code: "..."
  password: "..."
  totp_secret: "BASE32..."        # optional; if empty, allow access_token/feed_token
  access_token: ""               # optional: reuse session if provided
  refresh_token: ""              # optional
  feed_token: ""                 # optional
  rest_base_url: "https://apiconnect.angelone.in"
  ws_url: "wss://smartapisocket.angelone.in/smart-stream"
postgres:
  host: "localhost"
  port: 5432
  user: "postgres"
  password: "postgres"
  database: "marketdata"
  sslmode: "disable"
  schema: "public"
  app_name: "nifty100_collector"
runtime:
  timezone: "Asia/Kolkata"
  log_level: "info"
  http_timeout_seconds: 15
  flush_seconds: 2                      # flush bars after minute boundary + this delay
files:
  symbols_csv_path: "./nifty100.csv"
  instrument_cache_path: "./state/OpenAPIScripMaster.json"
universe:
  include_indices:
    - "NIFTY"         # resolve token from master (heuristic matching)
    - "BANKNIFTY"     # optional
  equities_exchange: "NSE"
  derivatives_exchange: "NFO"
  # Futures selection
  futures:
    enable_stock_futures: true
    enable_index_futures: true
    expiry_rank: 0                   # 0 = nearest future expiry
  # Options selection (must be capped to respect websocket subscription limits)
  options:
    enable_index_options: true
    enable_stock_options: true
    index_underlyings: ["NIFTY","BANKNIFTY"]
    stock_underlyings_max: 15        # IMPORTANT: cap, because NIFTY100 * full chain is too large
    expiry_rank_index: 0             # nearest expiry (weekly)
    expiry_rank_stock: 0             # nearest expiry (monthly for stock; pick nearest available)
    strikes_each_side: 10            # ATM +/- this many strikes
    strike_refresh_minutes: 5        # refresh option strikes list periodically
    atm_shift_rebuild_steps: 2       # rebuild strikes if ATM moves >= N strike steps
  ws_modes:
    equities: "LTP"                  # LTP or QUOTE or SNAPQUOTE
    futures: "LTP"
    options: "QUOTE"                 # options usually need QUOTE/SNAPQUOTE for OI/depth if required
    indices: "LTP"
rest_tasks:
  enable_quote_snapshots: true
  quote_snapshot_interval_seconds: 60
  quote_snapshot_include_options: false
  enable_option_quote_snapshots: false
  option_quote_snapshot_interval_seconds: 600
  enable_option_greeks: true
  option_greeks_interval_seconds: 60
  option_greeks_underlyings: ["NIFTY","BANKNIFTY"]   # optionally add some stocks
limits:
  quote_rps: 1
  quote_per_minute_cap: 500
  quote_per_hour_cap: 5000
  quote_max_symbols_per_request: 50
  candles_rps: 3
  candles_per_hour_cap: 5000
  adaptive_step_up_after_seconds: 5
  adaptive_min_rps: 1

Secrets: allow overriding smartapi.password, smartapi.totp_secret, postgres.password via ENV vars:
SMARTAPI_PASSWORD, SMARTAPI_TOTP_SECRET, POSTGRES_PASSWORD, etc.

### Database schema (auto-create if missing)
Implement migrations (CREATE TABLE IF NOT EXISTS) under the configured schema.

Tables (minimum):
1) instruments
- exchange TEXT NOT NULL
- symbol_token TEXT NOT NULL
- tradingsymbol TEXT NOT NULL
- name TEXT NULL
- instrumenttype TEXT NULL
- expiry DATE NULL
- strike NUMERIC NULL
- lotsize INT NULL
- tick_size NUMERIC NULL
- raw JSONB NOT NULL
- updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
PRIMARY KEY (exchange, symbol_token)
Index (tradingsymbol), (name), (instrumenttype), (expiry)

2) universe_underlyings
- underlying TEXT PRIMARY KEY
- equity_exchange TEXT NOT NULL
- equity_token TEXT NOT NULL
- is_index BOOLEAN NOT NULL DEFAULT false
- is_fno BOOLEAN NOT NULL DEFAULT false
- created_at TIMESTAMPTZ NOT NULL DEFAULT now()

3) subscriptions
- exchange TEXT NOT NULL
- symbol_token TEXT NOT NULL
- mode TEXT NOT NULL         # LTP/QUOTE/SNAPQUOTE
- kind TEXT NOT NULL         # EQUITY/INDEX/FUT/OPT
- underlying TEXT NULL
- expiry DATE NULL
- strike NUMERIC NULL
- right TEXT NULL            # CE/PE
- active BOOLEAN NOT NULL DEFAULT true
- updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
PRIMARY KEY (exchange, symbol_token, mode)

4) bars_1m
- ts TIMESTAMPTZ NOT NULL             # minute start in UTC
- exchange TEXT NOT NULL
- symbol_token TEXT NOT NULL
- open NUMERIC NOT NULL
- high NUMERIC NOT NULL
- low NUMERIC NOT NULL
- close NUMERIC NOT NULL
- volume BIGINT NOT NULL DEFAULT 0
- oi BIGINT NULL
- source TEXT NOT NULL DEFAULT 'ws'   # ws|rest|backfill
- created_at TIMESTAMPTZ NOT NULL DEFAULT now()
PRIMARY KEY (ts, exchange, symbol_token)
Index (symbol_token, ts DESC)

5) quote_snapshots (optional, if enabled)
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

6) option_greeks (optional, if enabled)
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
- raw JSONB NOT NULL
PRIMARY KEY (ts, tradingsymbol)

7) watermarks
- exchange TEXT NOT NULL
- symbol_token TEXT NOT NULL
- last_completed_minute TIMESTAMPTZ NOT NULL
- updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
PRIMARY KEY (exchange, symbol_token)

### Instrument resolution logic (critical)
- At startup, load instrument master JSON (download if cache missing or older than 24h).
- Parse it into a struct containing at least: exch_seg (exchange), symbol, name, token, expiry, strike, lotsize, instrumenttype.
- Insert/Upsert all rows into instruments table.
- Build in-memory indexes:
  - (exchange, tradingsymbol) -> instrument
  - (exchange, name, instrumenttype, expiry, strike, right) -> instrument
  - group by underlying name -> list of derivatives
- From CSV equities list:
  - Find NSE equity instrument row. Prefer instrumenttype == "EQ" (or equivalent); fallback heuristics:
    - exchange == "NSE" and tradingsymbol matches symbol or symbol+"-EQ"
  - Save in universe_underlyings.
- Determine if stock has F&O:
  - Look for any NFO rows with instrumenttype FUTSTK/OPTSTK and name==underlying; if found is_fno=true.
- Resolve indices:
  - For each configured index name (NIFTY, BANKNIFTY), locate NSE index token by heuristics (instrumenttype may differ). If multiple matches, prefer the one with tradingsymbol containing the exact index name.
- Resolve futures:
  - For each underlying with F&O, pick NFO FUTSTK with nearest expiry >= today (expiry_rank selects nth future expiry).
  - For indices, pick FUTIDX similarly.
- Resolve options:
  - For each enabled underlying:
    - pick expiry: nearest for index (weekly) and nearest for stock (monthly, but choose nearest available if monthly not flagged).
    - determine ATM strike:
       - initially use latest LTP (from websocket once first ticks arrive; until then use REST quote snapshot for underlying token).
       - compute strike step: infer from available strikes (sort unique strikes; take most common diff).
       - atm_strike = round_to_nearest_step(ltp)
    - select strikes: atm +/- strikes_each_side * step.
    - for each strike, resolve both CE and PE tokens (OPTIDX or OPTSTK depending).
- Must keep websocket subscription within limits:
  - compute total tokens*mode; if exceed, reduce stock options underlyings according to a deterministic priority:
    - indices first, then stock futures, then equities, then stock options.
    - for stock options, keep only top N underlyings (config stock_underlyings_max) in the same order as CSV (or by configurable priority list).
- Store resolved subscriptions into subscriptions table.

### WebSocket ingestion
- Implement ws client:
  - connect using feed token/auth per SmartAPI docs
  - subscribe to tokens with mode per config (LTP/QUOTE/SNAPQUOTE).
  - parse incoming messages; normalize into Tick struct:
    Tick{ts, exchange, token, ltp, last_traded_qty, avg_price, vol_cum, oi, depth_best_bid/ask, ... raw}
  - handle reconnect with exponential backoff ONLY for socket connection establishment (not for rate limits), but cap to 30s; on reconnect re-subscribe from DB subscriptions where active=true.
  - push ticks to an internal channel for aggregation.

### Minute aggregation
- For each token, maintain current minute bucket (based on IST minute boundaries).
- Update OHLC as ticks arrive.
- Compute minute volume from cumulative volume difference; handle reset at day start by detecting negative deltas.
- Flush completed minute bars:
  - every minute boundary + runtime.flush_seconds
  - batch upsert into bars_1m with ON CONFLICT DO UPDATE (idempotent).
  - update watermarks per token to last completed minute.
- If no ticks in a minute for a token, do NOT create bar (unless you have a specific fill-forward rule; keep it optional and default off).

### REST job system (rate-limited, adaptive)
Implement an in-memory job queue for REST tasks with per-endpoint limiters:
- Quote snapshot job: every quote_snapshot_interval_seconds, call quote endpoint in bulk (50 tokens per request), store quote_snapshots.
- Option greeks job: every option_greeks_interval_seconds, call optionGreek for configured underlyings+expiry; store option_greeks.
- Backfill job: on startup and after websocket reconnect, detect missing minutes from watermarks and schedule candle backfill for missing windows; obey candles_per_hour_cap and candles_rps.

Adaptive limiter rules (NO exponential backoff):
- Start at configured RPS.
- If you receive an HTTP response indicating throttling (429 or 403 with “exceeding access rate” text), then:
  - pause 1 second and reduce RPS by 1 step down to min_rps.
  - if throttling repeats, pause 2 seconds; keep min at 1 rps.
- If stable (no throttling) for adaptive_step_up_after_seconds, step RPS back up by 1 until reaching configured max.

Also implement rolling-window counters to enforce per-hour caps (candles_per_hour_cap). If cap reached, delay backfill jobs until window clears.

### CLI
collector --config ./config.yaml
- Logs startup summary: #equities, #futures, #options, #indices, #ws_subscriptions, DB schema, etc.
- Graceful shutdown on SIGINT/SIGTERM (flush pending bars, close ws, close db).

### Testing
Add unit tests for:
- CSV parsing to list of symbols
- Strike step inference and ATM rounding
- Instrument matching heuristics for equity tokens and option resolution
- Rate limiter state transitions

### README
- How to run with docker-compose
- How to configure credentials
- Schema overview
- How to add/remove symbols

### Output expectation
After running during market hours, Postgres should contain:
- instruments populated
- subscriptions populated
- bars_1m continuously filled for NIFTY100 equities and enabled derivatives
- quote_snapshots and option_greeks if enabled
- watermarks updated

Now implement the complete repository with the above requirements. Provide the full code, config.example.yaml, docker files, and README.
