# Stack Container Inventory

Superseded by the evergreen current-state doc:

- [Current stack inventory](./stack-current.md)

Date: 13 Mar 2026
Workspace: `C:\Github_sync\trading-stack`

## Current PostgreSQL State

- Database: `tradingdb`
- `max_connections`: `50`
- Current sessions: `15`
- Idle sessions: `10`
- Active sessions: `5`
- Current top application name in `pg_stat_activity`: `nifty100_collector`
- Current Postgres memory snapshot: about `718.7 MiB / 1 GiB`

This is not currently a stray-connection crisis. The stack is holding a controlled number of sessions, and the database is operating below the configured connection cap.

## Current Validation Status

- `docker compose ps` shows all N50-related containers are `Up`
- `PROD` health: `http://localhost:19090/n50/health` -> `ok`
- `STAGE` health: `http://localhost:19090/n50-stage/health` -> `ok`
- Dashboard route sweep at `1366x768`:
  - `PROD`: `26/26` routes `ok`, `0` console errors, `0` page errors, `0` request failures
  - `STAGE`: `26/26` routes `ok`, `0` console errors, `0` page errors, `0` request failures
- Summary API on both app paths is returning live JSON data
- Option-chain watcher health is `ok`

## Running Containers

### Core infrastructure

- `postgres`
  - Main transactional and analytics database.
  - Stores market data, intraday analytics, recommendation state, backtesting outputs, auth/signup profile data, exports metadata, and dashboard snapshots.
  - Keep: `Yes`

- `redis`
  - Cache and session support for the N50 dashboards.
  - Separate Redis DB indexes are used for PROD and STAGE.
  - Keep: `Yes`

- `nginx`
  - Public entrypoint for PROD and STAGE.
  - Routes `m.nifty50today.co.in` to PROD and `stage.nifty50today.co.in` to STAGE.
  - Keep: `Yes`

### UI containers

- `n50-dashboard`
  - PROD web UI for the N50 dashboards.
  - Reads Postgres and Redis, and handles app/API routes for the live site.
  - Keep: `Yes`

- `n50-dashboard-stage`
  - STAGE web UI for the N50 dashboards.
  - Same DB, separate Redis/session isolation.
  - Keep: `Yes` if STAGE is needed before PROD promotion.
  - Optional removal only if you decide to stop using a STAGE environment.

### SmartAPI collector path

- `collector`
  - The main SmartAPI collector.
  - Logs in to SmartAPI, opens the SmartAPI websocket, and fetches quotes, candles, option greeks, OI buildup, PCR, and related market data.
  - Writes market and instrument data to Postgres.
  - Keep: `Yes`

### Derived signal/state services

- `strategy`
  - Computes strategy-state style outputs from DB-backed live/intraday data.
  - Writes derived strategy state to Postgres.
  - Keep: `Yes`

- `watchlist`
  - Builds watchlist-oriented outputs for the dashboard.
  - Writes watchlist state/snapshots into Postgres.
  - Keep: `Yes`

- `rsi-willr-monitor`
  - Computes RSI/WILLR monitoring outputs.
  - Reads and writes Postgres.
  - Keep: `Yes`

### Option chain

- `option-chain-watcher`
  - Fetches NSE option-chain data and computes expiry context, ATM/equilibrium/diagnostic payloads.
  - Writes option-chain analytics and snapshots into Postgres.
  - Keep: `Yes`

### NSE ingestion and analytics

- `nse_ingestor`
  - Ingests NSE files/feeds into the platform.
  - Writes staged/raw NSE data into Postgres.
  - Keep: `Yes`

- `nse-analytics-worker`
  - Computes dashboard analytics, backtesting snapshots, marts, and derived summary tables.
  - Heavy Postgres writer.
  - Keep: `Yes`

- `nse-orchestrator`
  - Coordinates scheduled export/orchestration workflows.
  - Uses Postgres and export state.
  - Keep: `Yes` if export/orchestration flows are still part of the product.

- `nse-export-api`
  - Serves export/download-related API flows.
  - Mostly reads Postgres and export files, but is part of the current product path.
  - Keep: `Yes` if export/download features are still used.

### Intraday intelligence

- `nse-intraday-api`
  - Serves intraday intelligence APIs used by the dashboards.
  - Mostly reads Postgres.
  - Keep: `Yes`

- `nse-intraday-scheduler`
  - Builds intraday intelligence features, summaries, and snapshots on schedule.
  - Writes to Postgres.
  - Keep: `Yes`

### Recommendation/state engine

- `nse-reco-api`
  - Serves recommendation/state-aware APIs used by the N50 dashboards.
  - Reads Postgres and related snapshot tables.
  - Keep: `Yes`

- `nse-reco-scheduler`
  - Computes recommendations, anomalies, scorecards, and quality checks.
  - Writes heavily into Postgres.
  - Keep: `Yes`

### External macro/supporting metrics

- `market-data-gateway`
  - Fetches non-SmartAPI external macro/supporting metrics.
  - Supports the Supporting Metrics dashboard path.
  - Does not need Postgres directly to be useful to the app.
  - Keep: `Yes`

## Which container collects from SmartAPI?

Only one service is the primary SmartAPI collector:

- `collector`

It is the service that logs in to SmartAPI and pulls websocket/REST market data.

## Which containers write to Postgres?

Primary writers:

- `collector`
- `strategy`
- `watchlist`
- `rsi-willr-monitor`
- `option-chain-watcher`
- `nse_ingestor`
- `nse-analytics-worker`
- `nse-intraday-scheduler`
- `nse-reco-scheduler`
- `nse-orchestrator`

Read-heavy/API services:

- `n50-dashboard`
- `n50-dashboard-stage`
- `nse-intraday-api`
- `nse-reco-api`
- `nse-export-api`

## Keep / Let Go Summary

Keep:

- `postgres`
- `redis`
- `nginx`
- `n50-dashboard`
- `collector`
- `strategy`
- `watchlist`
- `rsi-willr-monitor`
- `option-chain-watcher`
- `nse_ingestor`
- `nse-analytics-worker`
- `nse-intraday-api`
- `nse-intraday-scheduler`
- `nse-reco-api`
- `nse-reco-scheduler`
- `market-data-gateway`

Keep only if still needed operationally:

- `n50-dashboard-stage`
- `nse-export-api`
- `nse-orchestrator`

## Cleanup Notes

Non-essential containers that had already been removed from the compose stack before this inventory:

- `n8n`
- `grafana`
- `lite-dashboard`
- `nse-cockpit`
- `bff`
- `realtime-engine`
- `backtest`
- `equilibrium`
- `maxpain`

Repository cleanup completed for obvious non-project junk:

- removed old dashboard/report bundle zip files under `output/playwright` and old top-level artifact zips
- removed temporary scratch JSON/HTML/cookie files under `tmp`
- preserved `.md` files and source-like folders
- preserved live runtime ingestion zip payloads under `services/nse_ingestor/runtime/staging` because they are part of the ingestion data path and should not be deleted blindly

## Recommendation

The current stack is reasonable for the N50 product. The only containers I would consider removing next are:

1. `n50-dashboard-stage` if you no longer want a STAGE environment
2. `nse-export-api` if export/download features are no longer needed
3. `nse-orchestrator` if orchestration/export scheduling is not needed

Everything else is still directly supporting Postgres-backed market data, analytics, or the live N50 dashboards.
