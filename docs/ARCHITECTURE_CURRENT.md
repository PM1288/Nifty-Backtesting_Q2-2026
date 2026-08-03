# N50 Architecture Current

Last reviewed: 2026-03-31

This document describes the current deployed N50 architecture in this repository. It is the live current-state companion to [SOURCE_OF_TRUTH.md](./SOURCE_OF_TRUTH.md).

## System purpose

The product is a production-facing market-analysis platform with:

- a same-origin React SPA for PROD under `/n50/`
- a same-origin React SPA for STAGE under `/n50-stage/`
- a Node BFF/API that owns auth, sessions, feedback, dashboard APIs, and proxies
- Go writer/collector services that ingest and derive market data
- Python read-model and analytics APIs
- a separate option-chain watcher service exposed under `/option-chain/*`

## Public entrypoints

### Production

- Root host: `https://m.nifty50today.co.in/`
- App base path: `https://m.nifty50today.co.in/n50/`

### Stage

- Root host: `https://stage.nifty50today.co.in/`
- App base path: `https://stage.nifty50today.co.in/n50-stage/`

### Local

- Reverse proxy: `http://localhost:19090`
- PROD app: `http://localhost:19090/n50/`
- STAGE app: `http://localhost:19090/n50-stage/`
- Local Matomo admin: `http://localhost:19091/`

## Current runtime boundaries

| Layer | Current owner | Notes |
|---|---|---|
| Browser shell and route rendering | `neon-stock-terminal/apps/web` | React SPA mounted under `/n50/` and `/n50-stage/` |
| Same-origin auth, feedback, dashboard APIs, and proxying | `neon-stock-terminal/apps/api` | Served together with the web app in `n50-dashboard` and `n50-dashboard-stage` |
| Public ingress and route ownership | `compose/nginx/nginx.conf` | Canonical ingress source of truth |
| Primary datastore | `postgres` | Shared by prod and stage |
| Session and snapshot cache | `redis` | Shared server, isolated DB indexes for prod vs stage |
| Market-data collection and derived writes | Go services in repo root `cmd/`, `internal/` | Collector, strategy, watchlist, monitor |
| NSE ingestion and snapshot publishing | `services/nse_ingestor`, `services/nse_analytics_worker`, `services/nse_orchestrator` | Own bulk ingestion, exports orchestration, and precompute work |
| Read-heavy analytics APIs | `services/nse_intraday_intelligence`, `services/nse_orchestration_exports`, `services/nse_reco_state_engine` | Same-origin proxied under `/api/v1/*` |
| Option-chain service | `services/option-chain-watcher` | Mounted separately under `/option-chain/*` |
| Governed offline research/backtesting | `platform/nifty_stratlab` | Additive bounded package; not on collector hot path and not yet the published UI read model. |
| Product analytics | `matomo` plus web analytics integrations | Matomo stays behind same-origin proxy path |

## Route ownership

### React app routes

The React SPA owns the user-facing page routes documented in [product-surface-map.md](./product-surface-map.md), including:

- `/`
- `/analytics/*`
- `/feedback`
- `/options`
- `/backtesting/*`
- `/heatmap/*`

These routes are mounted under:

- `/n50/` for PROD
- `/n50-stage/` for STAGE

### Node app routes

The Node app owns the same-origin app/API surface documented in [endpoints.md](./endpoints.md), including:

- `/health`
- `/ready`
- `/auth/*`
- `/v1/*`
- `/internal/snapshots/refresh`
- `/api/v1/*` proxy fan-out

### nginx-owned public ingress routes

The active ingress config owns:

- `/n50/`
- `/n50-stage/`
- `/auth/*`
- `/v1/*`
- `/api/v1/*`
- `/matomo/*`
- `/option-chain/*`

`compose/n50-nginx/nginx.conf` is historical only and is not active.

## Stage / prod model

The current deployment model is one machine with two app-layer environments:

- `n50-dashboard`
  - PROD bundle + Node app
  - base path `/n50/`
  - Redis DB index `0`
- `n50-dashboard-stage`
  - STAGE bundle + Node app
  - base path `/n50-stage/`
  - Redis DB index `1`

Both environments share:

- one PostgreSQL database
- the same ingestion and analytics writer services
- one nginx ingress

They are isolated by:

- cookie names
- cookie paths
- Redis DB index
- app bundle path

The detailed deployment flow lives in [n50-stage-prod-hosting.md](./n50-stage-prod-hosting.md).

## Data lifecycle

At a high level:

1. Go and NSE ingestion services collect or import market data.
2. PostgreSQL stores raw, derived, and published read models.
3. Analytics workers and schedulers publish snapshots and derived state.
4. Redis caches session and snapshot state for the Node app.
5. The Node app serves current-state and snapshot-backed APIs.
6. The browser reads the same-origin APIs and proxied APIs through nginx.
7. Trust/health surfaces expose readiness, freshness, and operator signals.

See the Mermaid diagrams:

- [System context](./diagrams/system-context.mmd)
- [Request flow](./diagrams/request-flow.mmd)
- [Data lifecycle](./diagrams/data-lifecycle.mmd)
- [Stage / prod topology](./diagrams/stage-prod-topology.mmd)
- [User navigation flow](./diagrams/user-navigation-flow.mmd)

## Current docs map

Use these docs together:

- [SOURCE_OF_TRUTH.md](./SOURCE_OF_TRUTH.md)
- [endpoints.md](./endpoints.md)
- [stack-current.md](./stack-current.md)
- [product-surface-map.md](./product-surface-map.md)
- [n50-stage-prod-hosting.md](./n50-stage-prod-hosting.md)
- [../db/SCHEMA_OWNERSHIP.md](../db/SCHEMA_OWNERSHIP.md)
- [../db/MIGRATION_STRATEGY.md](../db/MIGRATION_STRATEGY.md)
- [perf/PERF_BASELINE.md](./perf/PERF_BASELINE.md)
- [perf/DB_RETENTION_AND_CAPACITY.md](./perf/DB_RETENTION_AND_CAPACITY.md)
