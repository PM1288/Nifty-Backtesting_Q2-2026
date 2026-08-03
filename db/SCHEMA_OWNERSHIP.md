# Schema Ownership

## Objective

Make schema ownership explicit so operators and implementers know which code path is allowed to change which PostgreSQL objects.

## Ownership model

- One migration source per table family.
- Runtime services may read and write data, but must not create or alter schema in production unless an explicit transitional flag is set.
- Shared schemas are allowed, but ownership is assigned at the table family level when a schema contains objects from multiple packages.
- Prisma in `neon-stock-terminal/apps/api/prisma/schema.prisma` is currently a client/data-model contract only. It is not the authoritative migration source because this repo does not contain committed Prisma migrations yet.

## Current ownership

| Schema / table family | Authoritative owner | Migration source | Notes |
| --- | --- | --- | --- |
| `public` or `${POSTGRES_SCHEMA}` core collector tables (`instruments`, `bars_1m`, `quote_snapshots`, `option_greeks`, strategy/paper/watchlist tables, related views) | Go collector stack | `internal/store/migrations.go` via `collector --db-migrate-only` | Primary market-data warehouse for the original stack. |
| `nse.*` | `services/nse_ingestor` | `services/nse_ingestor/sql/*.sql` | Daily NSE ingest and file registry. |
| `nse_app.*` analytics marts and control tables | `services/nse_analytics_worker` | `services/nse_analytics_worker/sql/*.sql` | Includes summary/features/backtesting marts created by the analytics layer. |
| API read-model performance indexes on collector + analytics tables | Root deployment-time migration flow | `db/sql/010_api_read_model_indexes.sql` via `scripts/db_migrate_all.sh` | Cross-owner read optimization layer for `/v1/overview`, `/v1/leaderboard`, and related exported views. |
| `market_data.nse_corporate_actions`, `market_data.nse_event_calendar`, `market_data.nse_financial_results`, `market_data.yf_financial_statements`, `audit.load_manifest` | Root deployment-time migration flow + `services/nifty100_disclosures_pipeline` loader contract | `db/sql/011_nifty100_disclosures.sql` via `scripts/db_migrate_all.sh` | Runtime loader may `COPY` into these tables, but schema changes are owned by the committed SQL migration. |
| `market_data.nse_fii_participant_open_interest`, `market_data.nse_fii_participant_volume`, `market_data.nse_fii_derivatives_stats` | Root deployment-time migration flow + `services/nse_fii_reports_service` loader contract | `db/sql/012_nse_fii_reports.sql` via `scripts/db_migrate_all.sh` | Runtime loader may append or rerun-load by `run_id`, but schema changes are owned by the committed SQL migration. |
| `nse_app.dashboard_snapshots` | Node API (`neon-stock-terminal/apps/api`) | Explicit API bootstrap script | Transitional owner. This should move into a dedicated SQL package in Phase 2. |
| `nse_app.backtest_strategy*`, `nse_app.backtest_run*`, `nse_app.backtest_*_mart`, and related backtesting precompute tables | `services/nse_analytics_worker` | `services/nse_analytics_worker/sql/050_backtesting_precompute.sql` | Analytics worker is the authoritative owner. The Node API may read these tables and may serve an in-memory seeded fallback for local development, but it must not mutate them. |
| `catalog.*`, `research.*`, `simulation.*` | NIFTY StratLab bounded research platform | `db/sql/014_nifty_stratlab_foundation.sql` through `db/sql/019_nifty_stratlab_runtime_hardening.sql` | Governed research metadata, immutable run state, simulations, discovery/calibration, option research, parity evidence, analyst packs, and V2 acceptance evidence. These do not replace the published `nse_app` dashboard marts. |
| `option_chain_*` in `public` | `services/option-chain-watcher` | `services/option-chain-watcher/src/migrate.ts` via explicit CLI/bootstrap | Transitional owner. Phase 2 should move these tables into a dedicated schema such as `nse_options` or `option_chain`. |
| `nse_ops.*` daily export/orchestration tables | `services/nse_orchestration_exports` | `services/nse_orchestration_exports/sql/*.sql` | Includes job definitions/runs, export manifests, daily dashboard/watchlist snapshot tables. |
| `nse_intraday.*` | `services/nse_intraday_intelligence` | `services/nse_intraday_intelligence/sql/*.sql` | Canonical intraday warehouse and feature tables. |
| `nse_ops.dashboard_snapshot_intraday`, `nse_ops.dashboard_section_intraday`, `nse_ops.watchlist_snapshot_intraday` | `services/nse_intraday_intelligence` | `services/nse_intraday_intelligence/sql/*.sql` | Shared `nse_ops` schema, but owned by the intraday package for these table families only. |
| `integration.*` compatibility views/templates | Transitional shared contract owned by the package that installs them | `services/nse_intraday_intelligence/sql/005_*`, `006_*` and `services/nse_reco_state_engine/sql/072_*`, `073_*` | Shared schema by design. Treat as compatibility-contract objects, not an application-owned warehouse. |
| `nse_reco.*`, `nse_reco_ops.*`, `nse_exports.*` | `services/nse_reco_state_engine` | `services/nse_reco_state_engine/sql/*.sql` via `scripts/install_sql.py` | Recommendation/state-aware overlay layer. |

## Runtime mutation policy

- Allowed at runtime:
  - inserts/updates/deletes against already-migrated tables
  - scheduled refreshes/materializations that assume the schema already exists
- Not allowed by default at runtime:
  - `CREATE SCHEMA`
  - `CREATE TABLE`
  - `ALTER TABLE`
  - index creation
  - compatibility-view installation
- Transitional exceptions:
  - Node API runtime DDL may be enabled only with `N50_API_ALLOW_RUNTIME_DDL=1` for dashboard snapshot infrastructure only
  - `N50_API_ALLOW_RUNTIME_PERF_DDL` remains a legacy compatibility flag, but performance indexes are now installed only by the explicit migration flow
  - option-chain watcher startup migrations may be enabled only with `NSE_OC_RUN_MIGRATIONS_ON_START=1`
  - intraday/orchestration startup SQL may be enabled only with `INSTALL_SQL_ON_START=1`

## Phase 2 target state

- Move Node API operational tables into explicit SQL or committed Prisma migrations.
- Move option-chain tables out of `public` into a dedicated schema.
- Replace shared-schema ambiguity in `nse_ops` with documented subdomains or dedicated schemas where practical.
- Add a migration ledger/registry for Python SQL packages so bootstrap status is queryable without reading logs.
