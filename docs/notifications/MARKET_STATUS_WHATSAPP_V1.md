# Isolated Market Status and OIIS WhatsApp Notifications V1

## Release state

The additive subsystem is deployed with `MARKET_STATUS_NOTIFICATIONS_ENABLED=false` and
`MARKET_STATUS_DRY_RUN=true`. Its n8n workflow is imported but inactive. This is intentional:
dedicated inbound and outbound credentials plus a test WhatsApp destination must be configured
before shadow rollout. The existing paper-trading API, event contract, outbox, workers, n8n
workflow and credentials are outside this subsystem and were not changed.

## Ownership boundary

| Area | Owned by this subsystem |
|---|---|
| Compose | `compose/compose.market-status.yml` |
| Code | `services/market_status/` |
| PostgreSQL | schema `market_status` only |
| Event schema | `schemas/market-status-whatsapp.v1.schema.json` |
| Samples | `examples/market_status/` |
| n8n | `Market-Status-Outgoing-WhatsApp-v1`, route `codex-market-status-v1` |
| SmartAPI | no direct connection; reads existing `public.quote_snapshots` |
| OIIS | read-only consumption of committed `oiis_live.selection_run` and `daily_candidate` |

No `PAPER_TRADE_*` key, paper event, paper URL, paper table, paper worker or paper workflow is
referenced. Market-status delivery failure cannot participate in an OIIS or paper transaction.

## Runtime flow

```text
exchange calendar -> scheduler -> market_status.job_run
canonical quote/OIIS data -> evaluation worker -> notification_outbox
notification_outbox -> schema-validating delivery worker -> dedicated n8n webhook
n8n event switch -> whitelisted compact formatter -> dedicated WhatsApp gateway credential
```

The scheduler uses a PostgreSQL advisory transaction lock. Job uniqueness prevents a second
replica from enqueueing the same date/slot. Workers claim rows with `FOR UPDATE SKIP LOCKED`.
Business evaluation and outbox creation commit together. The delivery worker retries the same
immutable event ID, dedupe key, correlation ID, source run and payload.

## Schedule and suppression

All scheduling is in `Asia/Kolkata` and reads `market_status.exchange_session_calendar`, seeded
from the existing exchange calendar. Weekends and holidays have no jobs. Special sessions require
all override times; incomplete special sessions suppress all three daily jobs.

| Event | Due | Deadline/finalisation |
|---|---:|---:|
| NIFTY open | 09:16:05 | no send after 09:18:00 |
| NIFTY50 movers | 09:20:05 | no send after 09:22:00 |
| NIFTY final close | trigger 15:30 | final data not before 15:42; normal 15:50; delayed cutoff 18:00 |
| OIIS candidates | after a new committed completed run | maximum run age 300 seconds |

The close job never treats a 15:30 tick as final. It requires a current-date `CLOSED` quote whose
timestamp meets the finalisation gate. Open and movers queries are bounded by the configured
decision deadline, so a later quote cannot leak into those messages.

## Canonical sources and quality gates

- NIFTY index token: existing NSE token `99926000` in `public.quote_snapshots`.
- Constituent universe: the current `oiis_live.universe_member.is_nifty50` source, snapshotted by
  effective date and joined to current NSE cash tokens in `public.instruments`.
- Movers require exactly 50 members, 50 unique symbols, 50 unique tokens and 50 fresh quotes.
- Current price and previous official close come from the same quote snapshot basis.
- All calculations use `Decimal`; rounding occurs only in n8n display formatting.
- No public delayed-data fallback and no new SmartAPI session exist.

## OIIS policy

The notifier does not calculate or alter OIIS. From each committed completed run, it accepts only
unique valid LONG/SHORT rows with estimable full-precision `XFactor > 70` and `OFactor > 70`, valid
data permission, and no fixture/test override or blocking unavailable state. Canonical direction
rank is used; the documented minimum/average/edge/symbol fallback applies only when rank is absent.

At most three LONG and three SHORT candidates are placed in one event. Membership fingerprints
contain only sorted `LONG:SYMBOL` and `SHORT:SYMBOL` identities. Rank, score and price-only changes
do not send. Empty membership does not send and does not overwrite last successful membership.
Successful state advances only after a confirmed real 2xx response; dry-run delivery cannot
advance it. This permits a legitimate A -> B -> A sequence.

## Delivery policy

- Transient: network/timeout, 408, 425, 429 and 5xx.
- Permanent: invalid schema, 400, 401, 403, 404 and 422.
- Retry delays: 10 s, 30 s, 2 min, 10 min, 30 min, 1 hour.
- Maximum attempts: six by default.
- Exhausted/permanent failures become `DEAD_LETTER`; rows are retained.
- Full payloads and credentials are not logged at INFO.

## Configuration and first rollout

Copy values from `services/market_status/.env.example` into the deployment secret/config source.
Create dedicated n8n Basic Auth and Header Auth credentials; do not bind paper credentials. Set
the n8n variables `MARKET_STATUS_WHATSAPP_GATEWAY_URL` and
`MARKET_STATUS_WHATSAPP_CHAT_ID` to a test destination first.

Keep the production feature flag false while configuring n8n. Then:

```bash
docker compose -p trading-stack-novius2 \
  -f docker-compose.yml -f compose/compose.market-status.yml \
  up -d market-status-scheduler market-status-worker market-status-delivery

docker compose -p trading-stack-novius2 \
  -f docker-compose.yml -f compose/compose.market-status.yml \
  ps market-status-scheduler market-status-worker market-status-delivery
```

For shadow mode, set notifications enabled and dry-run true. Reconcile a complete trading day in
the tables before activating n8n or setting dry-run false. Threshold alerts remain disabled.

## Inspection

```bash
docker exec -i trading-stack-novius2-postgres-1 \
  psql -U trader -d tradingdb < scripts/market_status_inspect.sql

docker compose -p trading-stack-novius2 \
  -f docker-compose.yml -f compose/compose.market-status.yml \
  logs --tail=200 market-status-scheduler market-status-worker market-status-delivery
```

To inspect dead letters:

```sql
SELECT event_id,event_type,dedupe_key,attempts,last_error,updated_at
FROM market_status.notification_outbox
WHERE status='DEAD_LETTER'
ORDER BY updated_at DESC;
```

Requeue only after correcting the permanent cause and recording operator approval:

```sql
UPDATE market_status.notification_outbox
SET status='RETRY',next_attempt_at=now(),updated_at=now()
WHERE event_id=:approved_event_id AND status='DEAD_LETTER';
```

## Rollback

Set `MARKET_STATUS_NOTIFICATIONS_ENABLED=false`, then stop only the three market-status services.
Do not remove volumes and do not reverse migration 037. Audit, outbox and delivery rows remain for
forensics. Paper trading and OIIS require no restart or rollback.

## Verification commands

```bash
PYTHONPATH=services/market_status/src \
  /tmp/market-status-test-venv/bin/pytest -q services/market_status/tests
/tmp/market-status-test-venv/bin/ruff check services/market_status/src services/market_status/tests
node n8n/test_market_status_workflow.js
services/paper_trading/.venv/bin/pytest -q services/paper_trading/tests
services/paper_trading/.venv/bin/ruff check services/paper_trading/src services/paper_trading/tests
```

Database-backed paper tests that require `TEST_DATABASE_URL` remain skipped unless that isolated
test database is supplied; no destructive test is pointed at the authoritative database.
