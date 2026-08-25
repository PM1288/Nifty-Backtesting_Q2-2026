# SmartAPI Collector Critical Review and Upgrade

**Review date:** 11 August 2026
**Repository:** `/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026`
**Deployed runtime:** `/home/novius2/trading-stack`
**Compose project:** `trading-stack-novius2`
**Safety mode:** market-data collection only; order and GTT endpoints are blocked in code

## Outcome

The SmartAPI collector was reviewed against the local `smarapi` requirements, its Go implementation, the deployed Compose configuration, PostgreSQL evidence, service logs and the operator dashboard. The upgraded collector and dashboard are deployed and healthy. Existing PostgreSQL data and schemas were not deleted, truncated or reset.

The collector now has conservative multi-window REST throttles, verified TLS, stable WebSocket subscription replanning, accurate per-socket health, durable bulk tick ingestion, explicit readiness/metrics endpoints and an authenticated admin view of collection coverage, rate usage and freshness.

There is one material capacity limitation: the requested all-F&O scope currently needs more than SmartAPI's available three sockets. The service allocates exactly 3,000 active token-mode subscriptions and drops 363-365 lowest-priority option-wing requests during replanning. Core equities, indices, futures and the highest-priority option contracts remain subscribed. This is visible in logs and must not be described as complete all-strike coverage.

## Audit findings before the upgrade

| Finding | Evidence | Risk |
| --- | --- | --- |
| Three WebSockets were filled to 1,000 subscriptions each | Active plan: EQUITY 250, FUT 379, INDEX 9, OPTIDX 162, OPTSTK 2,200 | No recovery-socket headroom; lower-priority option wings cannot all fit |
| WebSocket health reported 3,000 subscriptions for every connection | Persisted `websocket_health` rows | Misleading dashboard and impossible capacity diagnosis |
| Exchange sequence jumps were treated as per-token missing packets | Sequence-gap values grew into billions | False critical alerts and unusable health evidence |
| Tick archive experienced sustained queue loss | Pre-upgrade cumulative drop counter was approximately 1.37 million | Incomplete historical raw archive during bursts |
| Option subscriptions could be rebuilt every 30 seconds | ATM monitor and five-minute ticker could both trigger a rebuild | Repeated unsubscribe/subscribe storms and broker pressure |
| WebSocket TLS verification was disabled | Runtime `insecure_skip_verify: true` | Man-in-the-middle and certificate-validation risk |
| Candle backfill used the published ceiling | 3 requests/second and no minute cap | 403/rate-limit responses during backfill |
| Health endpoint mixed liveness and market readiness | One `/healthz` handler | Outside-market status could appear unhealthy even when the process was correct |
| Admin freshness query scanned large partitions | Authenticated route took approximately 19.7 seconds | Dashboard load competed with collector/database work |

## Implemented changes

### Rate safety

- Historical candles are limited to 2 requests/second, 120 requests/minute and 5,000 requests/hour.
- Quote batches remain limited to 50 symbols and one shared request/second budget.
- Minute and hour limits use shared rolling limiters rather than independent callers.
- Existing REST request logging remains durable in `public.api_request_log`.
- Order and GTT URLs are rejected unconditionally by the collector, even if a future configuration accidentally disables the paper-only guard.

### WebSocket stability and evidence

- Actual allocator counts are persisted per connection (`smartapi-ws-1` through `smartapi-ws-3`).
- The sequence metric now counts duplicate/out-of-order observations; it does not claim that positive exchange-sequence jumps are missing per-token packets.
- ATM shift requests are coalesced to the configured five-minute subscription-refresh cadence.
- A timer and an ATM trigger becoming ready together now cause one plan update, not two.
- TLS verification is mandatory at configuration validation.
- The archive buffer is 65,536 records and the write batch is 2,000.

### PostgreSQL durability

- Raw market-tick batches use PostgreSQL `COPY` into the existing partitioned table.
- A duplicate/replay conflict falls back to the prior idempotent `ON CONFLICT DO NOTHING` path.
- No in-memory state is used as the authoritative archive or request-usage record.
- Existing partitions and historic rows were preserved.

### Operations and dashboard

- `/healthz` is process liveness.
- `/readyz` reports database/market readiness and recognises the 15:40 F&O close.
- `/metrics` exposes Prometheus-compatible subscription count and newest-tick age.
- The authenticated Admin Control Plane displays read-only/paper mode, actual sockets, actual subscriptions, REST calls/throttles/failures, archive drops and dataset freshness.
- Dashboard freshness uses durable collector checkpoints and watermarks instead of full scans of large partitioned tables.
- Control-plane response time improved from approximately 19.7 seconds to 312 milliseconds in the deployed container.

## Post-deployment evidence

### Runtime health

| Component | Result |
| --- | --- |
| `trading-stack-novius2-collector-1` | Healthy |
| `trading-stack-novius2-n50-dashboard-1` | Healthy |
| Collector `/healthz` | HTTP success, `status=ok` |
| Collector `/readyz` outside market | `status=ok`, `market_open=false`, expected close `15:40` |
| Authenticated control-plane API | HTTP 200 in 312 ms |
| Authenticated control-plane through container Nginx | HTTP 200 in 168 ms |
| Safety indicator | `READ_ONLY_PAPER` |

The most recent post-restart WebSocket health rows reported:

| Connection | Status after market | Subscriptions | Sequence anomalies | Archive drops |
| --- | ---: | ---: | ---: | ---: |
| `smartapi-ws-1` | STALE (expected outside market) | 1,000 | 0 | 0 |
| `smartapi-ws-2` | STALE (expected outside market) | 1,000 | 0 | 0 |
| `smartapi-ws-3` | STALE (expected outside market) | 1,000 | 0 | 0 |

`STALE` outside the live session is intentionally different from process failure. The readiness endpoint remains healthy outside market hours.

### Stored data observed

| Dataset | Observed state |
| --- | ---: |
| Daily instrument-master snapshot | 152,044 rows; latest snapshot 11 August 2026 |
| Sampled raw market ticks | approximately 11.4 million rows from PostgreSQL statistics |
| Best-five depth snapshots | approximately 625,000 rows from PostgreSQL statistics |
| SmartAPI option-chain snapshots | 79,508 rows; latest 11 August 2026 10:03:59 UTC |
| Active WebSocket subscriptions | 3,000 |

The active allocation is 250 equities, 379 futures, 9 indices, 162 index options and 2,200 stock options, all with one mode per token.

## Tests executed

| Test | Result |
| --- | --- |
| `go test ./... -count=1` | Pass |
| Collector configuration validation | Pass with verified TLS; insecure TLS now fails closed |
| Live-order URL guard unit tests | Pass |
| WebSocket sharding/count tests | Pass |
| Archive sequence semantics tests | Pass |
| TypeScript API type check | Pass |
| TypeScript web type check | Pass |
| Dashboard API tests | 60/60 pass |
| Dashboard production Vite build | Pass |
| Collector Docker build/recreate | Pass |
| Dashboard Docker build/recreate | Pass |
| Authenticated Admin Control Plane smoke test | HTTP 200; complete collector payload |
| `/n50/control-plane` through production Nginx | HTTP 200; authenticated data API HTTP 200 |

No live broker order was placed or attempted.

## Remaining limitations and next-session checks

1. **Subscription capacity:** all three permitted sockets are full. Capturing every near/far option wing for every F&O underlying simultaneously is impossible within 3,000 token-mode subscriptions. The current priority allocator is safe, but a rotating archival tier or a narrower dynamic candidate universe is required for broader option coverage.
2. **No reserve socket:** because the requested universe consumes all sockets, the design cannot reserve the third connection for recovery. This is a deliberate, visible trade-off until the universe is narrowed or rotated.
3. **Live-session soak:** deployment completed after the session. The next trading session must verify sustained zero archive drops, acceptable lag, reconnect behaviour, subscription stability and REST throttle counts from 09:15 through the 15:40 F&O close.
4. **Transient connect response:** two `unexpected EOF` messages occurred during an after-market startup. Subsequent ticks and persisted health rows proved successful connections. Alert only if reconnect attempts become sustained during market hours.
5. **Earlier candle failures:** four 403 candle failures, including one throttle, occurred before the upgraded collector restart. No new candle throttle was observed after the restart, but the next scheduled backfill remains the meaningful soak test.
6. **Collector startup cost:** the daily 152,044-row instrument-master reconciliation makes initial readiness slower and briefly raises memory use. It should be profiled separately before changing established reference-data semantics.
7. **Frontend dependency audit:** the dashboard build reports 13 existing npm advisories (8 moderate, 3 high, 2 critical). A controlled dependency-remediation batch is required; broad automatic upgrades were not mixed into this collector change.

## Operator commands

```bash
cd /home/novius2/trading-stack

# Status
docker compose -p trading-stack-novius2 ps collector n50-dashboard

# Health from the host
curl -fsS http://127.0.0.1:18080/healthz
curl -fsS http://127.0.0.1:18080/readyz
curl -fsS http://127.0.0.1:18080/metrics

# Collector logs
docker logs --since 30m trading-stack-novius2-collector-1

# UI route (normal deployment host/domain)
# https://n50.nifty50today.co.in/n50/control-plane

# Safe rebuild/redeploy; does not remove volumes
docker compose -p trading-stack-novius2 build collector n50-dashboard
docker compose -p trading-stack-novius2 up -d --no-deps collector n50-dashboard
```

Do not run Compose with a different project name: the production dependencies and network are under `trading-stack-novius2`.

## Official references used

- SmartAPI documentation: <https://smartapi.angelone.in/docs>
- 50-symbol, one-request-per-second quote update: <https://smartapi.angelone.in/smartapi/forum/topic/4056/live-market-data-api-quote-endpoint-enhanced-with-50-symbol-bulk-fetch-and-1-request-per-second-rate-limit>
- Published endpoint rate limits: <https://smartapi.angelone.in/smartapi/forum/topic/4387/changes-in-api-rate-limit/5>
- Official WebSocket V2 implementation and `SNAP_QUOTE`: <https://github.com/angel-one/smartapi-python/blob/main/SmartApi/smartWebSocketV2.py>
- Three WebSocket connection limit: <https://smartapi.angelone.in/smartapi/forum/topic/4309/connection-problem-with-websocket2-0>
