# Real-time ingestion and dashboard review — 2 October 2026

Canonical repository: `/home/novius2/trading-stack`.
Implementation branch: `perf/realtime-ingestion-20261002`.
Evidence directory: `/home/novius2/NIFTY50/evidence/realtime-20261002`.

## Findings and changes

| Finding | Resolution |
|---|---|
| Failed instrument-state writes discarded the drained cache | Requeue failed states, coalesce by instrument, retain newer observations, bound each write to three seconds |
| Old REST/WS observations could replace newer prices | Enforce timestamp ordering in memory and PostgreSQL; preserve a known price when a partial update has none |
| REST polling stamped old market prices with current receipt time | Use exchange feed time, then exchange trade time; untimestamped quotes remain archived but cannot refresh state. Source `rest_quote_exchange` permits one-time correction of legacy `rest_quote` receipt timestamps |
| WebSocket reconnects leaked heartbeat tasks; cancellation could hang on socket reads/full output | Scope heartbeat/read work to each connection, close on cancellation, make sends/dials/backoff cancellable, bound subscription writes, reconnect on subscription-write errors |
| Subscription reconciliation could block while draining an already-consumed channel | Use nonblocking replacement and cancellation-aware delivery |
| Failed archive/bar writes caused buffers and retry load to grow | Bound batches, retain failed batches and retry on timers; preserve upstream backpressure and existing tick-drop counters. Bars drain on shutdown using a separate deadline |
| COPY failure retried every row even when the database was unavailable | Use the idempotent row fallback only for PostgreSQL unique-conflict errors |
| `/readyz` used weekday/time checks and called an exchange holiday open | Read the authoritative `trading_calendar`, honor overrides, fail closed on missing calendar dates, do not fabricate a last-tick timestamp |
| Home MWHD latest-session lookup scanned millions of minute bars | Seek the latest eligible bar using the existing timestamp indexes; unchanged date/time rules and exact results verified |
| Historical instrument entries competed with active-universe reads | Migration 064 adds two concurrent partial indexes; source tables and historical rows are retained |
| PostgreSQL runtime limits differed from committed Compose | Applied committed 2 CPU / 2 GiB limits; later recreated PostgreSQL to restore committed max_connections=80, preserving its image and data volume |
| Dashboard sockets duplicated reads, overlapped slow polls, sent unchanged values, and accumulated slow-client buffers | Shared 500 ms latest-state cache and 60 s universe cache, serial one-second polling, changed-value delivery, per-message sequence, heartbeat, bounded payload/subscriptions/outbound buffer |
| Browser updates rendered per quote and session-check failures stopped recovery | Batch updates at 100 ms, reject older source timestamps, retry temporary session failures, cancel work on unmount |
| Fixed header obscured the Monthly inspector close control | Position the inspector below the responsive header; retain usable viewport height |
| A Redis error permanently disabled the snapshot cache | Reconnect after a five-second cooldown, bound connect/commands to one second, disable offline command queuing, fall back to durable DB snapshots |

The existing header feed-quality display and stock/index live quote surfaces consume the repaired stream. Existing Scalper V2 charts keep their 15-second price/30-second option-history polling and mounted chart instances. These are analytical bars/history, not a tick-by-tick execution terminal. No signal thresholds, strategy models, order permissions, alert destinations, or historical market facts were changed. There is no evidence supporting retraining a predictive model for these infrastructure faults.

## Performance evidence

The original Home query exceeded an initial 45-second statement timeout under the original database limits. A later comparison ran both complete queries in **one repeatable-read snapshot** after correcting the runtime limits:

- Before: **10,453.459 ms**, 210 rows.
- After: **1,343.867 ms**, 210 rows (about **7.8× faster**).
- Both result checksums: `ad30e1045b8cb51b51e32a598832d480`.
- Evidence: `overview-equivalence.sql`, `overview-equivalence.txt`; query plans in `overview-plan.txt`, `overview-after.txt`.

A real PostgreSQL test wrote only a unique disposable schema, then dropped it. Five 3,000-row batches initially measured median **197.7 ms**, max **208.9 ms**. A repeat while browser/analytics checks were running measured median **502.6 ms**, max **685.9 ms**. This demonstrates load sensitivity, not a guaranteed SLA. Production collector flush cadence is explicitly one second via `INSTRUMENT_STATE_FLUSH_SECONDS`; the YAML default remains backward-compatible. Combined flush/stream scheduling is nominally about two seconds plus DB/network/browser time, not measured market-hour tick latency.

## Validation and commands

Run from the canonical repository:

```bash
go test -race ./...
npm run typecheck --prefix neon-stock-terminal/apps/api
npm test --prefix neon-stock-terminal/apps/api
npm run build --prefix neon-stock-terminal/apps/api
npm run typecheck --prefix neon-stock-terminal/apps/web
npm test --prefix neon-stock-terminal/apps/web
npm run build --prefix neon-stock-terminal/apps/web
bash scripts/verify/canonical-repository-gate.sh
git diff --check
neon-stock-terminal/node_modules/.bin/tsx tools/verify/realtime-cache-recovery.ts
```

Go race tests pass. API tests: 280/280. Web tests: 283/283. Type checks and builds pass. Tests cover cancellation with a blocked socket/output, failed state requeue, bar retry/drain, shared reads, deduplication and source timestamps. The isolated Redis test passed cache hits, DB fallback during outage, reconnection after restart, and preservation of the original snapshot timestamp.

Real database validation (inherits protected PostgreSQL credentials inside the container; writes only a disposable schema):

```bash
CGO_ENABLED=0 go test -c -o /tmp/n50-store-realtime.test ./internal/store
docker cp /tmp/n50-store-realtime.test trading-stack-novius2-postgres-1:/tmp/n50-store-realtime.test
docker exec -e N50_STORE_INTEGRATION=1 trading-stack-novius2-postgres-1 \
  /tmp/n50-store-realtime.test -test.run TestRealtimeStatePersistence -test.v
```

NSE report downloads already use pooled HTTP connections, explicit connect/read timeouts, paced candidate requests, validated report signatures, size limits, checksums, and atomic staging. The three download-integrity tests passed in the existing NSE image with networking disabled. No bulk reingestion or external notification was triggered. Live DB inspection found the latest report source date was 2026-09-30 (14 loaded, 31 archived, 18 unavailable). The old 07:55 scheduler skipped holidays, postponing 1 October reports. The follow-up repair runs against the previous verified source session on any calendar day and suppresses already processed source sessions under its existing advisory lock. A maintenance `tick(notify=False)` catches up without enqueuing external notifications. Unavailable reports are never counted as loaded; explicit manual daily ingestion remains available to retry them.

Authenticated browser commands require `PLAYWRIGHT_ADMIN_PASSWORD` supplied through a protected process environment. Do not put it into commands, files or logs. Set `PLAYWRIGHT_BASE_URL=https://n50.nifty50today.co.in/n50` and `PLAYWRIGHT_ORIGIN=https://n50.nifty50today.co.in`.

```bash
node tools/playwright/canonical-feature-regression.mjs
node tools/playwright/monthly-all-stock-ledger-regression.mjs
node tools/playwright/paper-event-notifier-regression.mjs
node tools/playwright/paper-workbench-v2-regression.mjs
node tools/playwright/home-stock-pixel-card-regression.mjs
node tools/playwright/scalper-v2-refresh-regression.mjs
node tools/playwright/realtime-feed-regression.mjs
```

Existing browser harness repairs use the current combined market/paper speech label, the actual Entry method combobox, and the canonical `/n50/auth/session/dev-login` path. The Home check follows the current summary/full-board layout (logos/initials and stock quick view), retaining legacy pixel checks only when the legacy Home is selected. It tests rendered records rather than a hardcoded population count. Production code is not changed to satisfy outdated selectors.

## Release and rollback

Only release from pushed `master`, after the required checks. Preserve both running image IDs and tag them before rebuilding:

```bash
docker image tag "$(docker inspect -f '{{.Image}}' trading-stack-novius2-collector-1)" trading-stack-collector:before-realtime-20261002
docker image tag "$(docker inspect -f '{{.Image}}' trading-stack-novius2-n50-dashboard-1)" trading-stack-n50-dashboard:before-realtime-20261002

docker exec -i trading-stack-novius2-postgres-1 sh -c \
  'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1' \
  < db/sql/064_active_universe_read_indexes.sql

docker compose -p trading-stack-novius2 --env-file .env -f docker-compose.yml build collector
docker compose -p trading-stack-novius2 --env-file .env -f docker-compose.yml up -d --no-deps --no-build collector
bash scripts/deploy_n50_dashboard.sh
curl --fail --silent http://127.0.0.1:18080/readyz
```

For image rollback, retag each `before-realtime-20261002` image to its current Compose image tag and recreate **only** that service with `--no-deps --no-build`. Record the actual image tags in release evidence. The additional indexes can remain during rollback; they do not change data. If index removal is necessary, use `DROP INDEX CONCURRENTLY public.instrument_universe_live_equity_idx` and `DROP INDEX CONCURRENTLY public.instrument_universe_live_derivative_idx` outside a transaction. The migration checks `indisvalid` and rebuilds only its own invalid indexes before retrying. It now allows a bounded 60-second lock wait because concurrent validation also waits for old read snapshots.

The runtime resource adjustment can be reversed without restarting:

```bash
docker update --cpus 1 --memory 1g --memory-swap 2g trading-stack-novius2-postgres-1
```

## Practical limits

2 October is an official NSE holiday (NSE circular FAOP71777, https://nsearchives.nseindia.com/content/circulars/FAOP71777.pdf). Market-hour tick throughput and reconnect-gap recovery cannot be accepted from holiday snapshots. Keep the existing source timestamp visible and validate during the next open session. SmartAPI stream protocol reference: https://github.com/angel-one/smartapi-python/blob/main/SmartApi/smartWebSocketV2.py.

The sampled raw-tick archive remains bounded and best effort: a prolonged DB outage beyond its queue capacity increments archive-drop evidence; there is no new disk WAL and no promise of lossless raw-tick recovery. Bars and latest state have retries/backpressure, and shutdown deadlines report unresolved work rather than hanging forever. Existing REST/bar backfill is retained. These changes do not establish broker execution suitability or guarantee every external NSE report is already published/available.

Release results and pushed source SHAs are recorded below.

Pre-release browser evidence: canonical shell 9/9, Monthly/Rolling ledger 12/12,
Paper notifier 17/17, Paper Workbench passed at six viewport sizes, current Home
logos/quick-view 5/5, Scalper 70-second refresh/retained-chart test passed. The Monthly
check used `PLAYWRIGHT_PREVIEW_MONTHLY_INSPECTOR=1` to preview the candidate drawer
CSS before deployment; it must be rerun without that flag after release. One repeat
was needed because Docker's disposable Redis networking change caused a browser
`ERR_NETWORK_CHANGED`; the final repeat passed without filtering that error.

## Follow-up: holiday catch-up and analytical transactions

The first two index attempts timed out while a monthly strategy connection was
idle in a transaction during CPU evaluation. No source rows were changed. The
follow-up releases fully materialized read snapshots before monthly/open/first-session/
rolling-window evaluations and expiry-history CPU work. Persistence still uses its
existing transaction; calculation inputs and strategy mathematics are unchanged.

- NSE full unittest suite: **12 passed**, including holiday catch-up, source-session
  deduplication and explicit suppression of notification enqueueing.
- Rolling Monthly complete pytest suite: **29 passed**, including a regression
  asserting that read transactions end before the long calculation starts.
- Collector/dashboard deployed from pushed `c9bb42f`, both healthy, zero restarts.
- `/readyz`: `status=ok`, `market_open=false`, `subscriptions_count=3000`.
- Live state rows are transitioning from legacy receipt timestamps to verified
  `rest_quote_exchange` timestamps on ordinary broker responses; old inactive
  instruments are not rewritten or relabelled as fresh.

The catch-up run is executed once from the pushed source before replacing the
scheduler, using `from app.scheduler import tick; print(tick(notify=False))` in a
one-off `nse_ingestor` container. It claims the durable daily job, so the new scheduler
will not re-run the same source on startup. Existing notification delivery is neither
invoked by the maintenance run nor reconfigured.

## Completed production release

Both implementation branches were pushed and fast-forwarded to `master` before
release. Collector/dashboard source: `c9bb42fbffd4d5f4710259c2d8fbd5388228ac22`.
NSE/Monthly follow-up source: `25f6d163f7d2cdf5552934dd01e1d9c534bcd614`.
The final documentation/browser-selector commit does not change deployed runtime code.

All five release containers are healthy. Exact image IDs are in
`images-after.txt`. Collector, dashboard, Rolling Monthly, NSE and PostgreSQL
reported zero restarts on their replacement containers. Some other dependent
workers automatically restarted/reconnected during the PostgreSQL restart; this
was not a zero-interruption database change.

The database had also drifted to **50 connections**, producing connection refusals.
Recreating only PostgreSQL from committed Compose restored **80 connections**;
32 were connected at the recorded check. Before/after inspection confirmed the
**identical PostgreSQL image** and **same `trading-stack-novius2_pgdata` volume**.
No source tables or historical records were reset. Both migration-064 indexes are
valid (zero invalid release indexes). Evidence: `postgres-before.json`,
`postgres-after.txt`, `postgres-deploy.txt`, `services-after-db-restart.txt`.

The 1 October source-session catch-up completed with status **PARTIAL**:

- **16 reports loaded, 177,488 rows**.
- **32 reports archived**.
- **15 reports unavailable**, all final HTTP 404; see `nse-unavailable.txt`.
- Notification outbox stayed at **35 rows before and after**; maintenance did not
  enqueue notifications.
- A subsequent scheduler tick returned **SOURCE_ALREADY_PROCESSED**.

Unavailable reports: cm_albm, cm_client_funding, cm_extreme_loss_margin,
cm_impact_cost, cm_mode, cm_turnover, cm_var_multiplier, fo_base_prices,
fo_combined, fo_contract_nse, fo_derivatives_update, fo_exercise, fo_mode,
fo_turnover, margin_trading. External availability remains unresolved; successful
reports are preserved and absent data is not fabricated. PARTIAL sessions are
intentionally deduplicated; later recovery of missing publications requires the
existing targeted report retry workflow rather than replaying every report.

After the restart and catch-up, the optimized overview SQL measured **2,854.587 ms**
(`overview-released.txt`). Cache/load/source inputs differ from the earlier paired
comparison, so this is an additional observation rather than an SLA.

### Final checks

- Go full race suite passed; API **280/280**, web **283/283**, both typechecks/builds passed.
- NSE **12/12** and Rolling Monthly **29/29**, including checks in release images.
- Real PostgreSQL timestamp/order/preservation checks and Redis outage/recovery passed.
- After database restart: authenticated realtime reconnect test **4/4**, canonical
  preservation **9/9**, Monthly ledger **12/12** without preview CSS, notifier
  **17/17**, Paper Workbench at six viewport sizes, Home **5/5**, and Scalper's
  real 70-second polling window all passed.
- Home's final test distinguishes logo initials from the actual stock identity and
  inspects virtualised tiles atomically; an initial broad `<b>` selector was invalid.
- Scalper retained all three chart roots and the same document across 11 polls;
  its displayed source remained 1 October / market closed.
- Collector readiness is healthy with market closed and 3,000 subscriptions;
  old source times remain visible. This does not prove open-session throughput.

### Exact follow-up release commands

Run from `/home/novius2/trading-stack` on pushed master. The one-off catch-up was
run after image build and before replacing the scheduler; do not blindly replay
it as a new ingestion job.

```bash
docker compose -p trading-stack-novius2 --env-file .env -f docker-compose.yml -f compose/compose.rolling-monthly.yml build nse_ingestor rolling-monthly
docker compose -p trading-stack-novius2 --env-file .env -f docker-compose.yml -f compose/compose.rolling-monthly.yml up -d --no-deps --no-build rolling-monthly
docker exec -i trading-stack-novius2-postgres-1 sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1' < db/sql/064_active_universe_read_indexes.sql
docker compose -p trading-stack-novius2 --env-file .env -f docker-compose.yml run --rm --no-deps --entrypoint python nse_ingestor -c 'from app.scheduler import tick; print(tick(notify=False))'
docker compose -p trading-stack-novius2 --env-file .env -f docker-compose.yml up -d --no-deps --no-build nse_ingestor
docker exec nse_ingestor python -c 'from app.scheduler import tick; print(tick(notify=False))'
# Controlled database restart, after catch-up finished:
docker compose -p trading-stack-novius2 --env-file .env -f docker-compose.yml up -d --no-deps --no-build postgres
```

Retained rollback image tags and their Compose targets:

| Saved image | Restore target |
|---|---|
| trading-stack-collector:before-realtime-20261002 | trading-stack-novius2-collector:latest |
| trading-stack-n50-dashboard:before-realtime-20261002 | trading-stack-n50-dashboard:latest |
| trading-stack-nse-ingestor:before-realtime-20261002 | trading-stack-nse-ingestor:latest |
| trading-stack-rolling-monthly:before-realtime-20261002 | trading-stack-rolling-monthly:2.4.0 |

Use `docker image tag SAVED TARGET`, then the matching Compose `up -d --no-deps
--no-build SERVICE` (include the Monthly compose file for that service). Keep the
corrected database connection/resource settings and additive indexes. Preserve the
new source reports and archive records during image rollback.
