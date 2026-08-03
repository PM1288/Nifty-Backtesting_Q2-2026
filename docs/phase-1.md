You are an expert Go engineer. Build a production-grade, standalone, Dockerized market-data collector for Angel One SmartAPI (SmartAPI). This is PHASE 1: NIFTY100 equities + indices live streaming via WebSocket → build 1-minute OHLCV bars → store into Postgres with idempotent upserts and crash-safe watermarks. It must run in Docker and integrate with ANY Postgres DB provided via config/env.

########################
# PHASE 1 SCOPE (MVP)  #
########################
Core requirements:
1) Read NIFTY100 equities list from a CSV file path in config.
2) Resolve each equity symbol to SmartAPI instrument token using the OpenAPI Scrip Master JSON.
3) Resolve index tokens for NIFTY50 and optionally BANKNIFTY (config controlled).
4) Connect to SmartAPI WebSocket (market feed), subscribe to:
   - NIFTY100 equities (NSE cash)
   - indices configured (NIFTY, BANKNIFTY)
5) Parse incoming ticks; aggregate to 1-minute OHLCV bars per instrument.
6) Store bars to Postgres table bars_1m with ON CONFLICT DO UPDATE (idempotent).
7) Maintain watermarks per instrument in Postgres; on restart, do NOT lose state.
   - For Phase-1, “no missed minutes” means: if the process restarts, it resumes streaming and continues storing. (Gap backfill with candles is PHASE-2.)
8) Robustness:
   - Auto reconnect WebSocket with capped retry (connection backoff is allowed).
   - Graceful shutdown (flush completed minute bars).
   - Logs to stdout.
9) Must be Dockerized:
   - Provide Dockerfile (multi-stage build, non-root runtime).
   - Provide docker-compose.yml including Postgres + this service.
   - Provide config.example.yaml + sample CSV.
   - Provide README with docker-compose run steps.

############################
# SMARTAPI INPUT RESOURCES #
############################
- Instrument master JSON (download at startup and refresh daily; cache to disk):
  https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json
- REST base URL configurable (default https://apiconnect.angelone.in)
- WebSocket URL configurable (default wss://smartapisocket.angelone.in/smart-stream)

#########################
# IMPORTANT ASSUMPTIONS #
#########################
- Single instance.
- In-memory queues are OK.
- Postgres is the only persistence.
- Implement table auto-creation (CREATE TABLE IF NOT EXISTS) under configured schema.
- Use Asia/Kolkata minute boundaries for bucketing; store timestamps as UTC timestamptz.

########################
# REQUIRED REPO OUTPUT #
########################
Repository layout:
cmd/collector/main.go
internal/config/config.go
internal/instruments/master.go
internal/universe/universe.go
internal/smartapi/rest_auth.go
internal/smartapi/ws.go
internal/aggregate/minute.go
internal/store/postgres.go
internal/store/migrations.go
internal/util/timebucket.go
Dockerfile
docker-compose.yml
config.example.yaml
samples/nifty100.sample.csv
README.md
.dockerignore

##################
# CONFIG (YAML)  #
##################
Support config file path via CLI flag: --config /app/config.yaml
Create config struct + example file. Include:
smartapi:
  api_key: "..."
  client_code: "..."
  password: "..."                 # allow ENV override SMARTAPI_PASSWORD
  totp_secret: "BASE32..."        # optional; allow ENV override SMARTAPI_TOTP_SECRET
  access_token: ""                # optional (if provided, skip login)
  feed_token: ""                  # optional (if provided, skip login)
  rest_base_url: "https://apiconnect.angelone.in"
  ws_url: "wss://smartapisocket.angelone.in/smart-stream"
postgres:
  host: "postgres"
  port: 5432
  user: "postgres"
  password: "postgres"            # allow ENV override POSTGRES_PASSWORD
  database: "marketdata"
  sslmode: "disable"
  schema: "public"
  app_name: "nifty100_collector"
runtime:
  timezone: "Asia/Kolkata"
  log_level: "info"
  http_timeout_seconds: 15
  flush_seconds: 2
  trading_start: "09:15"
  trading_end: "15:30"
  weekend_pull_last_working_day: true
files:
  symbols_csv_path: "/app/nifty100.csv"
  instrument_cache_path: "/app/state/OpenAPIScripMaster.json"
universe:
  equities_exchange: "NSE"
  include_indices: ["NIFTY50","BANKNIFTY"]  # BANKNIFTY optional
  index_tokens:                             # optional direct token pinning
    NIFTY50: "99926000"
    BANKNIFTY: "99926009"
ws:
  mode_equities: "LTP"   # LTP only for Phase-1 (simple + light)
  mode_indices: "LTP"
  max_reconnect_backoff_seconds: 30
health:
  enable_http: true
  listen_addr: "0.0.0.0:8080"  # expose /healthz

Secrets precedence:
- If env var exists, override config values:
  SMARTAPI_PASSWORD, SMARTAPI_TOTP_SECRET, POSTGRES_PASSWORD

#########################
# DATABASE (AUTO-CREATE) #
#########################
Create schema if not exists (CREATE SCHEMA IF NOT EXISTS <schema>).
Create tables if not exists:

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
Index: (exchange, tradingsymbol)

2) subscriptions
- exchange TEXT NOT NULL
- symbol_token TEXT NOT NULL
- mode TEXT NOT NULL          # LTP
- kind TEXT NOT NULL          # EQUITY or INDEX
- active BOOLEAN NOT NULL DEFAULT true
- updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
PRIMARY KEY (exchange, symbol_token, mode)

3) bars_1m
- ts TIMESTAMPTZ NOT NULL       # minute start (UTC)
- exchange TEXT NOT NULL
- symbol_token TEXT NOT NULL
- open NUMERIC NOT NULL
- high NUMERIC NOT NULL
- low NUMERIC NOT NULL
- close NUMERIC NOT NULL
- volume BIGINT NOT NULL DEFAULT 0
- source TEXT NOT NULL DEFAULT 'ws'
- created_at TIMESTAMPTZ NOT NULL DEFAULT now()
PRIMARY KEY (ts, exchange, symbol_token)
Index: (symbol_token, ts DESC)

4) watermarks
- exchange TEXT NOT NULL
- symbol_token TEXT NOT NULL
- last_completed_minute TIMESTAMPTZ NOT NULL
- updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
PRIMARY KEY (exchange, symbol_token)

Idempotency:
- bars_1m uses ON CONFLICT DO UPDATE to update OHLCV if reprocessed.

#############################
# INSTRUMENT RESOLUTION LOGIC
#############################
- Load instrument master JSON from cache path if exists and fresh (mtime < 24h), else download.
- Parse the master into Go structs. Keep raw JSON for storage.
- Upsert all instruments to DB.
- Build in-memory maps:
  - key1: (exchange, tradingsymbol) -> instrument
  - key2: (exchange, name, instrumenttype) -> []instrument

CSV parsing rules:
- CSV may have header.
- Take first non-empty cell per row as symbol.
- Normalize: strings.TrimSpace, upper-case.
- For each symbol, resolve equity instrument:
  - exchange == "NSE"
  - prefer tradingsymbol == symbol+"-EQ" (common)
  - else tradingsymbol == symbol
  - else fuzzy match by name field if necessary (log warnings if ambiguous)
Store chosen subscriptions in DB subscriptions (kind=EQUITY).
Indices:
- For "NIFTY50" and optional "BANKNIFTY", use heuristics:
  - find NSE instrument whose tradingsymbol contains the index name OR name matches.
  - choose one deterministically; log if multiple candidates.

#####################
# WEBSOCKET INGESTION
#####################
- Implement SmartAPI login:
  - If access_token and feed_token provided in config -> use them.
  - Else login using api_key, client_code, password, and optional TOTP.
- Connect WebSocket:
  - Provide auth/feed token as per SmartAPI protocol (implement in ws.go).
  - Subscribe to tokens from DB subscriptions active=true.
  - Parse ticks into Tick struct:
    Tick{ts, exchange, token, ltp, last_traded_qty?, avg_traded_price?, vol_cum?, raw}
  - Use monotonic reconnect loop:
    - try connect, on failure sleep with backoff (1s..max_reconnect_backoff_seconds).
    - On reconnect, re-subscribe all active subscriptions.

########################
# 1-MINUTE AGGREGATION #
########################
- Use Asia/Kolkata for minute boundary.
- Bucket key: minuteStartUTC (convert now to IST, truncate to minute, convert back to UTC).
- Per instrument maintain current bucket:
  - open = first ltp
  - high/low update
  - close = last ltp
  - volume:
    - If tick provides cumulative volume -> diff between first and last in bucket.
    - Else if only last_traded_qty -> sum it.
- Flushing:
  - Every time you detect minute rollover, finalize previous bucket and enqueue for DB write.
  - Also run a timer loop to flush at minute boundary + flush_seconds.
- Write to DB in batches (COPY is optional; batch INSERT is fine for phase-1).

Watermarks:
- After successfully writing a completed minute bar, update watermarks.last_completed_minute for that token.

######################
# HEALTHCHECK ENDPOINT
######################
Implement optional tiny HTTP server:
- GET /healthz returns 200 if:
  - DB reachable (simple SELECT 1)
  - websocket connected OR last_tick_time within threshold (e.g., 60s)
Return JSON with fields: status, ws_connected, last_tick_ago_seconds, subscriptions_count.

##################
# DOCKERIZATION   #
##################
Create Dockerfile:
- Multi-stage build:
  - build stage: golang:1.22-alpine
  - runtime stage: alpine:3.20 (or distroless base if you can ensure tzdata + CA certs)
- In runtime image:
  - install ca-certificates and tzdata
  - create non-root user
  - workdir /app
  - copy binary to /app/collector
- ENTRYPOINT ["/app/collector"]
- default CMD ["--config","/app/config.yaml"]

Create .dockerignore to exclude:
- bin/, tmp/, .git/, *.log, state/, etc (but allow mounting state at runtime)

Create docker-compose.yml:
- services:
  postgres:
    image: postgres:16
    env: POSTGRES_PASSWORD, POSTGRES_DB
    ports: 5432:5432
    volumes: pgdata:/var/lib/postgresql/data
    healthcheck: pg_isready
  collector:
    build: .
    depends_on: postgres (with healthcheck)
    environment:
      - POSTGRES_PASSWORD=postgres
      - SMARTAPI_PASSWORD=...
      - SMARTAPI_TOTP_SECRET=...
    volumes:
      - ./config.example.yaml:/app/config.yaml:ro
      - ./samples/nifty100.sample.csv:/app/nifty100.csv:ro
      - ./state:/app/state
    ports:
      - "8080:8080"
    restart: unless-stopped
- volumes:
  pgdata:

In README:
- Explain how to run:
  docker compose up --build
- Explain where to put config.yaml and nifty100.csv.
- Explain table auto-creation.

###########################
# QUALITY / CODE PRACTICES
###########################
- Use pgxpool.
- Use net/http with timeouts.
- Use gorilla/websocket.
- Use context cancellation and errgroup.
- Never panic on normal errors; log and continue or exit gracefully.
- Provide a short set of unit tests for:
  - CSV parsing
  - time bucket conversion to IST minuteStartUTC
  - symbol resolution heuristics (pure function with sample instruments list)

Now implement the complete repository accordingly, producing all files.
