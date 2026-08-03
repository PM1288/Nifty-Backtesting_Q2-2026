## Title
Institutional Flow Ingestion Pipeline

## Objective
Integrate the new institutional-flow ingestion service with the current stack PostgreSQL instance, keep downloaded files local only as transient staging, write normalized/audit data into PostgreSQL, and remove successful downloads after load to save disk space.

## Repo facts verified
- The current stack PostgreSQL service is the canonical analytical database in `docker-compose.yml`.
- `services/institutional_flow_ingest` was initially scaffolded as a standalone DuckDB/parquet pipeline and was not wired into `docker-compose`.
- The user requirement for this service is PostgreSQL-backed logical ingestion with central logging and local-file cleanup after successful load.
- Existing stack services already rely on Postgres-backed registries and runtime volumes for logs and exports.

## Files inspected
- `docker-compose.yml`
- `services/institutional_flow_ingest/pyproject.toml`
- `services/institutional_flow_ingest/.env.example`
- `services/institutional_flow_ingest/README.md`
- `services/institutional_flow_ingest/configs/datasets.yaml`
- `services/institutional_flow_ingest/configs/runtime.yaml`
- `services/institutional_flow_ingest/configs/warehouse_schema.sql`
- `services/institutional_flow_ingest/src/market_ingest/config.py`
- `services/institutional_flow_ingest/src/market_ingest/registry.py`
- `services/institutional_flow_ingest/src/market_ingest/storage.py`
- `services/institutional_flow_ingest/src/market_ingest/cli.py`
- `services/institutional_flow_ingest/src/market_ingest/sources/nse/cash_api.py`
- `services/institutional_flow_ingest/src/market_ingest/sources/nse/fii_dii.py`
- `services/institutional_flow_ingest/tests/test_registry.py`
- `services/institutional_flow_ingest/tests/test_cli_idempotency.py`

## Plan
1. Replace DuckDB-only registry/warehouse storage with PostgreSQL-backed registry and normalized tables.
2. Keep local raw/staging/curated directories only for transient execution and make deletion after successful load the default.
3. Add a compose service that uses the current stack Postgres and persistent local log/report directories.
4. Update README, env example, and ADR/worklog so the current design is unambiguous.
5. Run tests and a containerized dry run against the existing stack PostgreSQL service.

## Changes made
- Replaced the service dependency on `duckdb` with PostgreSQL support via `psycopg[binary]` and `sqlalchemy`.
- Added explicit database configuration:
  - `MIF_DATABASE_URL`
  - `MIF_DATABASE_SCHEMA`
- Converted the registry layer to SQLAlchemy-backed SQL execution for:
  - `ingestion_registry`
  - `dataset_completeness`
  - `source_capabilities`
  - `raw_file_versions`
  - normalized analytical tables
  - analytical views
- Added PostgreSQL schema initialization to `configs/warehouse_schema.sql` using schema `institutional_flow`.
- Kept SQLite compatibility in tests by skipping PostgreSQL-only `CREATE SCHEMA` and `SET search_path` statements.
- Updated the pipeline so successful runs:
  - load normalized data into PostgreSQL
  - retain audit metadata in PostgreSQL
  - delete local raw files by default
  - skip local curated parquet unless explicitly enabled
- Added `docker-compose` integration via `institutional-flow-ingest`:
  - uses existing stack Postgres
  - mounts local `raw`, `staging`, `curated`, `logs`, and `run_reports`
  - defaults to `python scripts/run_daily.py`
  - is profile-gated under `institutional-flow`
- Cleaned `.env.example` to remove duplicate entries introduced during the storage refactor.
- Updated the service README to describe:
  - PostgreSQL-backed operation
  - transient local staging
  - compose usage
  - auditability after local file cleanup
- Fixed the analytics view refresh to use `DROP VIEW ... CASCADE` for the service-owned analytical views so one-shot and daily runs do not fail on dependent-view refresh order inside PostgreSQL.
- Ported and wired the real cleaned NSE/NSDL connector set into the Python service:
  - NSE cash API for FII/DII
  - NSE participant-wise OI CSV
  - NSE Nifty 500 ISIN/sector map
  - NSDL monthly, yearly, fortnightly, and daily surfaces
- Added PostgreSQL normalized tables for the new NSE/NSDL datasets and attached them to the registry-backed warehouse flow.
- Fixed idempotent normalization for periodic datasets so a discovered raw file can still be normalized on rerun if the partition is not yet loaded.
- Updated the HTTP session bootstrap for NSE with a browser-like user agent plus explicit FII/DII referer handling so the official API succeeds from inside the runtime container.
- Fixed numeric coercion for the participant OI normalizer so PostgreSQL inserts use numeric values instead of text strings.
- Cleaned stale transient files from `services/institutional_flow_ingest/raw`, leaving only `.gitkeep` after successful normalized rows were already persisted to PostgreSQL.

## Validation run
- `python -m pytest` in `services/institutional_flow_ingest`: passed (`9 passed`)
- `docker compose config -q`: passed
- Host-run Postgres-backed dry run:
  - `python services/institutional_flow_ingest/scripts/run_daily.py --dry-run --datasets nse_cm_bhavcopy`
  - passed and discovered the official NSE candidate URLs while creating the `institutional_flow` schema in the live stack Postgres instance
- Postgres validation:
  - confirmed tables exist under schema `institutional_flow`
  - confirmed `ingestion_registry` rows are written during execution
- Host-run live execution:
  - `python services/institutional_flow_ingest/scripts/run_daily.py --datasets nse_cm_bhavcopy --late-arrival-window 1`
  - wrote `discovered` / `failed` audit rows into Postgres
  - created `run_reports/20260401T172741Z_daily_summary.json`
  - retained only `.gitkeep` under `services/institutional_flow_ingest/raw`, confirming successful raw-file cleanup after staging attempts
  - did not load normalized bhavcopy rows because the direct NSE file URL timed out and the archive fallback returned `404`
- Compose image validation:
  - `docker compose --profile institutional-flow build institutional-flow-ingest`: passed
  - produced image `trading-stack-institutional-flow-ingest:latest`
- Compose runtime validation:
  - `docker compose --profile institutional-flow run --rm institutional-flow-ingest python scripts/run_daily.py --dry-run --datasets nse_cm_bhavcopy`
  - passed and discovered the same official NSE bhavcopy candidates against the compose stack Postgres
- One-shot FII/DII execution:
  - `docker compose --profile institutional-flow run --rm institutional-flow-ingest python scripts/run_daily.py --datasets nse_fii_dii_nse_only nse_fii_dii_combined --late-arrival-window 1`
  - executed after rebuilding the image with the analytics-view fix
  - wrote a failed audit row for `nse_fii_dii_nse_only` on `2026-03-31`
  - `institutional_flow.normalized_nse_fii_dii` remained at `0` rows
  - stored failure reason: `ReadTimeout` / `The read operation timed out`
- Updated-source compose validation using a bind mount:
  - `docker compose --profile institutional-flow run --rm -v "${PWD}/services/institutional_flow_ingest:/app" institutional-flow-ingest python scripts/bootstrap_backfill.py --datasets nse_reference_isin_sector_map nsdl_monthly_history nsdl_yearly_history nsdl_fortnightly_sector_history --from-date 2025-01-01 --to-date 2026-04-02`
  - passed and wrote normalized PostgreSQL rows for:
    - `nse_reference_isin_sector_map`
    - `nsdl_monthly_history`
    - `nsdl_yearly_history`
    - `nsdl_fortnightly_sector_history`
  - official NSDL 400 responses were retained as auditable failures for unavailable dates
- Updated-source compose daily validation using a bind mount:
  - `docker compose --profile institutional-flow run --rm -v "${PWD}/services/institutional_flow_ingest:/app" institutional-flow-ingest python scripts/run_daily.py --datasets nse_fii_dii_nse_only --late-arrival-window 1`
  - passed and normalized `2` rows for `2026-04-01`
- Updated-source compose daily validation using a bind mount:
  - `docker compose --profile institutional-flow run --rm -v "${PWD}/services/institutional_flow_ingest:/app" institutional-flow-ingest python scripts/run_daily.py --datasets nse_fo_participant_open_interest --late-arrival-window 1`
  - passed after falling back from `_b.csv` to the plain `.csv` file and normalized `6` rows for `2026-04-01`
- Live PostgreSQL row counts after the successful NSE/NSDL runs:
  - `normalized_nse_fii_dii = 2`
  - `normalized_nse_derivatives_participants = 6`
  - `normalized_nsdl_fortnightly_sector = 624`
  - `normalized_nsdl_monthly_history = 1`
  - `normalized_nsdl_yearly_history = 2`
  - `normalized_reference_isin_sector_map = 500`
  - `normalized_nsdl_daily_trends = 0`
- Transient filesystem cleanup validation:
  - before manual cleanup: `raw/` held `9` files totaling `147455231` bytes
  - after cleanup: `raw/` returned to `.gitkeep` only
  - `staging/` and `curated/` also remain at placeholder-only state

## Screens reviewed
- Not applicable for backend pipeline work

## Decisions made
- Use the stack PostgreSQL instance as the source of truth for registry, completeness, capability, and normalized analytical storage.
- Keep local filesystem usage transient by default to save disk space while preserving audit metadata in PostgreSQL.
- Integrate into `docker-compose` as a profile-gated operational service instead of an always-on scheduler daemon inside the container.
- Preserve operator artifacts locally in `logs/` and `run_reports/`.

## Risks / follow-ups
- Full historical ingestion still depends on official source availability and may classify some datasets or dates as unavailable.
- Browser-assisted fallback is still architecturally isolated but not yet fully implemented as a live fallback runner.
- The current NSE bhavcopy direct file URL timed out during live execution and the historical archive fallback returned `404`, so the service currently records auditable failures for that dataset/date instead of silently loading zero rows.
- The `nse_fii_dii_nse_only` dataset is now loading through the official NSE cash API, but `nse_fii_dii_combined` is still wired to the older brittle HTML-discovery path and remains failed/unloaded until a stable official combined download target is verified.
- `nsdl_daily_trends` still has `0` normalized rows and currently records only discovery/failure audit events; its latest-page extraction needs another pass against the official NSDL page shape.
- `nsdl_tradewise_monthly` still records discovery/failure audit events only and has not yet landed normalized PostgreSQL rows.
- If operators want long-term raw-file retention for forensic reasons, they must explicitly set `MIF_RETAIN_RAW_FILES=true`.

## Resume here next time
1. Replace or explicitly classify the `nse_fii_dii_combined` source once a stable official combined download target is verified.
2. Finish the NSDL daily and tradewise loaders so they move from audit-only failures to normalized PostgreSQL rows.
3. Add the browser/session fallback only where the official public endpoint is genuinely JS/cookie gated rather than silently retrying direct HTTP forever.
4. Wire the service into cron/systemd or a compose scheduler path after the remaining Tier 1 datasets are landing reliably.
