# Trendlyne Incremental Scraper — Implementation and Operations

Date: 2026-08-24
Production integration root: `/home/novius2/trading-stack`
Reviewed source archive: `/home/novius2/NIFTY50/trendline-scraper/trendlyne_scraper-main.zip`

## Outcome

The standalone public-listing scraper is integrated as a persistent Docker
service. It runs once at container startup and at 07:00 Asia/Kolkata every
Monday through Friday. PostgreSQL is authoritative for deduplication. Existing
report rows are never updated or deleted by the incremental runner.

## Source and deployment paths

- Reviewed/extracted implementation:
  `/home/novius2/NIFTY50/trendline-scraper/trendlyne_scraper-main`
- Delivery copy:
  `/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/services/trendlyne_scraper`
- Runtime copy:
  `/home/novius2/trading-stack/services/trendlyne_scraper`
- Compose overlay:
  `/home/novius2/trading-stack/compose/compose.trendlyne-scraper.yml`
- Runtime settings (secret, ignored):
  `/home/novius2/trading-stack/.env.trendlyne-scraper`
- Webhook token (secret, mode 0600):
  `/home/novius2/trading-stack/secrets/trendlyne_webhook_token`

## Baseline verified before deployment

`research.trendlyne_reports` existed before this change.

| Check | Result |
|---|---:|
| Rows | 19,251 |
| Distinct report IDs | 19,251 |
| Duplicate report IDs | 0 |
| Duplicate natural-key groups | 0 |
| Earliest report date | 2023-12-29 |
| Latest report date | 2026-08-12 |
| Distinct symbols | 1,117 |
| Conflict constraint | Primary key on `report_id` |

The existing `research.trendlyne_reports_cleaned` table was also observed and
was not modified by this integration.

## Defects found in the archive

1. The checkpoint persisted `reached_cutoff=true`; reusing it for a daily
   daemon could cause every later run to return without checking for new data.
2. The original PostgreSQL path used `ON CONFLICT DO UPDATE`, which did not
   meet the insert-new-only requirement.
3. The SQLite fallback used Python's process-randomised `hash()`, so an
   otherwise identical record without a source ID could receive a different ID
   after restart.
4. The original compose file was a one-shot runner and had no durable weekday
   schedule or liveness probe.
5. There was no database-wide execution lock, run ledger, or durable webhook
   outbox.
6. Source failures in the original top-level runner could be logged without a
   reliable failing process exit.

## Implemented data flow

```text
startup or weekday 07:00 IST
  -> acquire PostgreSQL advisory lock
  -> close any interrupted RUNNING ledger record as ABORTED
  -> read all existing report IDs and newest report date
  -> crawl the public listing from page 1 over a 14-day overlap
  -> parse and assign stable source/synthetic IDs
  -> suppress IDs already present in PostgreSQL
  -> insert candidates with ON CONFLICT(report_id) DO NOTHING RETURNING report_id
  -> enqueue only IDs actually returned by PostgreSQL
  -> send one bounded WhatsApp digest from the durable outbox
  -> mark delivered rows and retain failed rows for retry
  -> record run statistics and next scheduled time
```

The overlap window catches late-published or reordered listing records. The
database primary key—not a page checkpoint—is the final deduplication gate.

## Additive operational tables

- `research.trendlyne_scraper_run`: trigger, status, timestamps, counts,
  errors and detail JSON for every run.
- `research.trendlyne_new_report_outbox`: one row per newly inserted report,
  delivery state, attempts and last error.

No existing table was dropped, truncated or recreated.

In the current run-ledger schema, `reports_seen` records unseen candidate rows
after database-ID suppression; `known_reports_skipped` records already stored
IDs encountered in the same crawl.

## Schedule and restart behaviour

- Time zone: `Asia/Kolkata`
- Scheduled time: `07:00`
- Days: Monday-Friday
- Startup execution: enabled
- Docker restart policy: `unless-stopped`
- Container init: enabled
- Heartbeat health check: enabled
- Overlapping execution: rejected by PostgreSQL advisory lock

Docker therefore brings the service back after host or Docker-daemon restart;
the startup cycle checks for records missed while the host was offline.

## Webhook semantics

- The configured WhatsApp gateway receives a digest only for rows newly
  inserted by PostgreSQL.
- Existing records encountered during the overlap crawl do not enter the
  outbox.
- The payload carries an idempotency key derived from sorted report IDs.
- A failed HTTP delivery leaves rows `PENDING`; the next run retries them before
  crawling.
- Credentials are mounted as a Docker secret and are not present in source or
  this document.

## Operator commands

Run or recreate the service:

```bash
cd /home/novius2/trading-stack
docker compose --env-file .env -p trading-stack-novius2 \
  -f docker-compose.yml \
  -f compose/compose.trendlyne-scraper.yml \
  up -d --build --no-deps trendlyne-scraper
```

Inspect status and logs:

```bash
docker ps --filter name=trendlyne-scraper
docker logs --tail 200 trading-stack-novius2-trendlyne-scraper-1
docker exec trading-stack-novius2-trendlyne-scraper-1 \
  cat /app/state/scheduler.json
```

Run one manual incremental cycle without creating a second scheduler:

```bash
cd /home/novius2/trading-stack
docker compose --env-file .env -p trading-stack-novius2 \
  -f docker-compose.yml \
  -f compose/compose.trendlyne-scraper.yml \
  run --rm --no-deps --entrypoint python trendlyne-scraper \
  incremental.py --trigger manual
```

The database advisory lock makes the manual command safe if the scheduled
cycle is already running; it exits without a second write cycle.

Inspect the latest run and notification outbox:

```sql
SELECT run_id, trigger, status, started_at, completed_at,
       pages_scraped, reports_seen, reports_inserted,
       known_reports_skipped, errors
FROM research.trendlyne_scraper_run
ORDER BY started_at DESC
LIMIT 20;

SELECT status, count(*)
FROM research.trendlyne_new_report_outbox
GROUP BY status
ORDER BY status;
```

## Validation performed

- Archive integrity: `unzip -tq` passed (20 entries).
- Python compilation: passed.
- Unit tests: 3 passed (stable synthetic ID, weekday scheduling, webhook
  digest scope).
- Docker build: passed.
- Compose validation: passed.
- Live public listing parser: returned 20 records from page 1 with no errors.
- PostgreSQL schema/credentials: passed against the live `tradingdb` service.
- Operational-table migration: passed after correcting an escaped JSON literal
  found by the first smoke test.
- Production first-run reconciliation: see the final-run section below.

## Rollback

The original ZIP is retained unchanged. To stop and remove only this service:

```bash
cd /home/novius2/trading-stack
docker compose --env-file .env -p trading-stack-novius2 \
  -f docker-compose.yml \
  -f compose/compose.trendlyne-scraper.yml \
  stop trendlyne-scraper
docker compose --env-file .env -p trading-stack-novius2 \
  -f docker-compose.yml \
  -f compose/compose.trendlyne-scraper.yml \
  rm -f trendlyne-scraper
```

This does not delete `research.trendlyne_reports`. Named runtime volumes and
the two additive operational tables remain for audit/recovery. Their removal
requires a separate, explicit destructive operation.

## Final first-run evidence

| Check | Result |
|---|---:|
| Startup run ID | `5d2436bc-e583-41c5-8625-e20ea22264e5` |
| Startup status | `SUCCESS` |
| Listing pages parsed | 61 |
| Previously stored IDs suppressed | 408 |
| New candidate IDs | 212 |
| PostgreSQL rows inserted | 212 |
| Source errors | 0 |
| Webhook rows delivered | 212 |
| Pending/failed webhook rows | 0 |
| Rows after run | 19,463 |
| Distinct report IDs after run | 19,463 |
| Natural-key duplicate groups after run | 0 |
| Latest report date after run | 2026-08-24 |
| Container state | Running / healthy / zero restarts |
| Next scheduled run | 2026-08-25 07:00 IST |

A controlled second run over current page 1 parsed 20 already-stored rows,
suppressed all 20, inserted zero and sent no webhook. This is the direct live
idempotency check.

One `ABORTED` ledger row is retained intentionally as evidence of the controlled
container stop used while changing the initial webhook batch from 50 records to
one bounded digest. The next locked startup run automatically closed that stale
row; it did not write to the report table.

Original archive SHA-256:
`2023261357a193a8fce6a33766d7b232255527e1ddbee7e1e6905469a6f84b11`.
