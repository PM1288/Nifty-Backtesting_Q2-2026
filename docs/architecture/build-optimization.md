# Phase 3 Build Optimization

This document records the Phase 3 build-graph changes: narrower Docker build contexts, shared-image consolidation per codebase, and standardized compose invocation around explicit env files.

## Summary

Phase 3 reduces build bloat without changing the routed product surface or removing services from the repo.

- Core overlays no longer use repo-root build contexts.
- Shared codebases now build one image artifact reused by multiple services where the runtime content is the same.
- Dockerfiles were converted to cache-friendlier multi-stage builds with more selective `COPY` usage.
- Build context pollution from logs, exports, caches, local environments, and generated runtime directories is materially reduced through tighter `.dockerignore` files.
- Compose operator workflows are standardized around explicit `--env-file .env` usage.
- The split nginx configs now opt into Docker DNS re-resolution so rebuilt upstream containers do not leave the edge pinned to dead IPs after image refreshes.
- `compose.dev.yml` remains intentionally larger and convenience-oriented. That is a deliberate local workflow, not a prod regression.

## Build-Context And Bind-Mount Inventory

| Service | Codebase group | Current context | Target context | Shared image candidate | Runtime bind mounts | Context bloat risks | Action taken or deferred |
|---|---|---|---|---|---|---|---|
| `nse-orchestrator` | `nse_orchestration_exports` | `services/` | `services/` | `trading-stack-nse-orchestration-exports:latest` | `services/nse_orchestration_exports/runtime/exports` | previous repo-root context pulled unrelated services, exports, caches | Narrowed from repo root to `services/`; runtime exports mount kept for Phase 4 |
| `nse-export-api` | `nse_orchestration_exports` | `services/` | `services/` | `trading-stack-nse-orchestration-exports:latest` | `services/nse_orchestration_exports/runtime/exports` | same as orchestrator | Reused shared image and kept exports mount deferred |
| `nse-intraday-api` | `nse_intraday_intelligence` | `services/nse_intraday_intelligence` | `services/nse_intraday_intelligence` | `trading-stack-nse-intraday-intelligence:latest` | `services/nse_intraday_intelligence/runtime/exports` | old repo-root context carried unrelated runtime data | Narrowed to service-local context; exports mount deferred |
| `nse-intraday-scheduler` | `nse_intraday_intelligence` | `services/nse_intraday_intelligence` | `services/nse_intraday_intelligence` | `trading-stack-nse-intraday-intelligence:latest` | `services/nse_intraday_intelligence/runtime/exports` | same as intraday API | Reused shared image and kept exports mount deferred |
| `nse-reco-api` | `nse_reco_state_engine` | `services/nse_reco_state_engine` | `services/nse_reco_state_engine` | `trading-stack-nse-reco-state-engine:latest` | `services/nse_reco_state_engine/runtime/exports` | local state and exports in broad contexts | Reused shared image; runtime exports mount deferred |
| `nse-reco-scheduler` | `nse_reco_state_engine` | `services/nse_reco_state_engine` | `services/nse_reco_state_engine` | `trading-stack-nse-reco-state-engine:latest` | `services/nse_reco_state_engine/runtime/exports` | same as reco API | Reused shared image; runtime exports mount deferred |
| `nse_ingestor` | `nse_ingestor` | `services/nse_ingestor` | `services/nse_ingestor` | `trading-stack-nse-ingestor:latest` | `runtime/inbound`, `runtime/staging`, `runtime/logs`, `ops` | inbound data, staging data, logs, local scripts | Service-local context with tighter ignore rules; runtime mounts intentionally kept |
| `nse-analytics-worker` | `nse_analytics_worker` | `services/nse_analytics_worker` | `services/nse_analytics_worker` | `trading-stack-nse-analytics-worker:latest` | `runtime/logs`, `ops` | logs, caches, transient analytics artifacts | Service-local context with tighter ignore rules; runtime mounts intentionally kept |
| `market-data-gateway` | `market_data_gateway` | `services/market_data_gateway` | `services/market_data_gateway` | `trading-stack-market-data-gateway:latest` | none in core | Python caches and local env files | Service-local context with multi-stage build |
| `option-chain-watcher` | `option-chain-watcher` | `services/option-chain-watcher` | `services/option-chain-watcher` | `trading-stack-option-chain-watcher:latest` | none in core, uses `tmpfs` | old image depended on host `node_modules` and `dist`; local caches | Self-contained build from source with tighter ignore rules |
| `n50-dashboard` | `neon-stock-terminal` | `neon-stock-terminal` | `neon-stock-terminal` | shared builder, separate final image | none in core | node modules, Vite caches, Playwright artifacts, docs | Shared multi-stage Dockerfile; final image kept separate because base-path args differ |
| `n50-dashboard-stage` | `neon-stock-terminal` | `neon-stock-terminal` | `neon-stock-terminal` | shared builder, separate final image | none in stage | same as prod dashboard | Same builder optimization; separate final image intentionally retained |
| `institutional-flow-ingest` | `institutional_flow_ingest` | `services/institutional_flow_ingest` | `services/institutional_flow_ingest` | `trading-stack-institutional-flow-ingest:latest` | `raw`, `staging`, `curated`, `logs`, `run_reports` | large runtime data directories and reports | Service-local context; runtime data mounts intentionally deferred to Phase 4 |
| `collector` | `go-suite` | repo root | repo root for now | `trading-stack-go-suite:latest` | config and local state mounts in legacy/dev | shared Go repo layout still spans repo root | Shared image deduplicated; root context remains only in legacy/dev and is explicitly deferred |
| `strategy` | `go-suite` | repo root | repo root for now | `trading-stack-go-suite:latest` | config and local state mounts in legacy/dev | same as collector | Shared image deduplicated; root context deferred |
| `watchlist` | `go-suite` | repo root | repo root for now | `trading-stack-go-suite:latest` | config and local state mounts in legacy/dev | same as collector plus legacy route coupling | Shared image deduplicated; root context deferred |
| `rsi-willr-monitor` | `go-suite` | repo root | repo root for now | `trading-stack-go-suite:latest` | config and local state mounts in legacy/dev | same as collector plus legacy route coupling | Shared image deduplicated; root context deferred |

## Shared-Image Codebase Groups

| Codebase group | Services | Shared image result | Notes |
|---|---|---|---|
| `nse_orchestration_exports` | `nse-orchestrator`, `nse-export-api` | `trading-stack-nse-orchestration-exports:latest` | One Python image, different commands |
| `nse_intraday_intelligence` | `nse-intraday-api`, `nse-intraday-scheduler` | `trading-stack-nse-intraday-intelligence:latest` | One Python image, different commands |
| `nse_reco_state_engine` | `nse-reco-api`, `nse-reco-scheduler` | `trading-stack-nse-reco-state-engine:latest` | One Python image, different commands |
| `go-suite` | `collector`, `strategy`, `watchlist`, `rsi-willr-monitor` | `trading-stack-go-suite:latest` | Shared legacy/dev-only image from the common Go codebase |
| `neon-stock-terminal` | `n50-dashboard`, `n50-dashboard-stage` | shared multi-stage Dockerfile, separate final images | Final images remain split because compile-time base path differs |
| `option-chain-watcher` | `option-chain-watcher` | `trading-stack-option-chain-watcher:latest` | Single-service image, now self-contained |
| `nse_ingestor` | `nse_ingestor` | `trading-stack-nse-ingestor:latest` | Single-service image |
| `nse_analytics_worker` | `nse-analytics-worker` | `trading-stack-nse-analytics-worker:latest` | Single-service image |
| `market_data_gateway` | `market-data-gateway` | `trading-stack-market-data-gateway:latest` | Single-service image |
| `institutional_flow_ingest` | `institutional-flow-ingest` | `trading-stack-institutional-flow-ingest:latest` | Single-service image |

## Dockerfile And Ignore Strategy

- Root `.dockerignore` is now restrictive and supports only the Go-suite legacy/dev image path.
- `services/.dockerignore` narrows the shared orchestration build context to the few subtrees actually required.
- Service-local `.dockerignore` files exclude logs, exports, generated runtime data, caches, local env files, and test artifacts from build contexts.
- Python codebases use multi-stage builds with dependency installation in a builder stage and slim runtime stages.
- The dashboard Dockerfile uses a shared `deps -> builder -> runtime` flow and no longer relies on `--network=host`.
- The option-chain watcher now builds from source in Docker instead of assuming host-populated `node_modules` and `dist`.
- Remaining runtime bind mounts are documented rather than silently carried forward.

## Standard Compose Command Pattern

All operator examples and helper scripts should use explicit env files.

### Prod-like core

```bash
docker compose --env-file .env -f compose/compose.base.yml -f compose/compose.core.yml build
docker compose --env-file .env -f compose/compose.base.yml -f compose/compose.core.yml up -d
docker compose --env-file .env -f compose/compose.base.yml -f compose/compose.core.yml ps
```

### Stage

```bash
docker compose --env-file .env -f compose/compose.base.yml -f compose/compose.stage.yml build
docker compose --env-file .env -f compose/compose.base.yml -f compose/compose.stage.yml up -d
```

### Telemetry

```bash
docker compose --env-file .env -f compose/compose.base.yml -f compose/compose.telemetry.yml up -d
```

### Jobs

```bash
docker compose --env-file .env -f compose/compose.base.yml -f compose/compose.jobs.yml run --rm institutional-flow-ingest
```

### Legacy opt-in

```bash
docker compose --env-file .env -f compose/compose.base.yml -f compose/compose.legacy.yml up -d
```

### Local dev

```bash
docker compose --env-file .env -f compose/compose.base.yml -f compose/compose.dev.yml up --build
```

`compose.dev.yml` intentionally remains larger than the prod-like path because it preserves local all-in-one convenience behavior.

## Metrics

### Direct image benchmarks

| Codebase | Baseline no-cache | Current no-cache | Baseline cached | Current cached | Baseline image size | Current image size | Notes |
|---|---:|---:|---:|---:|---:|---:|---|
| `nse_orchestration_exports` | 70.02s | 62.14s | 1.24s | 3.73s | 206.1 MB | 108.5 MB | Current build uses the narrowed `services/` context and a shared runtime image |
| `neon-stock-terminal` | 75.86s | 71.42s | 3.84s | 3.83s | 607.5 MB | 165.9 MB | Current Dockerfile no longer requires `network.host`; the final runtime stage also restores OpenSSL support for Prisma |
| `option-chain-watcher` | baseline build failed from clean checkout | 12.74s | baseline cached unavailable | 2.42s | local pre-phase image was 3.23 GB | 820.8 MB | Current Dockerfile is self-contained and reproducible |

### Compose benchmark

| Benchmark | Result |
|---|---:|
| Current cached core build set | 133.84s |
| Current no-cache core build set | 160.46s |

### Local image footprint baseline snapshot

The pre-phase local images included several very large artifacts:

- `trading-stack-n50-dashboard:latest` and `trading-stack-n50-dashboard-stage:latest`: 2.66 GB each
- `trading-stack-option-chain-watcher:latest`: 3.23 GB
- `trading-stack-nse-export-api:latest` and `trading-stack-nse-orchestrator:latest`: 907 MB each
- `trading-stack-nse_ingestor:latest`: 856 MB
- `trading-stack-nse-analytics-worker:latest`: 857 MB

Phase 3 reduces the clear shared-codebase duplication and materially lowers the measured image sizes for the codebases benchmarked directly.

## Deferred To Phase 4

- Remove or replace remaining runtime-critical bind mounts in the prod-like stack.
- Move runtime logs and export directories to immutable-image plus volume patterns.
- Review whether current bind-mounted `ops` scripts should be baked into images.
- Tighten runtime filesystem policy such as read-only roots, non-root users, and `tmpfs` usage where appropriate.

## Deferred Route Tracing For Phase 8

- Final confidence checks for rare legacy-only route families still proxied to `watchlist` and `rsi-willr-monitor`.
- Any undocumented route behavior that survives only through nginx includes or historical API clients.
- Whether the Go-suite legacy services can be reduced further once route ownership is fully proven.

## Risks And Unknowns

- The Go-suite legacy/dev image still uses a repo-root context. That is now isolated away from the prod-like path, but it remains broad until later legacy cleanup.
- Dashboard prod and stage still build separate final images because the base path is a compile-time contract today.
- Core runtime bind mounts are still present and intentionally deferred to Phase 4.
- Health/readiness behavior and DB pool redesign remain out of scope for this phase.
