# Trading Stack Current Inventory

Last reviewed: 2026-03-31

This is the current live stack for the N50 product. It reflects the services still present in `docker-compose.yml` after the removal of older non-essential components such as Grafana and n8n.

Current doc path:

- [Source of truth](./SOURCE_OF_TRUTH.md)
- [Current architecture](./ARCHITECTURE_CURRENT.md)

## Public-facing product surfaces

- PROD app: `https://m.nifty50today.co.in/n50/`
- STAGE app: `https://stage.nifty50today.co.in/n50-stage/`
- Shared reverse proxy: `http://localhost:19090`
- Local Matomo admin: `http://localhost:19091/`

## Service inventory

### Core infrastructure

| Service | Purpose | Writes to Postgres | Keep? |
|---|---|---:|---|
| `postgres` | Primary datastore for market data, analytics snapshots, auth/profile data, exports, and backtesting | Yes | Keep |
| `redis` | Cache/session/snapshot support for PROD and STAGE dashboards | No | Keep |
| `nginx` | Public reverse proxy for PROD, STAGE, option-chain service, and tracking proxy paths | No | Keep |
| `matomo-db` | MariaDB storage for Matomo analytics | No | Keep |
| `matomo` | Self-hosted secondary analytics alongside GA4 and Clarity | No | Keep |

### UI and app containers

| Service | Purpose | Writes to Postgres | Keep? |
|---|---|---:|---|
| `n50-dashboard` | Production N50 web UI + API app under `/n50/` | Limited app writes | Keep |
| `n50-dashboard-stage` | Stage N50 web UI + API app under `/n50-stage/` | Limited app writes | Keep if stage workflow is required |

### Market ingestion and derived-state services

| Service | Purpose | Writes to Postgres | Keep? |
|---|---|---:|---|
| `collector` | SmartAPI collector for quotes, ticks, market aggregates, and core market state | Yes | Keep |
| `strategy` | Derived strategy-state engine | Yes | Keep |
| `watchlist` | Watchlist/state refresh service used by the broader stack | Yes | Keep |
| `rsi-willr-monitor` | Indicator monitor and derived RSI/WILLR state generation | Yes | Keep |
| `option-chain-watcher` | NSE option-chain ingestion and analytics payload generation | Yes | Keep |
| `nse_ingestor` | NSE file/data ingestion pipeline | Yes | Keep |
| `nse-analytics-worker` | Snapshot/precompute worker for dashboard and backtesting marts | Yes | Keep |
| `nse-orchestrator` | Export orchestration and scheduled pipeline coordination | Yes | Keep if exports remain part of the product |

### Read/API and scheduled analytics services

| Service | Purpose | Writes to Postgres | Keep? |
|---|---|---:|---|
| `nse-export-api` | Export and report manifest APIs used by the dashboards | Mostly reads | Keep if export/report flows remain |
| `nse-intraday-api` | Intraday intelligence APIs | Mostly reads | Keep |
| `nse-intraday-scheduler` | Scheduled intraday feature/quality/dashboard refresh jobs | Yes | Keep |
| `nse-reco-api` | Recommendation/state-aware APIs consumed by the N50 app | Mostly reads | Keep |
| `nse-reco-scheduler` | Recommendation/anomaly/scorecard scheduler | Yes | Keep |
| `market-data-gateway` | Supporting metrics and macro data gateway | No direct Postgres write | Keep |

## Which service collects from SmartAPI?

`collector` is the SmartAPI collector.

It is responsible for:

- SmartAPI authentication
- websocket/live tick collection
- SmartAPI-backed quote and market aggregate ingestion
- writing raw and derived market-state data into PostgreSQL

## Which services write to PostgreSQL?

Primary Postgres writers in the current stack:

- `collector`
- `strategy`
- `watchlist`
- `rsi-willr-monitor`
- `option-chain-watcher`
- `nse_ingestor`
- `nse-analytics-worker`
- `nse-orchestrator`
- `nse-intraday-scheduler`
- `nse-reco-scheduler`

App-layer services with limited operational writes:

- `n50-dashboard`
- `n50-dashboard-stage`
- `nse-export-api`
- `nse-reco-api`

## Current PROD/STAGE split

The app split is host-based and path-aware:

- PROD host: `m.nifty50today.co.in` -> `/n50/`
- STAGE host: `stage.nifty50today.co.in` -> `/n50-stage/`

Both share the same PostgreSQL database but isolate:

- session cookies
- cookie paths
- Redis DB index
- web bundles

## What is safe to remove later?

Only remove these if you explicitly decide the feature is no longer needed:

- `n50-dashboard-stage`
  - removable only if you no longer want a stage-before-prod workflow
- `nse-export-api`
  - removable only if you remove report/export/download features from the app
- `nse-orchestrator`
  - removable only if you retire orchestration/export scheduling
- `matomo` and `matomo-db`
  - removable only if you decide to rely exclusively on GA4 and Clarity

Everything else directly supports the current product data path or public dashboard experience and should stay.

## Ops checkpoints

Useful health checks:

- `http://localhost:19090/n50/health`
- `http://localhost:19090/n50-stage/health`
- `http://localhost:19090/option-chain/healthz`
- `http://localhost:8080/healthz`

Useful compose checks:

- `docker compose ps`
- `docker compose logs --tail=200 nginx`
- `docker compose logs --tail=200 n50-dashboard`
- `docker compose logs --tail=200 n50-dashboard-stage`

## Related docs

- [Source of truth](./SOURCE_OF_TRUTH.md)
- [Current architecture](./ARCHITECTURE_CURRENT.md)
- [Endpoints reference](./endpoints.md)
- [Product surface map](./product-surface-map.md)
- [Stage/prod hosting](./n50-stage-prod-hosting.md)
- [Historic 2026-03-13 stack inventory](./stack-container-inventory-2026-03-13.md)
