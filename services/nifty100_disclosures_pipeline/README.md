# Nifty100 Disclosures Pipeline Service

Internal Python service for the trading-stack Nifty100 disclosures integration.

This service owns the extraction and load flow for exactly these datasets:

- `market_data.nse_corporate_actions`
- `market_data.nse_event_calendar`
- `market_data.nse_financial_results`
- `market_data.yf_financial_statements`

It preserves the original pipeline behavior:

- package: `nifty100_pipeline`
- CLI: `python -m nifty100_pipeline.cli`
- FastAPI: `/health`, `/latest-run`, `/run`, `/load`
- run output layout:
  - `data/runs/<run_id>/raw/<dataset>/<symbol>.csv`
  - `data/runs/<run_id>/combined/*.csv`
  - `data/runs/<run_id>/audit/manifest.csv`
  - `data/runs/<run_id>/audit/error_log.csv`
  - `data/latest_run.json`

## Repo integration rules

- Schema ownership is explicit and lives in [`db/sql/011_nifty100_disclosures.sql`](../../db/sql/011_nifty100_disclosures.sql).
- Runtime loading does not create or alter schema.
- The main platform trigger surface is the Node API under `/v1/disclosures/*`.
- The service still supports direct CLI and direct FastAPI use for local operator workflows.

## Service env contract

The service still consumes the original variable names:

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

In the shared repo compose files, these are mapped from root-level `NIFTY100_DISCLOSURES_*` settings where that avoids collisions with existing stack configuration.

## Direct local usage

From this service directory:

```bash
python -m venv .venv
. .venv/bin/activate
pip install -U pip
pip install -r requirements.txt
pip install -e .
pytest -q
python -m nifty100_pipeline.cli extract --symbols RELIANCE,INFY
python -m nifty100_pipeline.cli run-all
python -m nifty100_pipeline.cli load-postgres --run-id <run_id>
```

## Main stack usage

Use the repo-root compose and API wiring documented in:

- [`docs/nifty100-disclosures-integration.md`](../../docs/nifty100-disclosures-integration.md)
