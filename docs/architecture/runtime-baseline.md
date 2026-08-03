# Runtime Baseline

Last reviewed: 2026-04-03

This document records the current baseline risks, smoke targets, and verification workflow for the existing stack before any decomposition or optimization work.

## Route And Endpoint Preservation Checklist

The baseline smoke set should preserve at least these public/product URLs:

### Critical browser routes

- `/n50/`
- `/n50/analytics`
- `/n50/analytics/regime`
- `/n50/analytics/supporting-metrics`
- `/n50/options`
- `/n50/heatmap/change`
- `/n50/heatmap/rsi`
- `/n50/heatmap/will`
- `/n50/backtesting`
- `/n50/backtesting/strategies`
- `/n50/feedback`

### Critical health endpoints

- `/n50/health`
- `/n50/ready`
- `/option-chain/healthz`
- `/option-chain/readyz`
- `/backend/healthz`

### Critical same-origin data paths

- `/n50/v1/overview`
- `/n50/v1/analytics/dashboard`
- `/n50/api/v1/dashboard/summary`
- `/n50/api/v1/intraday/summary`
- `/option-chain/api/latest`

## What The Frontend Currently Talks To

From [`neon-stock-terminal/apps/web/src/lib/api.ts`](../../neon-stock-terminal/apps/web/src/lib/api.ts):

- Native dashboard API:
  - `/v1/overview`
  - `/v1/leaderboard`
  - `/v1/stocks/:symbol`
  - `/v1/change-heatmap`
  - `/v1/rsi-surface`
  - `/v1/will-surface`
  - `/v1/analytics/*`
  - `/v1/backtesting/*`
  - `/v1/feedback*`
- Same-origin export proxy:
  - `/api/v1/dashboard/*`
  - `/api/v1/watchlists*`
  - `/api/v1/ops/*`
  - `/api/v1/exports/*`
- Same-origin intraday proxy:
  - `/api/v1/intraday/*`
- Direct root option-chain APIs:
  - `/option-chain/api/latest`
  - `/option-chain/api/series`
  - `/option-chain/api/analytics`

## Current Health Coverage

### Services with declared compose healthchecks

- `postgres`
- `redis`
- `collector`
- `matomo-db`
- `option-chain-watcher`
- `market-data-gateway`

### Services with code-level health endpoints but no compose healthcheck

- `n50-dashboard` (`/health`, `/ready`)
- `nse-export-api` (`/health`)
- `nse-intraday-api` (`/health`)
- `nse-reco-api` (`/health`)

### Services with no obvious long-running HTTP readiness endpoint

- `strategy`
- `watchlist`
- `rsi-willr-monitor`
- `nse_ingestor`
- `nse-analytics-worker`
- `nse-orchestrator`
- `nse-intraday-scheduler`
- `nse-reco-scheduler`
- `institutional-flow-ingest`

## Current Startup/Readiness Risks

### Startup-time schema or install flags

- `option-chain-watcher`: `NSE_OC_RUN_MIGRATIONS_ON_START`
- `nse-orchestrator`: `INSTALL_SQL_ON_START`
- `nse-export-api`: `INSTALL_SQL_ON_START`
- `nse-intraday-api`: `INSTALL_SQL_ON_START`
- `nse-intraday-scheduler`: `INSTALL_SQL_ON_START`
- `nse-reco-api`: `INSTALL_SQL_ON_START`
- `nse-reco-scheduler`: `INSTALL_SQL_ON_START`

### `service_started` chains that should be revisited later

- `nse-analytics-worker` -> `nse_ingestor`
- `nse-orchestrator` -> `nse_ingestor`
- `nse-orchestrator` -> `nse-analytics-worker`
- `nse-export-api` -> `nse-orchestrator`
- `nse-intraday-api` -> `nse-orchestrator`
- `nse-intraday-scheduler` -> `nse-intraday-api`
- `nse-reco-api` -> `nse-intraday-api`
- `nse-reco-scheduler` -> `nse-reco-api`
- `n50-dashboard` -> `nse-reco-api`
- `n50-dashboard` -> `market-data-gateway`
- `n50-dashboard-stage` -> `nse-reco-api`
- `n50-dashboard-stage` -> `market-data-gateway`

## Current Build Duplication Baseline

### Same codebase, repeated build requests

- Root Go artifact cluster:
  - `collector`
  - `strategy`
  - `watchlist`
  - `rsi-willr-monitor`
- Orchestration/export cluster:
  - `nse-orchestrator`
  - `nse-export-api`
- Intraday intelligence cluster:
  - `nse-intraday-api`
  - `nse-intraday-scheduler`
- Reco engine cluster:
  - `nse-reco-api`
  - `nse-reco-scheduler`
- Dashboard cluster:
  - `n50-dashboard`
  - `n50-dashboard-stage`

### High-risk build-context observations

- Repo-root build contexts are still used by eight services.
- [`services/market_data_gateway`](../../services/market_data_gateway) currently has no `.dockerignore`, while the folder contains a local `.venv_supporting_metrics`.
- [`services/option-chain-watcher/.dockerignore`](../../services/option-chain-watcher/.dockerignore) only ignores `npm-debug.log` and `.env`, but the folder currently contains checked-in `node_modules/` and `dist/`.

## Current Database Connection Budget Estimate

Postgres is currently started with `max_connections=50`.

The explicit pool ceilings visible in the resolved compose config already add up to approximately 41 connections before counting services with no declared cap:

- `collector`: 3
- `strategy`: 2
- `watchlist`: 2
- `rsi-willr-monitor`: 2
- `n50-dashboard`: 2 (`connection_limit=2`)
- `n50-dashboard-stage`: 2 (`connection_limit=2`)
- `nse-orchestrator`: 4
- `nse-export-api`: 4
- `nse-intraday-api`: 4
- `nse-intraday-scheduler`: 4
- `nse-reco-api`: 6 (`DB_POOL_SIZE=4` plus `DB_POOL_MAX_OVERFLOW=2`)
- `nse-reco-scheduler`: 6 (`DB_POOL_SIZE=4` plus `DB_POOL_MAX_OVERFLOW=2`)

Unclear or not explicitly capped in compose:

- `nse_ingestor`
- `nse-analytics-worker`
- `option-chain-watcher`
- `market-data-gateway`

Baseline conclusion:

- The stack is already close enough to the Postgres ceiling that Phase 6 should treat connection budgeting as a first-class risk, not a cleanup detail.

## Verification Workflow

The Phase 1 scripts created under [`scripts/verify`](../../scripts/verify) provide the baseline workflow:

1. `python scripts/verify/compose_lint.py`
2. `docker compose up -d`
3. `python scripts/verify/baseline.py --base-url http://localhost:19090`
4. `python scripts/verify/image_report.py`
5. `python scripts/verify/route_smoke.py --base-url http://localhost:19090`

Unix-like wrapper scripts with the requested names are also provided:

- `scripts/verify/compose-lint.sh`
- `scripts/verify/baseline.sh`
- `scripts/verify/image-report.sh`
- `scripts/verify/route-smoke.sh`

The Python entrypoints are the portable source of truth for this repository because this environment does not currently provide `bash`.
