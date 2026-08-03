You are integrating a focused Nifty 100 disclosures pipeline into the main stock platform.

You have access to:
1. MAIN REPO: <PATH_TO_MAIN_STOCK_REPO>
2. PIPELINE REPO: <PATH_TO_NIFTY100_DISCLOSURES_PIPELINE>

Your job is to fully integrate only these four datasets into the main stock system:
- market_data.nse_corporate_actions
- market_data.nse_event_calendar
- market_data.nse_financial_results
- market_data.yf_financial_statements

Do not expand scope beyond these four market_data tables unless a small audit table is needed for load tracking.
The pipeline repo already includes an audit manifest model and latest-run metadata. Reuse that.

Primary goal
- The main stock platform must be able to:
  - pull these four Nifty 100 datasets
  - store segregated raw CSVs by symbol
  - store combined CSVs in one common location
  - load the combined CSVs into Postgres
  - run inside the existing Dockerized setup
  - expose a clean trigger from the main platform
  - preserve auditability with run_id, manifest.csv, error_log.csv, and latest_run.json

Source-of-truth behavior from the pipeline repo
- Python package: `nifty100_pipeline`
- CLI entrypoint: `python -m nifty100_pipeline.cli`
- Commands:
  - `extract`
  - `run-all`
  - `load-postgres`
- FastAPI endpoints:
  - `GET /health`
  - `GET /latest-run`
  - `POST /run`
  - `POST /load`
- Combined CSV datasets:
  - `nse_corporate_actions.csv`
  - `nse_event_calendar.csv`
  - `nse_financial_results.csv`
  - `yf_financial_statements.csv`
- Output structure:
  - `data/runs/<run_id>/raw/nse_corporate_actions/<symbol>.csv`
  - `data/runs/<run_id>/raw/nse_event_calendar/<symbol>.csv`
  - `data/runs/<run_id>/raw/nse_financial_results/<symbol>.csv`
  - `data/runs/<run_id>/raw/yf_financial_statements/<symbol>.csv`
  - `data/runs/<run_id>/combined/*.csv`
  - `data/runs/<run_id>/audit/manifest.csv`
  - `data/runs/<run_id>/audit/error_log.csv`
  - `data/latest_run.json`
- Postgres tables:
  - `market_data.nse_corporate_actions`
  - `market_data.nse_event_calendar`
  - `market_data.nse_financial_results`
  - `market_data.yf_financial_statements`
- Audit table:
  - `audit.load_manifest`

Config/env vars you must wire into the main platform
- `OUTPUT_DIR`
- `SYMBOLS`
- `NSE_FIN_START_DATE`
- `NSE_FIN_END_DATE`
- `CORP_ACTIONS_START_DATE`
- `CORP_ACTIONS_END_DATE`
- `EVENT_START_DATE`
- `EVENT_END_DATE`
- `REQUEST_RETRIES`
- `REQUEST_SLEEP_SECONDS`
- `POSTGRES_HOST`
- `POSTGRES_PORT`
- `POSTGRES_DB`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `POSTGRES_SCHEMA`
- `POSTGRES_AUDIT_SCHEMA`
- `TRUNCATE_TABLES_ON_LOAD`

What you must do

1. Inspect the main stock repo first
- Determine backend stack, Postgres migration approach, Docker layout, env/config pattern, scheduler/job pattern, and any existing stock-data services.
- Choose the cleanest integration path based on the existing architecture.

2. Integrate the pipeline with minimal duplication
- If the main backend is Python, integrate `nifty100_pipeline` directly as an internal package or workspace package.
- If the main backend is not Python, keep the pipeline as an internal service/container and integrate via its CLI or FastAPI endpoints.
- Do not rewrite extractor logic unless needed for compatibility.

3. Integrate Docker
- Update the main repo’s Docker setup so these four dataset pulls are part of the standard local/dev stack.
- Reuse the main Postgres instance if one already exists.
- Mount a persistent data volume for the pipeline output directory.
- Ensure `docker compose up --build` can bring up the integrated setup.

4. Integrate Postgres
- Wire the pipeline to the main platform’s Postgres credentials and schema conventions.
- If the main repo already has migrations, add migrations for exactly these tables and relevant indexes:
  - `market_data.nse_corporate_actions`
  - `market_data.nse_event_calendar`
  - `market_data.nse_financial_results`
  - `market_data.yf_financial_statements`
  - `audit.load_manifest`
- Preserve run_id lineage and manifest tracking.
- Do not create unrelated stock tables.

5. Add orchestration in the main platform
Implement the cleanest control path used by the main repo:
- full extract only
- full extract + load
- subset by symbols
- load latest run
- load by run_id
- inspect latest run metadata
- inspect manifest and error log path

6. Preserve storage layout
Keep the pipeline’s raw/combined/audit layout unless the main repo has a very strong convention.
The main app must still be able to discover:
- `data/latest_run.json`
- run-specific combined CSVs
- run-specific manifest and error logs

7. Add docs
Document:
- architecture decision
- env vars
- Docker wiring
- how to run a full sync
- how to run a small subset test
- how to load latest run into Postgres
- where raw, combined, and audit files live
- NSE/Yahoo reliability caveats

8. Add tests
Add focused tests for:
- config wiring
- integration service/wrapper
- trigger path
- migration or schema mapping coverage
- any API/CLI wrapper logic added in the main repo
Mock network calls. Do not rely on live NSE/Yahoo calls in tests.

Files from the pipeline repo to read before coding
- `README.md`
- `pyproject.toml`
- `.env.example`
- `docker-compose.yml`
- `src/nifty100_pipeline/api.py`
- `src/nifty100_pipeline/cli.py`
- `src/nifty100_pipeline/db_schema.py`
- `src/nifty100_pipeline/pipeline.py`
- `src/nifty100_pipeline/postgres_loader.py`
- `src/nifty100_pipeline/nse_fetchers.py`
- `src/nifty100_pipeline/yf_fetchers.py`

Acceptance criteria
The task is complete only when:
1. The main stock repo contains actual integration code, not just notes.
2. Docker starts with the pipeline integrated.
3. The main stock platform can trigger the four-dataset Nifty 100 sync path.
4. Postgres loading is wired and documented.
5. Latest-run, manifest, and error-log inspection are available.
6. Tests for the integration layer are added.
7. Docs are updated.
8. Exact local run and verification commands are provided.

Expected output from you
Return:
1. A short architecture summary
2. All files changed/added
3. The actual code changes
4. Migration/schema changes
5. Docker changes
6. Env/config changes
7. Local run commands
8. Verification checklist
9. Known limitations

Execution style
- Act directly.
- Do not stop at a proposal.
- Choose the least invasive robust approach.
- Keep scope limited to the four requested tables.
