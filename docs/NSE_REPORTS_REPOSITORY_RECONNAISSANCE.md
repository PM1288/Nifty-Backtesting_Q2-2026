# NSE Daily Reports Repository Reconnaissance

Reviewed: 12 August 2026 (UTC/Asia-Kolkata deployment)

## Supplied package

The `/home/novius2/NIFTY50/nse-csv-ingest` package contains a 65-family report catalogue, a
36-definition reference manifest, a standalone Docker collector, architecture notes and a
validated 11 August 2026 sample bundle. The reference package is an integration baseline, not the
deployed canonical service.

## Existing canonical owner

The deployed owner is `services/nse_ingestor`, container `nse_ingestor`, using the shared
`tradingdb` PostgreSQL instance and schema `nse`. It owns 17 enabled cash-market report definitions,
typed parsers, idempotent facts, file registry and run ledgers. It coexists with:

- SmartAPI `collector`: live quotes, futures/options, depth and OI; unchanged by this work.
- `institutional_flow_ingest`: FII/DII and institutional datasets.
- `nse_fii_reports_service`: official FII reports.
- NSE intraday/orchestration/recommendation services: downstream analytics, not raw EOD ownership.
- Paper trading: isolated schema/outbox and route; unchanged by this work.

## Defects found before implementation

1. Scheduled time was 07:30 IST, not 07:55.
2. Startup catch-up began at 07:00.
3. Calendar logic was weekday-only and scanned weekend dates during seven-day sync.
4. A report HTTP 404 was logged and silently ignored; no `ingest_run_reports` row was created.
5. A run could be marked `success` with multiple expected files unavailable.
6. No durable n8n notification outbox existed.
7. The scheduler had no replica-safe database lock or daily idempotency key.
8. Every restart reran all SQL files; `003_analysis_queries.sql` is a query pack rather than DDL and
   caused expensive reads/lock contention during startup.
9. The supplied 65-family target is broader than the 17 currently deployed parsers. This release
   does not pretend unsupported report families are successfully ingested.

## Chosen ownership and compatibility

The existing `services/nse_ingestor` remains canonical. A second report downloader was not added.
Database changes are additive (`nse.daily_job_run`, `nse.notification_outbox`,
`nse.schema_migrations`). Existing fact tables and SmartAPI/paper paths are untouched.

## Current report scope

The 07:55 job accounts for every enabled entry in `services/nse_ingestor/config/report_catalog.yml`.
The supplied report catalogue remains the controlled expansion plan for F&O contracts, settlement,
MWPL, bans, participant positioning, corporate events and point-in-time membership. Those families
must only be enabled after their parser, typed table, official endpoint and fixture pass validation;
otherwise they would create false success or permanent alert noise.
