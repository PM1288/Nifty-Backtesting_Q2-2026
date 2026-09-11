# NSE FII Reports Service

Single-service wrapper for NSE daily F&O participant, FII derivatives and the
independently published F&O Daily Volatility (FOVOLT) report.

The production container runs an idempotent morning publish at `06:00
Asia/Kolkata` by default. It downloads the latest complete official report set,
checks that its report date matches the latest completed exchange session,
and loads that immutable daily revision into PostgreSQL. A PostgreSQL advisory
lock prevents duplicate concurrent publishers. Missing/late official reports
are retried at `AUTO_PULL_INTERVAL_MINUTES` rather than being labelled current.

Runtime controls:

- `AUTO_PULL_ENABLED=true`
- `AUTO_PULL_TIME=06:00`
- `AUTO_PULL_RUN_ON_START=true` (catch up after a restart later than 06:00)
- `AUTO_LOAD_ENABLED=true`
- `AUTO_PULL_INTERVAL_MINUTES=60` (retry interval after a failed/stale pull)

This service integrates the upstream `nse_fii_services` pack into the main trading stack as one deployable FastAPI container with:

- latest daily pull
- historical backfill
- latest metadata inspection
- Postgres load for parsed runs
- optional in-process periodic updater

## Reports covered

- `F&O - Participant wise Open Interest(csv)`
- `F&O - Participant wise Trading Volumes(csv)`
- `F&O - FII Derivatives Statistics`
- `F&O - Daily Volatility` (independent family; its absence cannot roll back the original bundle)

## API

- `GET /health`
- `GET /latest-run`
- `GET /runs`
- `GET /runs/{kind}/{run_id}`
- `POST /pull-latest`
- `POST /backfill`
- `POST /load`
- `POST /fovolt/pull-latest`

## CLI

```bash
python -m nse_fii_services.cli pull-latest --max-lookback-days 10
python -m nse_fii_services.cli backfill --start-date 02-10-2023 --end-date 06-10-2023
python -m nse_fii_services.cli load --kind backfill --run-id 2026-03-01__2026-03-31
python -m nse_fii_services.cli latest-run
```

## Output layout

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
- `FOVOLT_PULL_ENABLED` (defaults to `true` for environment-configured service runs)

## Notes

- These are daily post-close NSE reports, not streaming intraday data.
- The `.xls` FII statistics report needs `xlrd`.
- Raw files are retained even when parsing fails.
- FOVOLT keeps immutable content revisions and uses the exact rule
  `FOVOLT_FUT_DAILY_DELTA_GT_0001_V1`: reported current futures daily
  volatility minus reported previous futures daily volatility is strictly
  greater than `0.0001`.
