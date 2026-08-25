# NSE Daily 07:55 Ingestion and Missing-File Alerts

## Operating contract

- Scheduler: 07:55 every valid NSE trading day, timezone `Asia/Kolkata`.
- Source date: previous session from `market_status.exchange_session_calendar`.
- Concurrency: PostgreSQL advisory lock plus unique `nse.daily_job_run(job_date)`.
- Expected files: every enabled report in `config/report_catalog.yml`.
- Missing state: persisted as `nse.ingest_run_reports.status='unavailable'`.
- Run state: `SUCCESS`, `PARTIAL` or `FAILED`; missing files produce `PARTIAL`.
- Notification: one `nse.daily.files.missing.v1` event per job/source date.
- Delivery: separate `nse-ingestor-delivery` worker with immutable event ID and bounded retry.
- n8n route: `/webhook/codex-nse-daily-ingest-v1`, Basic Auth, explicit event whitelist.
- WhatsApp output: one concise Data Operations alert; it never creates or changes a trade.

## Inspection

```sql
SELECT job_date,source_trade_date,run_id,status,metrics,finished_at
FROM nse.daily_job_run ORDER BY job_date DESC LIMIT 10;

SELECT run_id,report_name,source_date,file_name,status,message
FROM nse.ingest_run_reports
WHERE run_id = :run_id ORDER BY report_name;

SELECT event_id,event_type,status,attempts,response_status,last_error,sent_at
FROM nse.notification_outbox ORDER BY created_at DESC LIMIT 20;
```

```bash
docker logs --tail 200 nse_ingestor
docker logs --tail 200 trading-stack-novius2-nse-ingestor-delivery-1
docker exec nse_ingestor python -m app.cli healthcheck
```

## Retry and recovery

Transient network failures, 408, 425, 429 and 5xx responses retry at 10 seconds, 30 seconds,
2 minutes, 10 minutes, 30 minutes and 1 hour. Permanent 4xx responses and exhausted events become
`DEAD_LETTER`. Correct the endpoint or credential before requeueing an approved row.

Rerunning the scheduler cannot duplicate the daily job or outbox event. To retry missing source
files, use the manual exact-date command after confirming publication:

```bash
docker exec nse_ingestor python -m app.cli daily --date YYYY-MM-DD
```

## Rollback

Stop only `nse_ingestor` and `nse-ingestor-delivery`, restore the prior image, and leave the additive
audit/outbox tables intact. No rollback of SmartAPI, OIIS or paper trading is required.

## Production verification — 12 August 2026

- Scheduler and delivery containers: healthy.
- Source session: 11 August 2026, resolved from the exchange calendar.
- Job: `PARTIAL`; 17 expected, 5 available/already loaded, 12 unavailable.
- Exactly 17 report-attempt rows were persisted: 5 `skipped`, 12 `unavailable`.
- Exactly one outbox event was created: `a5f7eca2-f59b-40fc-9eda-8087b6e58163`.
- Delivery completed with HTTP 200 and status `SENT`.
- n8n execution `227` completed through `Send NSE Data Alert` and
  `Record Delivered Alert`.
- Subsequent scheduler ticks returned `ALREADY_CLAIMED`; no duplicate job or alert was created.

## Controlled catalogue expansion plan

1. Add typed P0 F&O parsers/tables for UDiFF contracts, contract master, settlement, volatility,
   combined OI/MWPL, bans and participant/FII reports from the supplied reference package.
2. Add official corporate, index membership and sector sources with `available_at` lineage.
3. Enable a report only after recent/historical endpoint smoke tests and parser fixtures pass.
4. Add immutable raw-object retention before enabling high-volume historical backfill.
5. Add P1 delivery, short-selling, SLB, surveillance and large-deal enrichment.
6. Keep unsupported catalogue families disabled rather than reporting false ingestion success.
