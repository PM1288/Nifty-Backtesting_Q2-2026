# Harden Live-Data Performance, Connection Management, DB Retention, and Lookup Speed

## Objective

Make hot read paths, database pooling, retention posture, and operator visibility explicit for the live-data stack without broad rewrites or freshness regressions.

## Repo facts verified

- `/v1/overview` is already snapshot-backed, but `/v1/leaderboard` rebuilds overview data on every request.
- `/v1/stocks/:symbol` is a direct-query route with `instrument_universe`, `instrument_state`, `bars_1d`, and `bars_1m` lookups.
- Backtesting overview-style routes are already snapshot-backed through `serveSnapshotRoute`.
- The option-chain watcher already uses an explicit `pg` pool, but its query-backed hot paths still need documented ownership and index support.
- Go services already expose explicit `pgxpool` controls through env vars in compose and code.
- The Node API currently relies on Prisma URL query params for pool sizing instead of explicit service-level env vars.
- `services/nse_intraday_intelligence` and `services/nse_orchestration_exports` still create a new psycopg connection per helper call.
- `services/nse_reco_state_engine` currently uses SQLAlchemy `NullPool`.
- Some performance indexes still exist only in `neon-stock-terminal/apps/api/src/lib/dbPerformance.ts` as transitional runtime DDL.
- Postgres in compose already enables `pg_stat_statements` and `track_io_timing`.

## Files inspected

- `README.md`
- `docker-compose.yml`
- `docs/endpoints.md`
- `internal/store/postgres.go`
- `neon-stock-terminal/apps/api/src/lib/dbPerformance.ts`
- `neon-stock-terminal/apps/api/src/lib/requestMetrics.ts`
- `neon-stock-terminal/apps/api/src/lib/dashboardSnapshots.ts`
- `neon-stock-terminal/apps/api/src/routes/overview.ts`
- `neon-stock-terminal/apps/api/src/routes/stocks.ts`
- `neon-stock-terminal/apps/api/src/routes/backtesting.ts`
- `neon-stock-terminal/apps/api/src/routes/health.ts`
- `services/option-chain-watcher/src/store.ts`
- `services/option-chain-watcher/src/db.ts`
- `services/nse_intraday_intelligence/src/nse_intraday_intelligence/config.py`
- `services/nse_intraday_intelligence/src/nse_intraday_intelligence/db.py`
- `services/nse_intraday_intelligence/sql/063_realtime_lookup_indexes.sql`
- `services/nse_orchestration_exports/src/nse_orchestration_exports/config.py`
- `services/nse_orchestration_exports/src/nse_orchestration_exports/db.py`
- `services/nse_reco_state_engine/src/nse_reco_state_aware_engine/core/config.py`
- `services/nse_reco_state_engine/src/nse_reco_state_aware_engine/db/conn.py`
- `services/nse_reco_state_engine/sql/077_realtime_lookup_indexes.sql`

## Plan

1. Add this worklog and create explicit performance/retention docs.
2. Replace implicit or per-call DB connection behavior with bounded, documented pool settings where justified.
3. Remove the hottest repeated overview recompute from `/v1/leaderboard` by serving a snapshot-backed or cached read path.
4. Promote justified API performance indexes out of runtime DDL into explicit SQL ownership.
5. Add operator visibility for DB sizing, retention, and hot-query state through docs and health metadata.
6. Validate with targeted route checks, perf smoke, cleanup checks, and Playwright screenshots.

## Changes made

- Added explicit performance and retention documentation:
  - `docs/perf/PERF_BASELINE.md`
  - `docs/perf/DB_RETENTION_AND_CAPACITY.md`
- Added `ADR-005` to record the performance posture decision:
  - snapshot-backed hot reads over repeated page-time recomputes
  - explicit bounded DB pools per service
  - migration-owned read-model indexes instead of runtime DDL
- Moved the hottest repeated dashboard read path to the existing overview snapshot:
  - `neon-stock-terminal/apps/api/src/routes/overview.ts`
  - `/v1/leaderboard` now derives from the overview snapshot and returns snapshot metadata headers
- Promoted API read-model indexes out of runtime DDL into owned SQL:
  - `db/sql/010_api_read_model_indexes.sql`
  - wired into `scripts/db_migrate_all.sh`
  - documented in `db/SCHEMA_OWNERSHIP.md` and `db/MIGRATION_STRATEGY.md`
- Tightened Node DB performance/operator visibility:
  - `neon-stock-terminal/apps/api/src/lib/dbPerformance.ts`
  - `neon-stock-terminal/apps/api/src/routes/health.ts`
  - `/health` now reports DB size, Prisma pool settings, and top `pg_stat_statements` entries
- Replaced per-call Python connections with explicit bounded pools:
  - `services/nse_intraday_intelligence/src/nse_intraday_intelligence/config.py`
  - `services/nse_intraday_intelligence/src/nse_intraday_intelligence/db.py`
  - `services/nse_orchestration_exports/src/nse_orchestration_exports/config.py`
  - `services/nse_orchestration_exports/src/nse_orchestration_exports/db.py`
  - added `psycopg-pool` to both service dependency sets
- Replaced recommendation API `NullPool` with explicit SQLAlchemy queue-pool settings:
  - `services/nse_reco_state_engine/src/nse_reco_state_aware_engine/core/config.py`
  - `services/nse_reco_state_engine/src/nse_reco_state_aware_engine/db/conn.py`
- Extended service health visibility:
  - intraday `/health` now reports DB pool + retention
  - orchestration export `/health` now reports DB pool + retention
  - reco `/health` was added with DB pool + retention visibility
- Made option-chain pool lifetime explicit and added a hot-path composite index:
  - `services/option-chain-watcher/src/db.ts`
  - `services/option-chain-watcher/src/migrate.ts`
- Made Node pool sizing explicit in compose instead of implicit-only URL literals:
  - `docker-compose.yml`
- Updated service/operator docs:
  - `README.md`
  - `services/nse_intraday_intelligence/README.md`
  - `services/nse_orchestration_exports/README.md`
  - `services/nse_reco_state_engine/README.md`

## Validation run

- `corepack pnpm --dir neon-stock-terminal --filter @app/api typecheck`
  - passed
- `corepack pnpm --dir neon-stock-terminal --filter @app/api test`
  - passed, 13 tests
- `python -m compileall services/nse_intraday_intelligence/src services/nse_orchestration_exports/src services/nse_reco_state_engine/src`
  - passed
- `docker compose config -q`
  - passed
- `C:\Program Files\Git\bin\bash.exe -n scripts/db_migrate_all.sh`
  - passed
- `docker compose build nse-export-api nse-intraday-api nse-reco-api option-chain-watcher n50-dashboard n50-dashboard-stage`
  - passed
- `docker compose up -d nse-export-api nse-intraday-api nse-reco-api option-chain-watcher n50-dashboard n50-dashboard-stage nginx`
  - passed
- Route and health checks:
  - `http://localhost:8091/health` -> `200`
  - `http://localhost:8092/health` -> `200`
  - `http://localhost:19090/n50/health` -> `200`
  - `http://localhost:19090/n50-stage/health` -> `200`
  - `http://localhost:19090/api/v1/intraday/summary` -> `200`
  - `http://localhost:19090/option-chain/api/latest` -> `200`
- Node health confirmed:
  - DB size about `15 GB`
  - Prisma pool settings surfaced as `{ connectionLimit: 2, poolTimeoutSeconds: 5 }`
  - `pg_stat_statements` surfaced hot queries
- Retention cleanup check:
  - `docker compose run --rm collector --config /app/config.yaml --db-cleanup-only`
  - passed and completed cleanup/analyze flow
- Targeted hot-path benchmark:
  - removed current-day overview snapshot row + Redis cache key
  - cold `/v1/leaderboard?limit=20` request: about `0.173588s`
  - warm `/v1/leaderboard?limit=20` request: about `0.004663s`
  - warm response headers confirmed snapshot reuse:
    - `X-Snapshot-Key: overview`
    - `X-Snapshot-Source: redis`
    - `X-Snapshot-Status: hit`
- Spot-check symbol detail route:
  - `/n50/v1/stocks/RELIANCE` returned `200`
  - observed around `5.99s` on the validation path

## Screens reviewed

- Playwright smoke output root:
  - `output/playwright/data-plane-performance-retention-and-pooling/`
- Reviewed representative screens:
  - `output/playwright/data-plane-performance-retention-and-pooling/desktop/landing.png`
  - `output/playwright/data-plane-performance-retention-and-pooling/desktop/options.png`
  - `output/playwright/data-plane-performance-retention-and-pooling/tablet/backtesting.png`
  - `output/playwright/data-plane-performance-retention-and-pooling/mobile/analytics-stock-reliance.png`
- Also captured desktop/laptop/tablet/mobile variants for:
  - landing
  - analytics stock details (`RELIANCE`)
  - options
  - backtesting
- Visual review outcome:
  - no new overflow, clipping, sticky-header, or obvious touch-target regressions introduced by the Phase 5 changes

## Decisions made

- Keep Phase 5 focused on explicit pool bounds, snapshot-backed hot reads, migration-safe index ownership, and operator visibility.
- Do not broaden this phase into a full query rewrite of `/v1/stocks/:symbol`; document it as a follow-up hot path instead.
- Keep `N50_API_ALLOW_RUNTIME_PERF_DDL` as legacy compatibility only; it no longer owns index creation.

## Risks / follow-ups

- `/v1/stocks/:symbol` remains the slowest user-facing hot path validated in this phase and still deserves a dedicated read-model/query-plan pass.
- `pg_stat_statements` still shows the overview-generation query family as a dominant cost center; snapshot reuse reduced repeat page cost, but snapshot generation itself is still expensive.
- Python services now hold small steady-state pools, so pool sizes should be observed in stage/prod before increasing traffic caps further.
- Phase 5 intentionally did not add a shared migration ledger for the Python SQL packages.

## Resume here next time

1. Profile and reduce `/v1/stocks/:symbol` latency.
2. Consider moving additional repeated detail queries behind explicit read models if operator traces justify it.
3. Add a shared migration ledger/status mechanism for the remaining SQL-owned Python services.
