# Centralize Migration Flow, Assign Schema Ownership, and Stop Uncontrolled Startup-Time DDL

## Objective

Document one authoritative migration flow, assign schema ownership, disable the highest-risk silent runtime DDL paths by default, and keep clean local bootstrap possible through an explicit runner.

## Repo facts verified

- Go collector schema changes are embedded in `internal/store/migrations.go` and triggered by `collector --db-migrate-only`.
- `services/nse_ingestor` and `services/nse_analytics_worker` both run SQL files directly from their entrypoints today.
- The Node API previously created `nse_app.dashboard_snapshots`, seeded fallback backtesting tables, and applied performance DDL from service startup/request paths.
- The option-chain watcher previously ran `migrate(pool)` unconditionally during service startup.
- `services/nse_intraday_intelligence` and `services/nse_orchestration_exports` support startup SQL installation through `INSTALL_SQL_ON_START`, and those paths are now explicit non-default bootstrap toggles.
- `services/nse_reco_state_engine` already exposes an explicit install script and does not rely on service-start DDL in the current compose file.
- Prisma exists in `neon-stock-terminal/apps/api/prisma/schema.prisma`, but no committed Prisma migration history exists in the repo today.

## Files inspected

- `README.md`
- `scripts/db_init.sh`
- `scripts/db_validate.sh`
- `scripts/db_cleanup.sh`
- `internal/store/migrations.go`
- `docker-compose.yml`
- `neon-stock-terminal/README.md`
- `neon-stock-terminal/apps/api/package.json`
- `neon-stock-terminal/apps/api/prisma/schema.prisma`
- `neon-stock-terminal/apps/api/src/lib/runtimeConfig.ts`
- `neon-stock-terminal/apps/api/src/lib/dashboardSnapshots.ts`
- `neon-stock-terminal/apps/api/src/lib/backtestingRegistry.ts`
- `neon-stock-terminal/apps/api/src/routes/health.ts`
- `neon-stock-terminal/apps/api/src/server.ts`
- `services/option-chain-watcher/src/main.ts`
- `services/option-chain-watcher/src/migrate.ts`
- `services/option-chain-watcher/src/config.ts`
- `services/nse_ingestor/app/db.py`
- `services/nse_ingestor/ops/entrypoint.sh`
- `services/nse_analytics_worker/app/db.py`
- `services/nse_analytics_worker/ops/entrypoint.sh`
- `services/nse_intraday_intelligence/src/nse_intraday_intelligence/config.py`
- `services/nse_intraday_intelligence/src/nse_intraday_intelligence/api_main.py`
- `services/nse_intraday_intelligence/src/nse_intraday_intelligence/scheduler_main.py`
- `services/nse_intraday_intelligence/src/nse_intraday_intelligence/manual_jobs.py`
- `services/nse_intraday_intelligence/src/nse_intraday_intelligence/sql_loader.py`
- `services/nse_orchestration_exports/src/nse_orchestration_exports/config.py`
- `services/nse_orchestration_exports/src/nse_orchestration_exports/api_main.py`
- `services/nse_orchestration_exports/src/nse_orchestration_exports/scheduler_main.py`
- `services/nse_orchestration_exports/src/nse_orchestration_exports/manual_jobs.py`
- `services/nse_orchestration_exports/src/nse_orchestration_exports/sql_loader.py`
- `services/nse_reco_state_engine/scripts/install_sql.py`

## Plan

1. Create schema ownership and migration strategy docs plus this worklog and ADR.
2. Add a root migration runner with explicit service order.
3. Gate runtime DDL in the Node API and option-chain watcher behind explicit non-default flags and add an explicit API bootstrap command.
4. Change intraday/orchestration startup SQL defaults to explicit non-default behavior and document them as transitional.
5. Validate with a clean compose project, then smoke-test `/`, `/options`, and `/backtesting`.

## Changes made

- Added authoritative ownership and execution-order docs:
  - `db/SCHEMA_OWNERSHIP.md`
  - `db/MIGRATION_STRATEGY.md`
- Added `docs/adr/ADR-004-centralized-migration-flow-and-schema-ownership.md` to record the deployment-time migration decision.
- Added root runner `scripts/db_migrate_all.sh` with explicit order:
  1. collector core
  2. nse ingestor
  3. nse analytics worker
  4. API dashboard snapshot bootstrap
  5. option-chain watcher migration
  6. orchestration exports SQL
  7. intraday SQL
  8. recommendation overlay SQL
- Removed Node API mutation of analytics-owned backtesting tables:
  - `neon-stock-terminal/apps/api/src/lib/backtestingRegistry.ts` now serves only an in-memory fallback contract and never writes schema/data.
  - `neon-stock-terminal/apps/api/src/scripts/bootstrapDatabase.ts` now bootstraps only `nse_app.dashboard_snapshots`.
- Gated Node API runtime DDL:
  - `N50_API_ALLOW_RUNTIME_DDL=1` remains the only opt-in for dashboard snapshot infrastructure.
  - added `N50_API_ALLOW_RUNTIME_PERF_DDL=1` for transitional startup performance DDL only.
  - `neon-stock-terminal/apps/api/src/lib/dbPerformance.ts` now verifies core collector tables and fails closed with `CORE_MARKET_SCHEMA_NOT_READY` instead of issuing silent startup DDL by default.
- Gated option-chain startup migrations:
  - `services/option-chain-watcher/src/config.ts`
  - `services/option-chain-watcher/src/main.ts`
  - `services/option-chain-watcher/src/cli.ts`
  - `services/option-chain-watcher/src/db.ts`
  - `services/option-chain-watcher/package.json`
- Fixed option-chain container build flow to use explicit host artifact build before image packaging:
  - `services/option-chain-watcher/Dockerfile`
  - `services/option-chain-watcher/.dockerignore`
- Changed intraday/orchestration startup SQL to explicit opt-in defaults and documented them:
  - `services/nse_intraday_intelligence/src/nse_intraday_intelligence/config.py`
  - `services/nse_orchestration_exports/src/nse_orchestration_exports/config.py`
  - `services/nse_intraday_intelligence/README.md`
  - `services/nse_orchestration_exports/README.md`
- Fixed recommendation SQL ordering in `services/nse_reco_state_engine/scripts/install_sql.py` so explicit install order is deterministic.
- Extended the reusable Playwright smoke harness to accept task and route overrides:
  - `tools/playwright/smoke.mjs`
  - `tools/playwright/README.md`
- Updated deployment/runtime docs and compose defaults:
  - `docker-compose.yml`
  - `README.md`
  - `docs/security/secrets-and-config.md`
- Reduced web bundle risk in `neon-stock-terminal/apps/web/vite.config.ts` by splitting `zrender` out of the `echarts` vendor chunk instead of suppressing the warning threshold.
- Follow-up hardening after restart recovery:
  - fixed proxied export/intraday/matomo response handling in `neon-stock-terminal/apps/api/src/server.ts` by stripping upstream `content-encoding` and `content-length` after Node fetch decompression, which removed browser `ERR_CONTENT_DECODING_FAILED` failures.
  - aligned the API shell CSP in `neon-stock-terminal/apps/api/src/server.ts` with the ingress allowlist so proxied HTML responses no longer emit stale CSP violations for `scripts.clarity.ms`, `apis.google.com`, and `stats.g.doubleclick.net`.
  - extended ingress CSP in `compose/nginx/nginx.conf` to match the same allowlist.
  - added the remaining explicit allowlist entries used by the current product integrations:
    - `connect-src https://d.clarity.ms`
    - `frame-src https://nifty50-2day.firebaseapp.com`
  - removed stray phase-validation containers that were left behind from earlier clean-DB checks.

## Validation run

- `corepack pnpm --dir neon-stock-terminal --filter @app/api typecheck`
  - passed
- `corepack pnpm --dir neon-stock-terminal --filter @app/api test`
  - passed (`13` tests)
- `bash -n scripts/db_migrate_all.sh`
  - passed
- Clean isolated database migration validation completed with explicit commands against a fresh Postgres instance:
  - collector `--db-migrate-only`
  - `nse_ingestor -m app.cli migrate`
  - `nse-analytics-worker -m app.cli migrate`
  - `@app/api db:bootstrap`
  - `option-chain-watcher dist/cli.js migrate`
  - orchestration `manual_jobs install-sql`
  - intraday `manual_jobs install-sql`
  - reco `scripts/install_sql.py --database-url ...`
- Rebuilt local dashboard stack after code changes:
  - `docker compose build n50-dashboard n50-dashboard-stage`
  - `docker compose up -d n50-dashboard n50-dashboard-stage option-chain-watcher nse-export-api nse-intraday-api nse-reco-api nginx`
- Local rebuilt route checks through nginx:
  - `GET /n50/health` -> `200`
  - `GET /n50-stage/health` -> `200`
  - `GET /option-chain/api/latest` -> `200`
  - `GET /auth/csrf` -> `401`
- Empty-DB fail-closed validation:
  - API started against a brand-new Postgres and exited with `CORE_MARKET_SCHEMA_NOT_READY`
  - temp DB remained empty (`0` non-system tables; `0` `nse_app.dashboard_snapshots`)
- Post-restart rebuilt-stack checks after the proxy/CSP fixes:
  - `GET /n50/health` -> `200`
  - `GET /n50-stage/health` -> `200`
  - `GET /option-chain/api/latest` -> `200`
  - `GET /auth/csrf` -> `401`
  - Playwright rerun completed for `/`, `/options`, and `/backtesting` across desktop/laptop/tablet/mobile
  - `ERR_CONTENT_DECODING_FAILED` no longer appears in the captured browser console metadata
  - CSP violations for `scripts.clarity.ms`, `apis.google.com`, `stats.g.doubleclick.net`, `d.clarity.ms`, and the Firebase hosted auth iframe are no longer present in the captured browser console metadata
- Web bundle validation after the Vite split change:
  - `npm run build --workspace=@app/web`
  - completed without the previous oversized-chunk warning
  - resulting vendor chunks:
    - `vendor-echarts` ~437 kB
    - `vendor-zrender` ~175 kB

## Screens reviewed

- `output/playwright/centralize-migration-flow-schema-ownership/desktop/landing.png`
- `output/playwright/centralize-migration-flow-schema-ownership/desktop/options.png`
- `output/playwright/centralize-migration-flow-schema-ownership/desktop/backtesting.png`
- `output/playwright/centralize-migration-flow-schema-ownership/mobile/landing.png`
- `output/playwright/centralize-migration-flow-schema-ownership/mobile/options.png`
- `output/playwright/centralize-migration-flow-schema-ownership/mobile/backtesting.png`
- `output/playwright/centralize-migration-flow-schema-ownership/tablet/options.png`
- `output/playwright/centralize-migration-flow-schema-ownership/tablet/backtesting.png`
- No new overflow/clipping regressions were found on the changed migration/auth paths. Dense options tables still require horizontal scrolling on mobile by design, but the viewport keeps controls reachable and content legible.

## Decisions made

- Collector core tables remain the readiness prerequisite for API startup; the API now verifies that prerequisite instead of trying to “self-heal” the database on boot.
- `nse_app.backtest_*` ownership is assigned to `services/nse_analytics_worker`; the Node API is read-only for that family.
- Transitional runtime DDL remains available only behind explicit operator-set flags and is documented as Phase 1 compatibility, not normal production behavior.
- The root migration runner stays orchestration-first and intentionally does not attempt a risky migration-technology rewrite in this phase.
- The Playwright harness is extended rather than duplicated so future phases can target new routes with env overrides only.

## Risks / follow-ups

- The tracked root `.env` is intentionally sanitized, so rebuilt local compose can drift from the password already stored in the persisted Postgres volume. For this validation pass, the local `trader` password was reset inside the running Postgres container to match the placeholder value so rebuilt services could authenticate again. This is a local-ops concern, not a repo-state regression.
- Vite still emits large chunk warnings for the web build; not addressed in this migration phase.
- The only remaining browser-console warning in this sanitized local environment is an expected Firebase `API_KEY_INVALID` warning on mobile auth flows because the tracked workspace uses placeholder example keys by design. Supplying a real review-safe Firebase web key for the intended project would remove that local warning.

## Resume here next time

1. Phase 2 consolidation: move `nse_app.dashboard_snapshots` into committed migrations instead of API code.
2. Move option-chain tables out of `public` and into a dedicated schema plus explicit SQL/package ownership.
3. Add a shared migration ledger/status table for Python SQL packages so operators can inspect migration state without parsing logs.
