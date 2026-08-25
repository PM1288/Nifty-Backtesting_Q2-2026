# NSE EOD Ingestor (Dockerized, PostgreSQL-first)

A Dockerized end-of-day ingestion stack for NSE India daily cash-market files.

This package is designed for a compose stack where PostgreSQL already exists and the ingestor container can reach it over the compose network.

## What it does

- Runs the canonical daily job at **07:55 Asia/Kolkata** on exchange trading days.
- Resolves the previous official trading session from the exchange calendar rather than weekdays.
- Retains the existing manual seven-day backfill command and skips files already loaded.
- Supports **idempotent re-runs** using `ON CONFLICT` upserts and file registry checks.
- Loads core daily reports into normalized PostgreSQL tables under schema `nse`.
- Keeps **run logs**, file logs, row counts, and file checksums.
- Cleans up staged downloads after successful load.
- Enforces rolling retention so only about **6 months** of time-series data is kept.
- Can ingest either:
  - directly from date-based NSE URLs, or
  - from a mounted **Reports-Daily-Multiple.zip** bundle.

## Included report loaders

Implemented in this package:

- `sec_bhavdata_full_DDMMYYYY.csv`
- `BhavCopy_NSE_CM_0_0_0_YYYYMMDD_F_0000.csv.zip`
- `NSE_CM_security_DDMMYYYY.csv.gz`
- `CMVOLT_DDMMYYYY.CSV`
- `MADDMMYY.csv`
- `shortselling_DDMMYYYY.csv`
- `REG_INDDDMMYY.csv`
- `REG1_INDDDMMYY.csv`
- `CM_52_wk_High_low_DDMMYYYY.csv`
- `PRDDMMYY.zip` (corporate actions + raw announcement / board meeting text)
- `mrg_trading_DDMMYY.zip`
- `C_VAR1_DDMMYYYY_<seq>.DAT`
- `bulk.csv` / `block.csv` when present inside a daily bundle zip

## Recommended operating model

Use **both** modes:

1. **Primary**: run `sync` daily to fetch date-addressable files.
2. **Fallback / richer event mode**: drop any downloaded `Reports-Daily-Multiple.zip` into `/input` and run `load-bundle`.

That pattern is robust because some NSE reports are clean date-addressable files while some deal/event files are easier to process from the daily multi-file bundle.

## Quick start

1. Copy `.env.example` to `.env`.
2. Set `DATABASE_URL` to your PostgreSQL service in compose, for example:
   `postgresql://postgres:postgres@postgres:5432/nse`
3. Adjust `config/report_catalog.yml` if you want to change URL templates.
4. Run migrations:
   ```bash
   docker compose run --rm nse_ingestor migrate
   ```
5. Backfill the last 7 days:
   ```bash
   docker compose run --rm nse_ingestor sync --backfill-days 7
   ```
6. To load a previously downloaded daily bundle:
   ```bash
   docker compose run --rm -v ./input:/input nse_ingestor load-bundle --bundle /input/Reports-Daily-Multiple.zip
   ```
   If the bundle filename itself does not carry the date and the zip mixes generic names like `bulk.csv` or `block.csv`, pass:
   ```bash
   docker compose run --rm -v ./input:/input nse_ingestor load-bundle --bundle /input/Reports-Daily-Multiple.zip --source-date 2026-03-06
   ```

## Compose usage

This compose file assumes PostgreSQL already exists on the same compose network with hostname `postgres`.

```bash
docker compose up --build nse_ingestor
```

The deployed scheduler runs at 07:55 IST. It creates one idempotent job row for the day, attempts
every enabled manifest report for the previous official NSE session, records unavailable reports,
and enqueues one consolidated `nse.daily.files.missing.v1` event when any expected file is absent.
The delivery worker retries n8n independently; ingestion never waits on WhatsApp delivery.

## This stack integration

In this repository the ingestor is wired into the root [`docker-compose.yml`](../../docker-compose.yml) and uses:

- `/data/inbound` mapped to `services/nse_ingestor/runtime/inbound`
- `/data/staging` mapped to `services/nse_ingestor/runtime/staging`
- `/data/logs` mapped to `services/nse_ingestor/runtime/logs`
- `/app/ops/entrypoint.sh` as a startup wrapper

The wrapper behavior is:

- runs migrations on startup
- if the container starts on a weekday at or after `STARTUP_CATCHUP_AFTER` and no successful `sync` or `load-bundle` run exists yet for today in `Asia/Kolkata`, it runs `sync`
- uses `market_status.exchange_session_calendar`, including holidays and special sessions
- runs at `SCHEDULE_TIME=07:55`
- prevents duplicate same-day jobs with `nse.daily_job_run(job_date)` and a PostgreSQL advisory lock
- uses `nse.notification_outbox` for bounded, retryable n8n delivery

Useful commands in this stack:

```bash
docker compose up -d postgres
docker compose up -d --build nse_ingestor
docker compose logs -f nse_ingestor
docker compose exec nse_ingestor python -m app.cli sync --backfill-days 7
docker compose exec nse_ingestor python -m app.cli load-bundle --bundle /data/inbound/Reports-Daily-Multiple.zip --source-date 2026-03-06
```

## Data model

### Control tables
- `nse.ingest_runs`
- `nse.ingest_run_reports`
- `nse.file_registry`

### Security dimension
- `nse.dim_security_master_snapshot`
- `nse.vw_security_current`

### Market / price facts
- `nse.fact_eod_prices`
- `nse.fact_bhavcopy_udiff`
- `nse.fact_daily_volatility`
- `nse.fact_market_activity_kv`
- `nse.fact_market_activity_index`
- `nse.fact_52_week_high_low`

### Flow / event facts
- `nse.fact_bulk_deals`
- `nse.fact_block_deals`
- `nse.fact_short_selling`
- `nse.fact_corporate_actions`
- `nse.fact_text_events`
- `nse.fact_margin_trading_summary`
- `nse.fact_margin_trading_scrip`
- `nse.fact_var_margin`

### Surveillance / regime facts
- `nse.fact_surveillance_indicators`

### Enriched views
- `nse.vw_eod_enriched`
- `nse.vw_stock_features_daily`

## Canonical join keys

Use these join keys in this order:

1. **Preferred institutional key**: `trade_date + fininstrm_id`
   - Best when joining `fact_bhavcopy_udiff` with `dim_security_master_snapshot`.

2. **Operational cash-market key**: `trade_date + symbol + series`
   - Best when joining `fact_eod_prices`, `fact_daily_volatility`, `fact_52_week_high_low`, surveillance, and most PR-derived event files.

3. **Event key**: `trade_date/report_date + symbol`
   - Best for `bulk`, `block`, `shortselling`, announcements, board meetings.

4. **Corporate action key**: `symbol + series + ex_date`
   - Best for ex-date / record-date studies.

## Why both `fact_eod_prices` and `fact_bhavcopy_udiff` exist

They solve different problems:

- `fact_eod_prices` from `sec_bhavdata_full` carries **delivery quantity** and **delivery %**.
- `fact_bhavcopy_udiff` carries **fininstrm_id** and **ISIN**, which are better for stable joins.

The included view `vw_eod_enriched` joins the two so downstream analysis gets both delivery and stable identifiers.

## Retention policy

Default retention:
- Time-series fact data: **190 days**
- Run logs / file logs: **365 days**
- Staged downloads: **3 days**, and successful staged files are deleted immediately when `KEEP_DOWNLOADS=false`

Change in `.env`:
- `RETENTION_DAYS`
- `LOG_RETENTION_DAYS`
- `STAGING_RETENTION_DAYS`

## Important caveats

- NSE changes file paths and naming conventions occasionally. The included `report_catalog.yml` has sensible defaults and is intended to be editable.
- `REG_IND` / `REG1_IND` are loaded as raw JSON flags plus a non-default flag count. The ingestor does **not** over-interpret surveillance semantics.
- `shortselling_DDMMYYYY.csv` can contain a trade date different from the filename date. This loader stores both `trade_date` and `report_date`.
- Some event-rich files are easier to acquire through the daily bundle than through direct URL templates.

## Analysis playbook

See:
- `ANALYSIS_PLAYBOOK.md`
- `sql/003_analysis_queries.sql`
