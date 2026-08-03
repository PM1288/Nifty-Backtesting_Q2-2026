# NSE FII Reports Integration

Last reviewed: 2026-04-04

## Summary

The repo now includes a single internal service for NSE daily F&O participant and FII derivatives reports:

- latest daily pull for operational updates
- date-range backfill for historical recovery
- latest metadata inspection
- optional in-process periodic updater

The service is packaged at:

- `services/nse_fii_reports_service`

The main platform proxies it through:

- `GET /v1/fii-reports/health`
- `GET /v1/fii-reports/latest-run`
- `GET /v1/fii-reports/runs`
- `GET /v1/fii-reports/runs/:kind/:runId`
- `POST /v1/fii-reports/latest`
- `POST /v1/fii-reports/backfill`
- `POST /v1/fii-reports/load`

## Architecture

- Python package: `nse_fii_services`
- FastAPI app: `nse_fii_services.api:app`
- CLI entrypoint: `python -m nse_fii_services.cli`
- Internal container name: `nse-fii-reports-api`
- Main platform proxy routes live in `neon-stock-terminal/apps/api/src/routes/fiiReports.ts`

This integration deliberately keeps the upstream puller/parser logic intact and wraps it with repo-standard API, metadata, Docker wiring, and an optional Postgres load step for downstream processing.

## Reports covered

- `F&O - Participant wise Open Interest(csv)`
- `F&O - Participant wise Trading Volumes(csv)`
- `F&O - FII Derivatives Statistics`

## Postgres tables

- `market_data.nse_fii_participant_open_interest`
- `market_data.nse_fii_participant_volume`
- `market_data.nse_fii_derivatives_stats`
- `audit.load_manifest`

## Output layout

Inside the container, the persistent data root is `/app/data`.

```text
data/
  latest_run.json
  latest_daily/
    latest_run.json
    YYYY-MM-DD/
      manifest.json
      raw/
      parsed/
  history_backfill/
    latest_backfill.json
    YYYY-MM-DD__YYYY-MM-DD/
      manifest.csv
      missing.csv
      summary.json
      YYYY-MM-DD/
        raw/
        parsed/
```

## Environment

Container env contract:

- `OUTPUT_DIR`
- `REQUEST_TIMEOUT_SECONDS`
- `ENABLE_REPORTS_API_FALLBACK`
- `AUTO_PULL_ENABLED`
- `AUTO_PULL_INTERVAL_MINUTES`
- `AUTO_PULL_MAX_LOOKBACK_DAYS`
- `AUTO_PULL_SAVE_PARSED`
- `LOG_LEVEL`
- `POSTGRES_HOST`
- `POSTGRES_PORT`
- `POSTGRES_DB`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `POSTGRES_SCHEMA`
- `POSTGRES_AUDIT_SCHEMA`
- `TRUNCATE_TABLES_ON_LOAD`

Compose-facing env overrides:

- `NSE_FII_REPORTS_OUTPUT_DIR`
- `NSE_FII_REPORTS_REQUEST_TIMEOUT_SECONDS`
- `NSE_FII_REPORTS_ENABLE_REPORTS_API_FALLBACK`
- `NSE_FII_REPORTS_AUTO_PULL_ENABLED`
- `NSE_FII_REPORTS_AUTO_PULL_INTERVAL_MINUTES`
- `NSE_FII_REPORTS_AUTO_PULL_MAX_LOOKBACK_DAYS`
- `NSE_FII_REPORTS_AUTO_PULL_SAVE_PARSED`
- `NSE_FII_REPORTS_LOG_LEVEL`
- `NSE_FII_REPORTS_TIMEOUT_MS`
- `NSE_FII_REPORTS_POSTGRES_SCHEMA`
- `NSE_FII_REPORTS_POSTGRES_AUDIT_SCHEMA`
- `NSE_FII_REPORTS_TRUNCATE_TABLES_ON_LOAD`

## Docker

Dev stack:

```bash
docker compose --env-file .env -f compose/compose.base.yml -f compose/compose.dev.yml up -d --build nse-fii-reports-api n50-dashboard nginx
```

Prod-like core stack:

```bash
docker compose --env-file .env -f compose/compose.base.yml -f compose/compose.core.yml up -d nse-fii-reports-api n50-dashboard
```

Local direct port:

- `http://localhost:8001`

Main app path:

- `http://localhost:19090/n50/`

## Direct service usage

Health:

```bash
curl http://localhost:8001/health
```

Latest metadata:

```bash
curl http://localhost:8001/latest-run
```

Latest daily pull:

```bash
curl -X POST http://localhost:8001/pull-latest \
  -H "Content-Type: application/json" \
  -d '{"max_lookback_days":10,"save_parsed":true}'
```

Historical backfill:

```bash
curl -X POST http://localhost:8001/backfill \
  -H "Content-Type: application/json" \
  -d '{"start_date":"02-10-2023","end_date":"06-10-2023","save_parsed":true,"continue_on_error":true}'
```

Load the latest available run into Postgres:

```bash
curl -X POST http://localhost:8001/load \
  -H "Content-Type: application/json" \
  -d '{}'
```

Load a specific backfill run into Postgres:

```bash
curl -X POST http://localhost:8001/load \
  -H "Content-Type: application/json" \
  -d '{"kind":"backfill","run_id":"2026-03-01__2026-03-31"}'
```

## Main platform usage

Health:

```bash
curl http://localhost:19090/n50/v1/fii-reports/health
```

Latest metadata:

```bash
curl http://localhost:19090/n50/v1/fii-reports/latest-run
```

Trigger latest daily pull:

```bash
curl -X POST http://localhost:19090/n50/v1/fii-reports/latest \
  -H "Content-Type: application/json" \
  -d '{"max_lookback_days":10,"save_parsed":true}'
```

Trigger backfill:

```bash
curl -X POST http://localhost:19090/n50/v1/fii-reports/backfill \
  -H "Content-Type: application/json" \
  -d '{"start_date":"02-10-2023","end_date":"06-10-2023","save_parsed":true,"continue_on_error":true}'
```

Load a run into Postgres:

```bash
curl -X POST http://localhost:19090/n50/v1/fii-reports/load \
  -H "Content-Type: application/json" \
  -d '{"kind":"backfill","run_id":"2026-03-01__2026-03-31"}'
```

## CLI usage

From the service directory:

```bash
python -m nse_fii_services.cli pull-latest --max-lookback-days 10
python -m nse_fii_services.cli backfill --start-date 02-10-2023 --end-date 06-10-2023
python -m nse_fii_services.cli load --kind backfill --run-id 2026-03-01__2026-03-31
python -m nse_fii_services.cli latest-run
```

From Docker:

```bash
docker compose --env-file .env -f compose/compose.base.yml -f compose/compose.dev.yml run --rm --entrypoint python nse-fii-reports-api -m nse_fii_services.cli pull-latest --max-lookback-days 10
docker compose --env-file .env -f compose/compose.base.yml -f compose/compose.dev.yml run --rm --entrypoint python nse-fii-reports-api -m nse_fii_services.cli backfill --start-date 02-10-2023 --end-date 06-10-2023
```

## Reliability notes

- These are daily post-close reports, not streaming intraday feeds.
- NSE archive availability can lag the trade date.
- `.xls` parsing depends on `xlrd`.
- Raw files are always retained, even when parsing fails.
- Backfill writes `missing.csv` so partial archive gaps remain auditable.
