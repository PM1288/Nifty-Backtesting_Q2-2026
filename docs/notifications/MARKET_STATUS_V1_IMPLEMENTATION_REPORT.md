# Market Status V1 Implementation Report

## Outcome

Implemented an additive market-intelligence notification subsystem with an independent schedule,
database schema, evaluation process, delivery process, webhook route and n8n workflow. It is
deployed safely but intentionally disabled and dry-run by default. No live order code exists in
the subsystem and no production WhatsApp message was sent during validation.

## Repository audit and selected canonical sources

| Concern | Existing repository source used |
|---|---|
| SmartAPI session and rate limits | existing Go collector in `cmd/collector` and `internal/smartapi`; no new broker client |
| Live/current-session quote state | `public.quote_snapshots` |
| Cash instrument/token mapping | `public.instruments` |
| Exchange trading dates | `public.trading_calendar`, snapshotted into the owned calendar |
| NIFTY50 membership | `oiis_live.universe_member.is_nifty50`, snapshotted effective-dated |
| OIIS run state | `oiis_live.selection_run` with `status='COMPLETED'` |
| OIIS candidates/rank/scores | `oiis_live.daily_candidate` |
| OIIS cadence | existing OIIS schedule remains authoritative; notifier polls committed new runs |
| Paper trading | excluded: `services/paper_trading`, `compose/compose.paper-trading.yml`, paper schema/outbox and active n8n route |

The NIFTY mapping validation discovered that NSE cash rows have nullable `instrumenttype`; the
mapping now uses `COALESCE(instrumenttype,'')` and proved 50 symbols/50 unique tokens. The first
runtime batch test also found that psycopg batch execution belongs on a cursor; that was corrected
before final deployment.

## Changed files

### Runtime and persistence

- `db/sql/037_market_status_notifications_v1.sql`
- `scripts/db_migrate_all.sh`
- `compose/compose.market-status.yml`
- `.dockerignore`
- `services/market_status/Dockerfile`
- `services/market_status/pyproject.toml`
- `services/market_status/.env.example`
- `services/market_status/src/market_status/config.py`
- `services/market_status/src/market_status/common.py`
- `services/market_status/src/market_status/models.py`
- `services/market_status/src/market_status/planning.py`
- `services/market_status/src/market_status/scheduler.py`
- `services/market_status/src/market_status/evaluation.py`
- `services/market_status/src/market_status/worker.py`
- `services/market_status/src/market_status/delivery.py`

### Contract, workflow and tests

- `schemas/market-status-whatsapp.v1.schema.json`
- `examples/market_status/*.json`
- `services/market_status/tools/generate_samples.py`
- `services/market_status/tests/*.py`
- `n8n/build_market_status_workflow.js`
- `n8n/test_market_status_workflow.js`
- `n8n/Market_Status_Outgoing_WhatsApp_v1.json`

### Operations and handoff

- `scripts/market_status_inspect.sql`
- `docs/notifications/MARKET_STATUS_WHATSAPP_V1.md`
- `docs/notifications/MARKET_STATUS_V1_IMPLEMENTATION_REPORT.md`
- `AGENT_HANDOFF.md`

Migration 036 and its old audit rows remain intact because dropping them would be destructive.
The prototype service is no longer configured or running.

## Database and deployment evidence

- Pre-migration schema backup:
  `/home/novius2/backups/market-status-v1-20260811-1700/pre-migration-schema.sql`
- Migration 037 applied and repeated successfully.
- Calendar rows: 197; trading days: 142.
- Effective 11 August universe: 50 rows, 50 distinct symbols, 50 distinct tokens.
- Two concurrent scheduler invocations left exactly one OPEN, MOVERS and CLOSE job for the date.
- Expired open/movers/close validation created only suppression audit rows, never late messages.
- Three deployed services are healthy with heartbeat state `DISABLED`.

## Shadow OIIS evidence

Canonical completed run `bf4308d7-91d3-4092-b21c-77b8c0f41c07` was consumed without recalculation.
Three persisted LONG rows cleared strict full-precision X/O thresholds. One combined event was
created, schema-validated and delivered as `204 DRY_RUN_NO_NETWORK`. The outbox has no pending,
retry or dead-letter row. As designed, dry-run delivery did not create successful-membership state.

## Verification results

| Check | Result |
|---|---|
| Market-status unit/contract/planning tests | 28 passed |
| Market-status Ruff | passed |
| n8n explicit formatter tests | passed |
| Compose config | passed |
| Migration apply/reapply | passed |
| Container health | 3/3 healthy |
| Effective NIFTY50 mapping | 50/50/50 |
| Scheduler concurrency | one row per slot |
| Shadow OIIS event | schema-valid, dry-run, no network |
| Paper tests | 17 passed, 6 skipped for absent isolated `TEST_DATABASE_URL` |
| Paper Ruff | passed |
| Paper source boundary | 93/93 pre-assignment SHA-256 files unchanged |
| Active paper n8n | same ID, path, active state and update timestamp |

## Remaining operator actions

1. Create dedicated market-status n8n Basic Auth and outbound Header Auth credentials.
2. Configure market-status gateway URL and test chat variables in n8n.
3. Run a complete live trading session with backend dry-run and reconcile every expected and
   suppressed job.
4. Activate the market-status n8n workflow against a test destination.
5. Run one complete live trading day to the test destination.
6. Only then set production webhook secrets, activate production delivery and enable the backend.

Threshold alerts and operations-alert delivery remain disabled. The optional operations URL is
reserved but no normal market message is routed through it.
