# Nifty100 Disclosures Integration

Last reviewed: 2026-04-04

## Architecture

The focused Nifty100 disclosures pipeline is integrated as an internal Python service at [`services/nifty100_disclosures_pipeline`](../services/nifty100_disclosures_pipeline).

Why this path:

- the extractor logic already exists as a Python package and CLI
- the main repo already runs multiple internal Python services in Docker
- keeping the original package avoids rewriting NSE and Yahoo fetchers
- the main platform is still the control plane because the Node API exposes `/v1/disclosures/*`

Control flow:

1. `nifty100-disclosures-api` runs FastAPI and keeps the original endpoints:
   - `GET /health`
   - `GET /latest-run`
   - `POST /run`
   - `POST /load`
2. The Node API proxies operator-safe access through:
   - `GET /v1/disclosures/health`
   - `GET /v1/disclosures/latest-run`
   - `POST /v1/disclosures/run`
   - `POST /v1/disclosures/load`
3. PostgreSQL schema is created only by the repo migration:
   - [`db/sql/011_nifty100_disclosures.sql`](../db/sql/011_nifty100_disclosures.sql)

## Scope

Only these tables are part of this integration:

- `market_data.nse_corporate_actions`
- `market_data.nse_event_calendar`
- `market_data.nse_financial_results`
- `market_data.yf_financial_statements`
- `audit.load_manifest`

No other stock-data tables were added by this integration.

## Docker wiring

The standard stack now includes `nifty100-disclosures-api` in:

- [`compose/compose.base.yml`](../compose/compose.base.yml)
- [`compose/compose.dev.yml`](../compose/compose.dev.yml)
- [`docker-compose.yml`](../docker-compose.yml)

Storage:

- the service mounts a persistent named volume to `/app/data`
- `OUTPUT_DIR` remains `data` inside the container so the original run layout is preserved exactly
- direct host access in dev is on `http://localhost:8000`

## Environment

Root `.env` uses repo-safe prefixed variables and compose maps them into the service’s original env contract.

Root variables:

- `NIFTY100_DISCLOSURES_OUTPUT_DIR`
- `NIFTY100_DISCLOSURES_SYMBOLS`
- `NIFTY100_DISCLOSURES_NSE_FIN_START_DATE`
- `NIFTY100_DISCLOSURES_NSE_FIN_END_DATE`
- `NIFTY100_DISCLOSURES_CORP_ACTIONS_START_DATE`
- `NIFTY100_DISCLOSURES_CORP_ACTIONS_END_DATE`
- `NIFTY100_DISCLOSURES_EVENT_START_DATE`
- `NIFTY100_DISCLOSURES_EVENT_END_DATE`
- `NIFTY100_DISCLOSURES_REQUEST_RETRIES`
- `NIFTY100_DISCLOSURES_REQUEST_SLEEP_SECONDS`
- `NIFTY100_DISCLOSURES_POSTGRES_SCHEMA`
- `NIFTY100_DISCLOSURES_POSTGRES_AUDIT_SCHEMA`
- `NIFTY100_DISCLOSURES_TRUNCATE_TABLES_ON_LOAD`
- `NIFTY100_DISCLOSURES_TIMEOUT_MS`

Shared Postgres credentials come from the existing root values:

- `POSTGRES_DB`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`

Inside the disclosures service these are wired back into the original names:

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

## Database and migrations

The central migration runner now installs the disclosures schema explicitly:

```bash
./scripts/db_migrate_all.sh
```

The disclosures step applies:

```bash
psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f db/sql/011_nifty100_disclosures.sql
```

Tables created:

- `market_data.nse_corporate_actions`
- `market_data.nse_event_calendar`
- `market_data.nse_financial_results`
- `market_data.yf_financial_statements`
- `audit.load_manifest`

Indexes created:

- `idx_nse_financial_results_symbol_period`
- `idx_yf_financial_statements_symbol_period`
- `idx_nse_corporate_actions_symbol_exdate`
- `idx_nse_event_calendar_symbol_eventdate`

## Run commands

Bring up the standard local dev stack:

```bash
docker compose --env-file .env -f compose/compose.base.yml -f compose/compose.dev.yml up --build
```

Run the full migration flow:

```bash
./scripts/db_migrate_all.sh
```

Full extract only:

```bash
curl -X POST http://localhost:19090/v1/disclosures/run \
  -H "Content-Type: application/json" \
  -d '{"load_postgres":false}'
```

Full extract and load:

```bash
curl -X POST http://localhost:19090/v1/disclosures/run \
  -H "Content-Type: application/json" \
  -d '{"load_postgres":true}'
```

Subset test:

```bash
curl -X POST http://localhost:19090/v1/disclosures/run \
  -H "Content-Type: application/json" \
  -d '{"symbols":["RELIANCE","INFY"],"load_postgres":false}'
```

Load the latest completed run:

```bash
curl -X POST http://localhost:19090/v1/disclosures/load \
  -H "Content-Type: application/json" \
  -d '{}'
```

Load a specific run:

```bash
curl -X POST http://localhost:19090/v1/disclosures/load \
  -H "Content-Type: application/json" \
  -d '{"run_id":"<run_id>"}'
```

Inspect latest-run metadata:

```bash
curl http://localhost:19090/v1/disclosures/latest-run
```

Direct service CLI from compose:

```bash
docker compose --env-file .env -f compose/compose.base.yml -f compose/compose.dev.yml run --rm --entrypoint python nifty100-disclosures-api -m nifty100_pipeline.cli extract --symbols RELIANCE,INFY
docker compose --env-file .env -f compose/compose.base.yml -f compose/compose.dev.yml run --rm --entrypoint python nifty100-disclosures-api -m nifty100_pipeline.cli run-all
docker compose --env-file .env -f compose/compose.base.yml -f compose/compose.dev.yml run --rm --entrypoint python nifty100-disclosures-api -m nifty100_pipeline.cli load-postgres --run-id <run_id>
```

## Storage layout

The service preserves the original layout under `/app/data` inside the container volume:

```text
data/
  latest_run.json
  _service_logs/
    api.log
    cli.log
  runs/
    <run_id>/
      raw/
        nse_corporate_actions/<symbol>.csv
        nse_event_calendar/<symbol>.csv
        nse_financial_results/<symbol>.csv
        yf_financial_statements/<symbol>.csv
      combined/
        nse_corporate_actions.csv
        nse_event_calendar.csv
        nse_financial_results.csv
        yf_financial_statements.csv
      audit/
        manifest.csv
        error_log.csv
      logs/
        pipeline.log
```

The main platform can always discover:

- `data/latest_run.json`
- run-specific combined CSVs
- run-specific `manifest.csv`
- run-specific `error_log.csv`

## Reliability caveats

- NSE responses can throttle, change payload shape, or intermittently omit fields.
- Yahoo Finance responses can be incomplete or delayed for some symbols and statement periods.
- The pipeline keeps retries, per-symbol raw CSVs, `manifest.csv`, and `error_log.csv` so operators can diagnose partial failures without rerunning blind.
- Loading assumes the SQL migration has already been applied. The runtime loader will fail closed if the tables are missing.
