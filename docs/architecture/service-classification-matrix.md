# Phase 2 Service Classification Matrix

Last reviewed: 2026-04-03

This matrix records the service-by-service classification used to split the stack into deployable overlays. The goal in Phase 2 is topology isolation only, not service removal.

| Service | Class | Why it belongs there | What depends on it | Nginx routed? | Host port? | Mandatory for prod-like runtime? |
|---|---|---|---|---|---|---|
| `postgres` | shared infrastructure | primary relational store for dashboard, exports, intraday, reco, and legacy state | nearly every app service | no | yes (`5432`) | yes |
| `redis` | shared infrastructure | session/cache backing for the dashboard runtime | `n50-dashboard`, `n50-dashboard-stage` | no | no | yes for current dashboard behavior |
| `nse_ingestor` | core | drives upstream NSE ingestion used by analytics/orchestration | `nse-analytics-worker`, `nse-orchestrator` | no | no | yes |
| `nse-analytics-worker` | core | refreshes derived analytics snapshots consumed downstream | `nse-orchestrator` | no | no | yes |
| `nse-orchestrator` | core | coordinates exports and downstream refresh jobs | `nse-export-api`, `nse-intraday-api` | no | no | yes |
| `nse-export-api` | core | same-origin export/watchlist/ops API for the N50 surface | `nginx`, `n50-dashboard` callers | yes, via `/n50/api/v1/*` and `/api/v1/*` | yes (`8091`) | yes |
| `nse-intraday-api` | core | same-origin intraday API for the N50 surface | `nginx`, `nse-intraday-scheduler`, `nse-reco-api` | yes, via `/n50/api/v1/intraday/*` and `/api/v1/intraday/*` | yes (`8092`) | yes |
| `nse-intraday-scheduler` | core | keeps intraday data fresh for live product behavior | no direct edge consumer; feeds intraday/reco pipeline | no | no | retained as yes to avoid behavior change |
| `nse-reco-api` | core | recommendation/state API consumed by the dashboard | `n50-dashboard`, `n50-dashboard-stage`, `nse-reco-scheduler` | no direct nginx route, but dashboard depends on it | yes (`8010`) | yes |
| `nse-reco-scheduler` | core | keeps recommendation/state outputs current | no direct consumer; feeds reco state tables | no | no | retained as yes to avoid behavior change |
| `market-data-gateway` | core | supporting metrics/global market data for the N50 dashboard | `n50-dashboard`, `n50-dashboard-stage` | no | no | yes |
| `option-chain-watcher` | core | option-chain API still exposed on the public dashboard host | `nginx`, dashboard option-chain flows | yes, via `/option-chain/*` | no | yes |
| `n50-dashboard` | core | production N50 UI/API app mounted under `/n50/` | `nginx` | yes, via `/n50/*` and same-origin auth/API paths | no | yes |
| `nginx` | core edge | public prod-like edge for retained routed surfaces | external callers | yes, it is the edge | yes (`19090`) | yes |
| `n50-dashboard-stage` | stage | stage-only copy of the N50 UI/API app | stage edge only | yes, via `/n50-stage/*` | no | no |
| `matomo-db` | telemetry | telemetry-only MariaDB backing store | `matomo` | no | no | no |
| `matomo` | telemetry | telemetry/admin surface, not required for the core product path | telemetry operators, old mixed edge | yes, via `/matomo/*` in the original mixed edge | yes (`19091`) | no |
| `institutional-flow-ingest` | jobs | one-off/scheduled import path, already profile-gated in the baseline | manual run or separate scheduler | no | no | no |
| `collector` | legacy/uncertain | root Go collector with no current prod-like edge route | no proven prod-like edge consumer in Phase 2 | no | yes (`8080` default) | no |
| `strategy` | legacy/uncertain | root Go strategy engine with no current prod-like edge route | no proven prod-like edge consumer in Phase 2 | no | no | no |
| `watchlist` | legacy/uncertain | still routed by legacy endpoints but not needed for `/n50/*` | legacy edge and watchlist paths | yes, via `/backend/*`, `/paper*`, `/watcher*`, `/digii4/*` | no | no for prod-like, yes for legacy overlay |
| `rsi-willr-monitor` | legacy/uncertain | still routed by legacy RSI/WILLR endpoints only | legacy edge | yes, via `/rsi-willr/*` | no | no for prod-like, yes for legacy overlay |

## Classification Decisions

- `nse-export-api`, `nse-intraday-api`, and `option-chain-watcher` stayed in the prod-like runtime because the N50 dashboard and nginx still route to them directly.
- `nse-intraday-scheduler` and `nse-reco-scheduler` stayed in the prod-like runtime even though they are not edge-routed. This phase preserves current behavior rather than guessing whether those background refresh loops are optional.
- `collector` and `strategy` moved behind the legacy overlay because Phase 2 found no current nginx route or N50 frontend dependency proving they are required for the main product path.
- `watchlist` and `rsi-willr-monitor` remain available, but only through the legacy overlay, because the old edge still exposes their routes and Phase 2 did not prove those paths unused.
