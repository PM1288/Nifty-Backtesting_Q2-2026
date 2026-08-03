# Current Stack Baseline

Last reviewed: 2026-04-03

This document is the Phase 1 baseline for the current single-machine `docker-compose.yml` topology. It is intentionally descriptive, not prescriptive: the goal is to capture what is running now so later phases can prove improvement without changing the N50 product surface by accident.

## What This Repo Does

The repository currently ships two overlapping product layers:

- A legacy/root Go market stack built from the repo-root `Dockerfile` for `collector`, `strategy`, `watchlist`, and `rsi-willr-monitor`.
- A newer N50 web product under [`neon-stock-terminal`](../../neon-stock-terminal) that serves the `/n50/` and `/n50-stage/` dashboard surfaces through React/Vite plus an Express API.
- Python data pipelines and read APIs under [`services/`](../../services) that ingest NSE files, refresh analytical marts, publish export/intraday/recommendation APIs, and support the dashboard.
- An edge proxy in [`compose/nginx/nginx.conf`](../../compose/nginx/nginx.conf) that combines the legacy routes, the N50 routes, the option-chain service, and Matomo into one public host.

## Important Folders And Files

- [`docker-compose.yml`](../../docker-compose.yml): current all-in-one runtime topology.
- [`Dockerfile`](../../Dockerfile): shared repo-root Go build for multiple legacy services.
- [`compose/nginx/nginx.conf`](../../compose/nginx/nginx.conf): route ownership for `/n50/`, `/n50-stage/`, `/option-chain/`, legacy watchlist routes, and Matomo.
- [`config/`](../../config): root Go service runtime config.
- [`services/`](../../services): Python and Node service codebases used by the current stack.
- [`services/nse_ingestor`](../../services/nse_ingestor): NSE ingestion pipeline.
- [`services/nse_analytics_worker`](../../services/nse_analytics_worker): derived snapshot/analytics refresh worker.
- [`services/nse_orchestration_exports`](../../services/nse_orchestration_exports): export orchestration plus export/dashboard/watchlist APIs.
- [`services/nse_intraday_intelligence`](../../services/nse_intraday_intelligence): intraday intelligence API plus scheduler.
- [`services/nse_reco_state_engine`](../../services/nse_reco_state_engine): recommendation/state-aware API plus scheduler.
- [`services/market_data_gateway`](../../services/market_data_gateway): supporting metrics and macro data gateway.
- [`services/option-chain-watcher`](../../services/option-chain-watcher): Playwright-backed option chain service.
- [`neon-stock-terminal/apps/web/src/App.tsx`](../../neon-stock-terminal/apps/web/src/App.tsx): authoritative React route tree.
- [`neon-stock-terminal/apps/web/src/components/chrome/AppShell.tsx`](../../neon-stock-terminal/apps/web/src/components/chrome/AppShell.tsx): visible navigation groups and hidden-but-reachable pages.
- [`neon-stock-terminal/apps/web/src/lib/api.ts`](../../neon-stock-terminal/apps/web/src/lib/api.ts): frontend API consumers and same-origin proxy expectations.
- [`neon-stock-terminal/apps/api/src/server.ts`](../../neon-stock-terminal/apps/api/src/server.ts): dashboard API server, auth/session, proxy logic, and static serving.
- [`docs/product-surface-map.md`](../../docs/product-surface-map.md): current page inventory for the N50 app.
- [`docs/endpoints.md`](../../docs/endpoints.md): current endpoint map for the live stack.

## Service Inventory

| Service | Class | Purpose | Code location | Build/image | Published ports | Storage | Depends on | Healthcheck | Restart |
|---|---|---|---|---|---|---|---|---|---|
| `postgres` | core | Primary relational datastore for market, analytics, auth, and export state | external image | `postgres:16` | `5432 -> 5432` | named `pgdata` | none | yes | `unless-stopped` |
| `redis` | core | Session/cache support for dashboard prod and stage | external image | `redis:alpine` | internal only | named `redis_data` | none | yes | `unless-stopped` |
| `nginx` | core | Public edge for `/n50/`, `/n50-stage/`, `/option-chain/`, legacy watchlist paths, and Matomo | [`compose/nginx`](../../compose/nginx) | `nginx:alpine` | `19090 -> 19090` | bind-mounted nginx config + static gateway assets | `watchlist`, `rsi-willr-monitor`, `option-chain-watcher`, `matomo`, `n50-dashboard`, `n50-dashboard-stage`, `nse-export-api`, `nse-intraday-api` | no | `unless-stopped` |
| `matomo-db` | telemetry | MariaDB backing store for Matomo analytics | external image | `mariadb:11` | internal only | named `matomo_db_data` | none | yes | `unless-stopped` |
| `matomo` | telemetry | Self-hosted analytics/admin surface proxied by nginx | external image | `matomo:5-apache` | `19091 -> 80` | named `matomo_data` | `matomo-db` healthy | no | `unless-stopped` |
| `collector` | legacy | Root Go SmartAPI collector and health surface | repo root | root `Dockerfile` | `${COLLECTOR_PORT:-8080} -> 8080` | bind-mounted CSV/config/state/docs | `postgres` healthy | yes | `unless-stopped` |
| `strategy` | legacy | Root Go derived strategy engine | repo root | root `Dockerfile` | none | bind-mounted config | `postgres` healthy | no | `unless-stopped` |
| `watchlist` | legacy | Root Go watchlist/state service still routed by nginx | repo root | root `Dockerfile` | none | bind-mounted config | `postgres` healthy | no | `unless-stopped` |
| `rsi-willr-monitor` | legacy | Root Go RSI/WILLR monitoring service still routed by nginx | repo root | root `Dockerfile` | none | bind-mounted config | `postgres` healthy | no | `unless-stopped` |
| `option-chain-watcher` | core | Option-chain analytics API and screenshots | [`services/option-chain-watcher`](../../services/option-chain-watcher) | local Dockerfile | internal only | image-local runtime only | `postgres` healthy | yes | `unless-stopped` |
| `nse_ingestor` | core | NSE file ingestion and sync scheduler | [`services/nse_ingestor`](../../services/nse_ingestor) | local Dockerfile | none | bind-mounted inbound/staging/logs/ops | `postgres` healthy | no | `unless-stopped` |
| `institutional-flow-ingest` | job | Profile-gated one-off institutional flow import | [`services/institutional_flow_ingest`](../../services/institutional_flow_ingest) | local Dockerfile | none | bind-mounted raw/staging/curated/logs/report dirs | `postgres` healthy | no | `"no"` |
| `nse-analytics-worker` | core | Market summary/snapshot refresh loop | [`services/nse_analytics_worker`](../../services/nse_analytics_worker) | local Dockerfile | none | bind-mounted runtime/logs + ops | `postgres` healthy, `nse_ingestor` started | no | `unless-stopped` |
| `nse-orchestrator` | core | Scheduled orchestration/export refresh coordination | [`services/nse_orchestration_exports`](../../services/nse_orchestration_exports) | repo-root context + shared Dockerfile | none | bind-mounted exports volume | `postgres` healthy, `nse_ingestor` started, `nse-analytics-worker` started | no | `unless-stopped` |
| `nse-export-api` | core | Dashboard/watchlist/export/ops proxy backend used by the N50 app | [`services/nse_orchestration_exports`](../../services/nse_orchestration_exports) | repo-root context + shared Dockerfile | `8091 -> 8091` | bind-mounted exports volume | `postgres` healthy, `nse-orchestrator` started | no | `unless-stopped` |
| `nse-intraday-api` | core | Intraday analytics API proxied under `/n50/api/v1/intraday/*` | [`services/nse_intraday_intelligence`](../../services/nse_intraday_intelligence) | repo-root context + shared Dockerfile | `8092 -> 8092` | bind-mounted intraday exports volume | `postgres` healthy, `nse-orchestrator` started | no | `unless-stopped` |
| `nse-intraday-scheduler` | core | Intraday refresh scheduler | [`services/nse_intraday_intelligence`](../../services/nse_intraday_intelligence) | repo-root context + shared Dockerfile | none | bind-mounted intraday exports volume | `postgres` healthy, `nse-intraday-api` started | no | `unless-stopped` |
| `nse-reco-api` | core | Recommendation/state-aware API consumed by the N50 app | [`services/nse_reco_state_engine`](../../services/nse_reco_state_engine) | local Dockerfile | `8010 -> 8010` | bind-mounted exports dir | `postgres` healthy, `nse-intraday-api` started | no | `unless-stopped` |
| `nse-reco-scheduler` | core | Recommendation/anomaly/scorecard scheduler | [`services/nse_reco_state_engine`](../../services/nse_reco_state_engine) | local Dockerfile | none | bind-mounted exports dir | `postgres` healthy, `nse-reco-api` started | no | `unless-stopped` |
| `market-data-gateway` | core | Supporting metrics/global market data service consumed by the dashboard | [`services/market_data_gateway`](../../services/market_data_gateway) | local Dockerfile | internal only | none | none | yes | `unless-stopped` |
| `n50-dashboard` | core | Production N50 web/UI/API app mounted under `/n50/` | [`neon-stock-terminal`](../../neon-stock-terminal) | `trading-stack-n50-dashboard:latest` | internal only | none | `postgres` healthy, `redis` healthy, `nse-reco-api` started, `market-data-gateway` started | no | `unless-stopped` |
| `n50-dashboard-stage` | optional | Stage N50 web/UI/API app mounted under `/n50-stage/` | [`neon-stock-terminal`](../../neon-stock-terminal) | `trading-stack-n50-dashboard-stage:latest` | internal only | none | `postgres` healthy, `redis` healthy, `nse-reco-api` started, `market-data-gateway` started | no | `unless-stopped` |

## Current Route Ownership

- `/n50/*` -> `n50-dashboard`
- `/n50-stage/*` -> `n50-dashboard-stage`
- `/n50/api/v1/dashboard/*`, `/n50/api/v1/watchlists*`, `/n50/api/v1/ops/*`, `/n50/api/v1/exports/*` -> `nse-export-api` through the dashboard same-origin proxy
- `/n50/api/v1/intraday/*` -> `nse-intraday-api` through the dashboard same-origin proxy
- `/option-chain/*` -> `option-chain-watcher`
- `/backend/*`, `/paper`, `/watcher`, `/digii4/*`, `/api/digii4/*` -> `watchlist`
- `/rsi-willr/*` -> `rsi-willr-monitor`
- `/matomo/*` -> `matomo`

## Assumptions And Limitations

- Service purpose labels are inferred from compose definitions, service READMEs, and the current endpoint/routing docs. They are good enough for topology work, but not a substitute for product-owner signoff.
- `institutional-flow-ingest` is profile-gated and is not part of the default runtime path unless explicitly enabled.
- This baseline describes the current single-host Docker Compose deployment only. It does not imply that the same split exists in CI, stage promotion, or any separate production server flow.
- `docker compose config --format json` resolves environment defaults and placeholders; this report intentionally omits secret values and focuses on structure.
