# Institutional Flow Ingest

Production-grade Python ingestion service for Indian market institutional-flow and positioning analysis using official public NSE/BSE sources where they are verifiable.

This service uses the stack PostgreSQL instance for registry and normalized analytical tables. Local files are treated as transient staging by default: downloads are checksummed, loaded, audited in PostgreSQL, and then cleaned up to save disk space unless retention is explicitly enabled.

## What this downloads
- NSE FII/DII daily reports
- NSE CM bhavcopy / cash-market price-volume archives
- NSE bulk deals, block deals, short-selling, security archives, derivatives participant datasets, and shareholding pattern where official public endpoints can be discovered and verified
- BSE discovery probes for bhavcopy, Sensex history, deals, and shareholding pattern

## What it does not guarantee
- Direct stock-level FII order flow truth. The analytical layer is a proxy assembled from aggregate flows, deals, holdings, derivatives positioning, and price-volume context.
- Complete historical availability for datasets that are not stably exposed via official public endpoints.
- BSE Tier 2 ingestion until official public endpoints are verified by discovery.

## Storage layout
```text
raw/<dataset>/year=YYYY/month=MM/date=YYYY-MM-DD/
staging/
curated/<dataset>/year=YYYY/month=MM/date=YYYY-MM-DD/  # optional, disabled by default
logs/app.log
logs/error.log
run_reports/<timestamp>_summary.json
```

## PostgreSQL registry tables
- schema: `institutional_flow`
- `ingestion_registry`
- `dataset_completeness`
- `source_capabilities`
- `raw_file_versions`

## PostgreSQL normalized tables
- `normalized_nse_fii_dii`
- `normalized_nse_cm_bhavcopy`
- `normalized_nse_bulk_block`
- `normalized_nse_derivatives_participants`
- `normalized_nse_shareholding`
- `normalized_bse_index_history`

## Setup
```bash
cd services/institutional_flow_ingest
python -m venv .venv
. .venv/bin/activate
pip install -e .[dev]
cp .env.example .env
```

Required environment override when using the stack Postgres:
```bash
export MIF_DATABASE_URL="postgresql+psycopg://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}"
export MIF_DATABASE_SCHEMA="institutional_flow"
```

By default, successful loads delete local raw files and skip local curated retention:
- `MIF_RETAIN_RAW_FILES=false`
- `MIF_RETAIN_CURATED_FILES=false`

Optional:
- `playwright install` if you later wire browser fallback support

## Run bootstrap backfill
```bash
python scripts/bootstrap_backfill.py --from-date 2021-04-01 --to-date 2026-04-01
```

Safe rerun:
- bootstrap checks for the completion marker plus completeness state
- if completeness still holds, it exits as a no-op
- otherwise it computes and fills only missing dates/partitions

## Run daily ingestion
```bash
python scripts/run_daily.py --late-arrival-window 3
```

Default intent:
- run around `08:10` Asia/Kolkata
- ingest the latest missing applicable trading day
- also repair late-published data over the prior configured trading-day window

## Run always-on scheduler
```bash
python scripts/scheduler.py
```

Scheduler environment:
- `MIF_SCHEDULER_ENABLED=1`
- `MIF_SCHEDULER_RUN_ON_START=1`
- `MIF_SCHEDULER_TIME=08:10`
- `MIF_SCHEDULER_LATE_ARRIVAL_WINDOW=5`
- `MIF_SCHEDULER_SLEEP_CAP_SECONDS=300`

Behavior:
- executes one repair/latest ingestion immediately on container start by default
- then waits until the next weekday `08:10` Asia/Kolkata run
- keeps the service alive as an always-on stack component instead of a one-shot job

## Run through docker compose
The stack includes a profile-gated service that uses the shared PostgreSQL instance and keeps only transient local staging files by default.

Daily dry run:
```bash
docker compose run --rm --profile institutional-flow institutional-flow-ingest python scripts/run_daily.py --dry-run
```

Bootstrap backfill:
```bash
docker compose run --rm --profile institutional-flow institutional-flow-ingest python scripts/bootstrap_backfill.py --from-date 2021-04-01 --to-date 2026-04-01
```

The service writes operator artifacts to:
- `services/institutional_flow_ingest/logs`
- `services/institutional_flow_ingest/run_reports`

Successful downloads are audited into PostgreSQL and then deleted locally unless retention is explicitly enabled.

## Verify completeness
```bash
python scripts/verify_completeness.py --from-date 2021-04-01 --to-date 2026-04-01
```

## Discover sources
```bash
python scripts/discover_sources.py --datasets nse_fii_dii_nse_only bse_index_history_sensex
```

## Tests
```bash
pytest
```

## Scheduler examples
Cron:
```cron
10 8 * * 1-5 /path/to/venv/bin/python /repo/services/institutional_flow_ingest/scripts/run_daily.py >> /repo/services/institutional_flow_ingest/logs/cron.log 2>&1
```

Systemd:
- `ops/institutional-flow.service`
- `ops/institutional-flow.timer`

Assumption:
- host timezone or explicit `TZ=Asia/Kolkata` environment is used so `08:10` aligns with exchange operations

## Known caveats
- NSE/BSE public pages can be JS-heavy and occasionally anti-bot protected. The code first tries direct downloads and simple HTTP discovery; browser-assisted fallback is intentionally isolated behind the HTTP/source adapter boundary.
- FII/DII historical depth depends on whether NSE still exposes dated public files or only current surfaces.
- NSE shareholding pattern can arrive as CSV, XML, or iXBRL-linked HTML and may need iterative parser hardening.
- BSE datasets are explicitly classified in `source_capabilities`; if a stable public endpoint is not verified, the dataset is recorded as unavailable instead of being silently ignored.
- Raw-file auditability is preserved in PostgreSQL even when the transient local file is deleted after load. The audit record retains source URL, checksum, byte length, and the transient file path that was used during ingestion.
