# Title
Integrate Real NSE and NSDL Institutional-Flow Connectors into the Postgres-backed Service

# Objective
Unzip the cleaned NSE/NSDL institutional-flow repo, port its real source logic into the existing `services/institutional_flow_ingest` service, keep Postgres as the system of record, and keep local raw/curated files transient after successful loads.

# Repo facts verified
- The extracted archive at `tmp/actual-fii-dii-real-repo/actual-fii-dii-real-repo` is a Node repo with real NSE/NSDL source logic, not a Python service.
- The existing `services/institutional_flow_ingest` service is already integrated into `docker-compose.yml` and uses the stack Postgres via `MIF_DATABASE_URL`.
- The current Python service has registry/completeness/storage/logging abstractions and a generic adapter/normalizer pipeline.
- The current Python service only has a weak NSE FII/DII HTML link discovery stub and no NSDL connectors from the cleaned repo.
- The stack Postgres credentials are already provided by the root `.env` and compose service wiring.

# Files inspected
- `docker-compose.yml`
- `.env`
- `services/institutional_flow_ingest/configs/datasets.yaml`
- `services/institutional_flow_ingest/configs/warehouse_schema.sql`
- `services/institutional_flow_ingest/src/market_ingest/cli.py`
- `services/institutional_flow_ingest/src/market_ingest/config.py`
- `services/institutional_flow_ingest/src/market_ingest/registry.py`
- `services/institutional_flow_ingest/src/market_ingest/utils/http.py`
- `tmp/actual-fii-dii-real-repo/actual-fii-dii-real-repo/README.md`
- `tmp/actual-fii-dii-real-repo/actual-fii-dii-real-repo/docs/SOURCE_AUDIT.md`
- `tmp/actual-fii-dii-real-repo/actual-fii-dii-real-repo/src/sources/*.js`
- `tmp/actual-fii-dii-real-repo/actual-fii-dii-real-repo/src/pipeline/*.js`

# Plan
- Add ADR documenting the decision to port the real source logic into the existing Python/Postgres service instead of introducing a second runtime.
- Extend the Python service dataset catalog and schema for the extracted NSE/NSDL datasets.
- Port the cleaned NSE cash API, NSE participant OI, NSDL daily, NSDL monthly/yearly, NSDL fortnightly, NSDL tradewise, and Nifty 500 ISIN map logic into Python source adapters/normalizers.
- Extend bootstrap scheduling so monthly and fortnightly backfill partitions are explicit where the source is partitioned.
- Keep raw/curated file retention disabled by default and preserve auditability in Postgres.
- Build and run the integrated service against the compose Postgres instance and record actual loaded row counts and source limitations.

# Changes made
- In progress.

# Validation run
- Pending.

# Screens reviewed
- Not applicable. Backend/data task.

# Decisions made
- Reuse the existing Postgres-backed `institutional_flow_ingest` service.
- Do not add the unzipped Node repo as a second service.
- Keep local files transient after successful processing to save space.

# Risks / follow-ups
- The extracted repo does not contain a real direct “combined NSE+BSE+MSEI” connector; that path may need to stay discovery-based or explicitly marked as a separate limitation.
- Official NSE endpoints may still require session bootstrapping or browser fallback.

# Resume here next time
- Finish porting the real NSE/NSDL connectors into `services/institutional_flow_ingest`, then run the service once against compose Postgres and verify loaded rows.
