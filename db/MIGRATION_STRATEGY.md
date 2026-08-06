# Migration Strategy

## Objective

Provide one explicit migration order for the stack and stop relying on silent startup-time DDL for user-facing services.

## Principles

- Deployment-time migrations are explicit.
- Production services start against an already-migrated database.
- Runtime DDL is transitional and disabled by default.
- Clean local bootstrap remains supported through a root runner and documented manual commands.

## Authoritative execution order

Run the migration/bootstrap layers in this order:

1. Go collector core schema
   - Command source: `collector --db-migrate-only`
   - Why first: downstream packages depend on core market-data tables and views.
2. NSE daily ingestor
   - Command source: `python -m app.cli migrate` in `services/nse_ingestor`
   - Why next: daily analytics depends on `nse.*`.
3. NSE analytics worker
   - Command source: `python -m app.cli migrate` in `services/nse_analytics_worker`
   - Why next: daily/orchestration layers depend on `nse_app.*`, including the authoritative backtesting schema.
4. API read-model performance indexes
   - Command source: `db/sql/010_api_read_model_indexes.sql` via `scripts/db_migrate_all.sh`
   - Why next: user-facing dashboard and export routes depend on these read-path indexes, but they should be installed explicitly instead of by runtime DDL.
5. Nifty100 disclosures schema
   - Command source: `db/sql/011_nifty100_disclosures.sql` via `scripts/db_migrate_all.sh`
   - Creates only `market_data.nse_corporate_actions`, `market_data.nse_event_calendar`, `market_data.nse_financial_results`, `market_data.yf_financial_statements`, and `audit.load_manifest`.
6. NSE FII reports schema
   - Command source: `db/sql/012_nse_fii_reports.sql` via `scripts/db_migrate_all.sh`
   - Creates only `market_data.nse_fii_participant_open_interest`, `market_data.nse_fii_participant_volume`, and `market_data.nse_fii_derivatives_stats`.
7. Discord market stream schema
   - Command source: `db/sql/013_discord_market_stream.sql`.
8. NIFTY StratLab data foundation
   - Command source: `db/sql/014_nifty_stratlab_foundation.sql`.
   - Creates additive `catalog`, `research`, and `simulation` schemas.
   - These schemas hold governed research contracts and results; `nse_app` remains the published dashboard read-model owner.
9. NIFTY StratLab economics and strategy contracts
   - Command source: `db/sql/015_nifty_stratlab_economics.sql`.
10. NIFTY StratLab resumable replay and results
   - Command source: `db/sql/016_nifty_stratlab_replay.sql`.
11. NIFTY StratLab discovery and calibration
   - Command source: `db/sql/017_nifty_stratlab_discovery.sql`.
12. NIFTY StratLab options, parity, and research packs
   - Command source: `db/sql/018_nifty_stratlab_options.sql`.
13. NIFTY StratLab runtime hardening
   - Command source: `db/sql/019_nifty_stratlab_runtime_hardening.sql`.
   - Adds idempotent skipped-signal identity and the V2 acceptance-evidence register.
   - Validate all six files on first application and idempotent reapplication using `scripts/nifty_stratlab_migrate_test.sh`.
14. Strategy evaluation Rules of Engagement
   - Command source: `db/sql/020_strategy_evaluation_roe.sql`.
   - Creates the additive `strategy_eval` policy, event/regime, validation, path, scoring, suitability and artifact evidence schema.
   - Must run after the analytics worker because it references canonical `nse_app.backtest_run` and `nse_app.backtest_trade_log` facts.
15. OIIS research decision evidence
   - Source: `db/sql/021_oiis_research.sql`
   - Creates additive immutable formula, replay, decision, outcome, regime-performance and artifact tables in `oiis`.
   - Must run after Rules-of-Engagement because OIIS decisions consume its stock/index/VIX regime layer.
16. Node API operational bootstrap
   - Command source: `node apps/api/dist/scripts/bootstrapDatabase.js`
   - Creates/updates the transitional API-owned dashboard snapshot table only.
17. Option-chain watcher schema
   - Command source: `node dist/cli.js migrate`
   - Creates/updates option-chain capture tables.
18. Orchestration exports SQL
   - Command source: `python -m nse_orchestration_exports.manual_jobs install-sql`
   - Creates `nse_ops` daily/export structures.
19. Intraday intelligence SQL
   - Command source: `python -m nse_intraday_intelligence.manual_jobs install-sql`
   - Creates `nse_intraday.*` and intraday-owned `nse_ops.*` tables/views.
20. Recommendation overlay SQL
   - Command source: `python scripts/install_sql.py --database-url "$DATABASE_URL"`
   - Creates `nse_reco.*`, `nse_reco_ops.*`, and `nse_exports.*`.

## Root runner

Use:

- `scripts/db_migrate_all.sh`

This runner:

- starts `postgres`
- waits for readiness
- runs the migration/bootstrap layers in the order above
- leaves service startup DDL disabled by default

## Manual commands by owner

| Owner | Command |
| --- | --- |
| Go collector | `docker compose run --rm collector --config /app/config.yaml --db-migrate-only` |
| NSE ingestor | `docker compose run --rm --no-deps --entrypoint python nse_ingestor -m app.cli migrate` |
| NSE analytics worker | `docker compose run --rm --no-deps --entrypoint python nse-analytics-worker -m app.cli migrate` |
| API read-model performance indexes | `docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 < db/sql/010_api_read_model_indexes.sql` |
| Nifty100 disclosures schema | `docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 < db/sql/011_nifty100_disclosures.sql` |
| NSE FII reports schema | `docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 < db/sql/012_nse_fii_reports.sql` |
| NIFTY StratLab schemas | `./scripts/nifty_stratlab_migrate_test.sh` for disposable validation; production only through `scripts/db_migrate_all.sh` after approval |
| Node API operational bootstrap | `docker compose run --rm --entrypoint node n50-dashboard apps/api/dist/scripts/bootstrapDatabase.js` |
| Option-chain watcher | `docker compose run --rm --entrypoint node option-chain-watcher dist/cli.js migrate` |
| Orchestration exports | `docker compose run --rm nse-export-api python -m nse_orchestration_exports.manual_jobs install-sql` |
| Intraday intelligence | `docker compose run --rm nse-intraday-api python -m nse_intraday_intelligence.manual_jobs install-sql` |
| Recommendation overlay | `docker compose run --rm nse-reco-api python scripts/install_sql.py --database-url \"$$DATABASE_URL\"` |

## Production policy

- Production and stage should run the root migration flow during deployment, before user-facing services are restarted.
- The following startup-time DDL defaults are disabled and must stay off unless an operator is performing a controlled transitional bootstrap:
  - `N50_API_ALLOW_RUNTIME_DDL=0`
  - `NSE_OC_RUN_MIGRATIONS_ON_START=0`
  - `INSTALL_SQL_ON_START=0` for intraday and orchestration services
- `N50_API_ALLOW_RUNTIME_PERF_DDL` remains accepted only as a legacy compatibility flag and no longer installs indexes at runtime.

## Transitional legacy paths still present

- Go collector still embeds a monolithic migration set in Go code.
- NSE ingestor and analytics worker still run migrations from their entrypoints today.
- Node API still owns `nse_app.dashboard_snapshots` in application code rather than a dedicated migration package.
- Option-chain watcher still owns its schema in TypeScript rather than a dedicated SQL package.

These remain operational in Phase 1, but they are now centralized and explicitly ordered.

## Phase 1 consolidation plan

- Document schema owners and execution order.
- Add a root runner.
- Disable silent startup-time DDL by default for user-facing services.
- Keep legacy migration sources in place, but invoke them explicitly.

## Phase 2 consolidation plan

- Move Node API dashboard snapshot infrastructure out of application code and into committed migrations.
- Move option-chain watcher DDL into a dedicated SQL package and dedicated schema.
- Introduce a shared migration ledger for Python SQL packages.
- Reduce shared-schema ambiguity in `nse_ops` and `integration`.
- Decide whether Prisma becomes authoritative for API-owned tables or remains a client-only model.
