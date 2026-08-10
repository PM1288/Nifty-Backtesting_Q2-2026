# SmartAPI NIFTY100 Collector (Phase-2)

The rate-safe SmartAPI market, depth, derivatives, Greeks and internally built option-chain archive is documented in [`docs/SMARTAPI_RATE_SAFE_DATA_ARCHIVE.md`](docs/SMARTAPI_RATE_SAFE_DATA_ARCHIVE.md). It is WebSocket-first and contains no broker order-booking path.

## Start Here

For the current deployed N50 product shape, do not start from older phase docs.

Use this path:

1. [`docs/SOURCE_OF_TRUTH.md`](docs/SOURCE_OF_TRUTH.md)
2. [`docs/ARCHITECTURE_CURRENT.md`](docs/ARCHITECTURE_CURRENT.md)
3. [`docs/endpoints.md`](docs/endpoints.md)
4. [`docs/stack-current.md`](docs/stack-current.md)
5. [`docs/product-surface-map.md`](docs/product-surface-map.md)
6. [`docs/n50-stage-prod-hosting.md`](docs/n50-stage-prod-hosting.md)
7. [`docs/nifty100-disclosures-integration.md`](docs/nifty100-disclosures-integration.md)
8. [`docs/nse-fii-reports-integration.md`](docs/nse-fii-reports-integration.md)
9. [`docs/nifty-stratlab/README.md`](docs/nifty-stratlab/README.md)
10. [`docs/architecture/strategy-testing-workspace.md`](docs/architecture/strategy-testing-workspace.md)

Production-grade, Dockerized Go services that stream NIFTY100 equities + indices and current-month F&O from Angel One SmartAPI, aggregate 1-minute OHLCV(+OI) bars, and run a strategy + paper-trading engine for signal evaluation.

## What this does
- Loads NIFTY100 symbols from CSV
- Resolves tokens from Angel One OpenAPI Scrip Master
- Streams equities, indices, futures, and options (current month only)
- Builds 1-minute OHLCV(+OI) bars from WebSocket ticks
- Stores quote snapshots, OI snapshots (by type), PCR, and option greeks (optional)
- Captures SmartAPI market aggregates (gainers/losers, OI buildup, put-call ratio)
- Loads 3-year daily history for equities + indices only
- Retains intraday data on a rolling 90-day window
- Exposes `/healthz` for health checks
- Runs a strategy engine that emits signals, writes alerts, and tracks paper trades
- Serves a watchlist alert API + Grafana HTML manager (via Nginx reverse proxy)
- Provides a governed Strategy Testing Lab at `/n50/backtesting/lab`; runs are
  durable, paper/research-only and evaluate every diagnostic ladder level
  independently.

## Quick start (Docker)
1) Review config:
- `config/config.yaml`
- `samples/nifty100.sample.csv`
- `.env` (secrets)
- `.env.collector.runtime` (ignored collector-only runtime overlay for live SmartAPI credentials)
- `docs/security/secrets-and-config.md`

2) Start the local all-in-one development stack:
```bash
docker compose --env-file .env -f compose/compose.base.yml -f compose/compose.dev.yml up --build
```

3) Health check:
```bash
curl <BASE_URL>/backend/healthz
```

4) Main dashboard UI:
- Reverse proxy base: `http://localhost:19090/`
- N50 PROD: `http://localhost:19090/n50/`
- N50 STAGE: `http://localhost:19090/n50-stage/`
- Public PROD host: `https://m.nifty50today.co.in/n50/`
- Public STAGE host: `https://stage.nifty50today.co.in/n50-stage/`
- Option Chain service path: `http://localhost:19090/option-chain/`
- Local Matomo admin: `http://localhost:19091/`

### Deployment overlays

The runtime topology is now split by concern. Use the overlay that matches the deployment target instead of always starting the full mixed stack.

- Core prod-like stack:
```bash
docker compose --env-file .env -f compose/compose.base.yml -f compose/compose.core.yml up -d
```
- Stage dashboard stack:
```bash
docker compose --env-file .env -f compose/compose.base.yml -f compose/compose.stage.yml up -d
```
- Telemetry stack:
```bash
docker compose --env-file .env -f compose/compose.base.yml -f compose/compose.telemetry.yml up -d
```
- Legacy/watchlist stack:
```bash
docker compose --env-file .env -f compose/compose.base.yml -f compose/compose.legacy.yml up -d
```
- One-off jobs:
```bash
docker compose --env-file .env -f compose/compose.base.yml -f compose/compose.jobs.yml run --rm institutional-flow-ingest
```

Each overlay reads the shared root `.env` plus a deployment-specific file under `compose/env/`. Keep secrets in `.env` and use the overlay files for non-secret deployment markers or future per-layer defaults.

## Nifty100 disclosures pipeline

The stack now includes an internal service that pulls and loads exactly these four datasets:

- `market_data.nse_corporate_actions`
- `market_data.nse_event_calendar`
- `market_data.nse_financial_results`
- `market_data.yf_financial_statements`

Operator docs and run/load commands:

- [`docs/nifty100-disclosures-integration.md`](docs/nifty100-disclosures-integration.md)

## NSE FII reports service

The stack now includes an internal single service for NSE daily F&O participant and FII derivatives reports with two operational modes:

- regular latest daily pull
- historical backfill

Operator docs and run commands:

- [`docs/nse-fii-reports-integration.md`](docs/nse-fii-reports-integration.md)

Phase 4 runtime notes:
- the prod-like `base+core` stack now uses named volumes for runtime data and baked configs/scripts for nginx plus the analytics/ingestor entrypoints
- internal services are no longer published to the host in the prod-like path; use the dev overlay for direct host access to Postgres and internal APIs
- `compose.dev.yml` remains intentionally larger and convenience-oriented
- storage migration guidance: [`docs/architecture/runtime-storage-migration.md`](docs/architecture/runtime-storage-migration.md)
- runtime hardening summary: [`docs/architecture/runtime-hardening.md`](docs/architecture/runtime-hardening.md)
- full Phase 4 inventory and hardening matrix: [`docs/architecture/runtime-phase4-report.md`](docs/architecture/runtime-phase4-report.md)
- warm-up probe for `/n50/`: `python scripts/verify/warmup_probe.py --base-url http://localhost:19090 --path /n50/`

N50 single-machine stage/prod hosting flow:
- See [`docs/n50-stage-prod-hosting.md`](docs/n50-stage-prod-hosting.md)
- Compose topology and overlay usage: [`docs/architecture/compose-topology.md`](docs/architecture/compose-topology.md)
- Route inventory: [`docs/architecture/compose-route-inventory.md`](docs/architecture/compose-route-inventory.md)
- Service classification: [`docs/architecture/service-classification-matrix.md`](docs/architecture/service-classification-matrix.md)
- DB/startup risk ledger: [`docs/architecture/phase2-risk-ledger.md`](docs/architecture/phase2-risk-ledger.md)

Current product/state references:
- Source-of-truth index: [`docs/SOURCE_OF_TRUTH.md`](docs/SOURCE_OF_TRUTH.md)
- Current architecture: [`docs/ARCHITECTURE_CURRENT.md`](docs/ARCHITECTURE_CURRENT.md)
- Stack inventory: [`docs/stack-current.md`](docs/stack-current.md)
- Endpoint reference: [`docs/endpoints.md`](docs/endpoints.md)
- Page and interaction map: [`docs/product-surface-map.md`](docs/product-surface-map.md)

## Optional Loki logging
Bring up Loki + Promtail with the override:
```bash
docker compose --env-file .env -f docker-compose.yml -f compose/loki/docker-compose.loki.yaml up -d
```
Then add a Grafana data source pointing to `http://loki:3100`.

## Config highlights
- Main config: `config/config.yaml`
- Example: `config.example.yaml`
- Secrets override via environment:
  - `SMARTAPI_API_KEY`
  - `SMARTAPI_CLIENT_CODE`
  - `SMARTAPI_PASSWORD` (legacy name; pass your SmartAPI account MPIN)
  - `SMARTAPI_MPIN` (preferred alias for the same login field)
  - `SMARTAPI_TOTP_SECRET` (preferred durable TOTP seed from the SmartAPI QR/setup URI)
  - `SMARTAPI_TOTP_CODE` (preferred explicit current 6-digit TOTP code input)
  - for local compose, keep live collector-only values in `.env.collector.runtime` so tracked files stay placeholder-safe
  - `POSTGRES_PASSWORD`
  - `FIREBASE_WEB_API_KEY`
  - `N50_SNAPSHOT_REFRESH_TOKEN`
  - `N50_FEEDBACK_SIGNING_SECRET`
- Live trading guardrail:
  - `smartapi.disable_live_orders` (must remain true; order endpoints are blocked)
- SmartAPI login notes:
  - the collector still uses the official `loginByPassword` API route
  - SmartAPI account login now treats the request `password` field as your account MPIN
  - use `SMARTAPI_TOTP_SECRET` for unattended startup; it should be the durable seed from the SmartAPI QR/setup URI
  - use `SMARTAPI_TOTP_CODE` only for immediate manual login; the 6-digit value expires quickly
- 1-minute bars are WebSocket-primary; REST fallback runs for equities + indices when WebSocket is stale
- Daily history loader:
  - `history.enable_daily` (equities + indices only)
- Intraday retention:
  - `retention.enable_cleanup` / `retention.bars_1m_days` / `retention.quote_snapshots_days` / `retention.depth_5_days` / `retention.option_greeks_days`
  - `retention.depth_5_hours` (if > 0, overrides depth day cutoff and keeps only last N hours in IST)
  - `retention.depth_5_max_gb` (partition-cap guardrail for `depth_5_snapshots`; `0` disables cap)
- Quote snapshot tiers:
  - `rest_tasks.enable_quote_snapshots` (equity/index/futures)
  - `rest_tasks.enable_option_quote_snapshots` (long-interval options)
  - `rest_tasks.option_quote_snapshot_interval_seconds`
- Quote snapshot rotation:
  - `rest_tasks.quote_snapshot_primary_kinds`
  - `rest_tasks.quote_snapshot_rotation_max_tokens`
  - `rest_tasks.option_quote_snapshot_rotation_max_tokens`
- Market aggregates:
  - `rest_tasks.enable_gainers_losers`
  - `rest_tasks.enable_oi_buildup`
  - `rest_tasks.enable_put_call_ratio`
  - payloads are driven from `rest_tasks.gainers_losers_payloads` and `rest_tasks.oi_buildup_payloads`
- Options strike refresh:
  - `universe.options.strike_refresh_minutes`
  - `universe.options.atm_shift_rebuild_steps`
- Quote caps:
  - `limits.quote_per_minute_cap` / `limits.quote_per_hour_cap`
- Strategy + paper trading:
  - `strategy.enable` / `strategy.run_interval_seconds`
  - `strategy.index_token` / `strategy.vix_token`
  - `paper_trading.enable` / `paper_trading.auto_place`
  - `alerts.enable_webhook` / `alerts.webhook_url`
  - `alerts.telegram_enable` / `alerts.telegram_chat_id`
- Watchlist alerts:
  - `watchlist.enable` / `watchlist.alert_window_start` / `watchlist.max_alerts_per_day`
  - `watchlist.defaults` for the initial monitored symbols

## DB management (CLI + scripts)
CLI flags:
- `--db-migrate-only`
- `--db-validate-only`
- `--db-cleanup-only`
- `--db-reset` (requires `--i-understand-this-will-delete-data`)

Scripts:
```bash
./scripts/db_init.sh
./scripts/db_validate.sh
./scripts/db_cleanup.sh
./scripts/db_migrate_all.sh
DB_RESET_I_KNOW=YES ./scripts/db_reset.sh
```

Migration ownership and execution order:
- `db/SCHEMA_OWNERSHIP.md`
- `db/MIGRATION_STRATEGY.md`

API transitional runtime-DDL flags:
- `N50_API_ALLOW_RUNTIME_DDL=1` only for explicit dashboard snapshot bootstrap
- `N50_API_ALLOW_RUNTIME_PERF_DDL=1` is retained only as a legacy compatibility flag; explicit performance indexes now live in `db/sql/010_api_read_model_indexes.sql`
- both remain `0` by default in prod, stage, and local compose

Performance / retention operator docs:
- `docs/perf/PERF_BASELINE.md`
- `docs/perf/DB_RETENTION_AND_CAPACITY.md`

Retention overrides (env):
- `RETENTION_DRY_RUN=true`
- `BARS_DAYS=90`
- `SNAP_DAYS=90`
- `DEPTH5_DAYS=1`
- `DEPTH5_HOURS=1`
- `GREEKS_DAYS=90`
- `DEPTH5_MAX_GB=1`

Partitioning:
- `bars_1m`, `quote_snapshots`, `option_greeks` are monthly partitioned when the table is created as partitioned.
- Cleanup drops old partitions when partitioned; otherwise uses batched deletes.

## Data model (apply through explicit migration flow)
Core tables are created by the central migration flow, not by user-facing service startup in production:
- `instruments`
- `subscriptions`
- `bars_1m`
- `bars_1d`
- `quote_snapshots`
- `oi_snapshots_equity` / `oi_snapshots_index` / `oi_snapshots_futures` / `oi_snapshots_options`
- `pcr_snapshots`
- `option_greeks`
- `gainers_losers_snapshots`
- `oibuildup_snapshots`
- `putcallratio_snapshots`
- `watermarks`
- `strategy_runs`
- `strategy_state`
- `strategy_cooldowns`
- `strategy_signals`
- `watchlist_targets`
- `watchlist_alert_events`
- `paper_orders`
- `paper_trades`
- `paper_positions`

## Notes
- 1-minute bars are WebSocket-primary; REST fallback is only for equities + indices when WebSocket is stale.
- Daily history is 3 years for equities + indices only.
- Intraday retention uses per-table windows (bars/snapshots/greeks) and defaults to `retention.intraday_days` if specific values are not set.

## Local development
```bash
go test ./...
go run ./cmd/collector --config ./config/config.yaml
go run ./cmd/strategy --config ./config/config.yaml
```

Backtest commands:
```bash
go run ./cmd/backtest --config ./config/config.yaml -run-once
go run ./cmd/backtest --config ./config/config.yaml -history-days 365
go run ./cmd/backtest --config ./config/config.yaml -strategy-run-once -strategy-date 2026-02-11
```

Backtest config highlights:
- `backtest.eod_telegram_chat_id` sends only backtest EOD/history summaries to a specific Telegram group.
- `backtest.option_backtest.*` enables separate options backtest runs/reports (near-100 RSI low/high + CE/PE normalized-diff trigger).
