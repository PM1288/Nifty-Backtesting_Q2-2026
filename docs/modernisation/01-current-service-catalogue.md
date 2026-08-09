# Current service catalogue

Captured: 2026-08-09 UTC

This catalogue describes the verified `trading-stack-novius2` deployment. It is
an audit record, not permission to remove a service. The base Compose file lists
26 services; the active deployment also includes overlay services for OIIS,
paper trading and additional ingestion, for 25 running containers at capture.

## Operational services

| Responsibility | Verified implementation | Reads/writes | Broker authority | Current decision |
|---|---|---|---|---|
| Production ingress and N50 static UI | Container Nginx on host port 19090; React/Vite dashboard image | HTTP only | None | Retain and harden; keep host Nginx separate |
| Core market collection | Go `collector` using `internal/smartapi` | PostgreSQL market/instrument tables | Live order calls disabled by configuration | Retain protected behaviour; add replay and adapter boundary tests |
| OIIS daily/live selection | `oiis-live` Python service | PostgreSQL market, regime and OIIS tables; paper API | Paper intent only | Retain and observe; keep isolated from generic research jobs |
| Universal paper trading | `paper-api`, monitor worker, webhook worker, scheduler | `paper_trading` plus read-only market data | Paper only | Retain as execution simulator and notification boundary |
| Dashboard/API | `n50-dashboard` Node/React application | Reads published `nse_app` and product schemas | None | Retain; add authenticated research-job API and workspace |
| Analytics publication | `nse-analytics-worker` Python | Reads governed market features; writes `nse_app.backtest_*` | None | Retain ownership; reuse calculation modules and publish contract |
| Intraday intelligence | API and scheduler pair | `nse_intraday` and related inputs | None found | Investigate scheduler/API consolidation after call-site tests |
| Recommendation state | API and scheduler pair | recommendation schemas | None found | Investigate scheduler/API consolidation after ownership audit |
| NSE orchestration/export | orchestrator and export API | NSE/reference/reporting schemas | None | Retain pending job-overlap analysis |
| FII and institutional ingestion | FII API, institutional scheduler, CDSL daily ingestion | institutional-flow schemas | None | Retain; scheduler ownership requires consolidation review |
| Disclosures | `nifty100-disclosures-api` | disclosure/reference data | None | Retain pending consumer audit |
| Option-chain ingestion | `option-chain-watcher` | derivative/quote/OI tables | Market-data only | Retain but profile; it was close to its memory limit |
| Market-data gateway | Python/ASGI gateway | market tables | None found | Retain pending API-consumer and memory audit |
| Legacy NSE ingestor | `nse_ingestor` | NSE market tables | None | Investigate overlap with collector/orchestrator; no removal yet |
| Redis | `redis:alpine` internal only | Dashboard snapshots, production sessions and rate limiting | None | Retain; removal would break authenticated dashboard safety controls |
| PostgreSQL | PostgreSQL 16.13, verified named volume | Authoritative system of record | N/A | Retain unchanged; backup/restore proof required |

## Runtime and ownership observations

- All SmartAPI order-capable semantics remain behind the existing Go package.
  The default configuration sets `DisableLiveOrders=true`; no live command was
  invoked during this audit.
- Research/backtesting is not on the execution path. It is Python-owned and
  publishes data which the Node dashboard reads.
- The paper service is already split by operational responsibility while using
  one image. This is an acceptable service pattern; it is not one container per
  strategy.
- The deployment has several API/scheduler pairs using the same image. They are
  candidates for shared-image retention and scheduler ownership cleanup, not
  automatic mergers.
- Container names, dependencies, database objects, cron ownership and consumer
  call sites must be reconciled before any service is classified as unused.
- Dedicated scheduler processes currently include CDSL FII, institutional flow,
  analytics polling, NSE orchestration, intraday intelligence, recommendation,
  OIIS daily/live work and paper summaries. Their domains differ, but job names,
  leases and write tables still need a collision matrix before consolidation.
- Every captured container used `unless-stopped`. All had zero restarts except
  option-chain-watcher, which had one restart and therefore needs log/OOM cause
  reconciliation alongside its high memory sample.
- Docker state confirms the option watcher was **not** OOM-killed: the prior
  process exited with code 0 on 2026-08-06 and the current health check is
  passing. Its one restart is therefore consistent with a controlled
  restart/redeploy, not evidence of a crash. The stable 496.9 MiB working set
  remains a capacity risk and requires a market-session memory profile.
- Process inspection attributes about 494.6 MiB RSS to the single long-running
  Node process; no resident Playwright/browser child was present. The optional
  screenshot path launches and closes Firefox per request, so the next profile
  should distinguish V8 heap/external buffers from transient screenshot memory
  before changing the protected polling logic.

## Scheduler ownership matrix

The running design has several schedulers, but the code audit did not find two
owners for the same named job. Consolidating these processes before operational
parity would increase cutover risk. The first release will keep one owner per
domain and add observability rather than create a new global scheduler.

| Owner | Trigger model | Durable/idempotency control observed | Decision |
|---|---|---|---|
| `nse_ingestor` | Shell loop, daily IST window plus startup catch-up | `nse.ingest_runs` successful-run check for the IST date | Retain; characterise delayed publication and restart behaviour |
| `nse-analytics-worker` | Shell loop every 1,800 seconds | Compares maximum raw and analytical trade dates | Retain; no separate lab work may run in this loop |
| `institutional-flow-ingest-scheduler` | Domain scheduler at 08:10 IST | Domain run records/configuration | Retain pending late-arrival replay test |
| `nse-orchestrator` | APScheduler cron catalogue | Logged run identity and configured command timeout | Retain; add singleton/lease evidence before scaling |
| `nse-intraday-scheduler` | APScheduler, eight named jobs | `max_instances=1`, `coalesce=true`, persisted operational runs | Retain; it alone owns intraday refresh/finalise/retention jobs |
| `nse-reco-scheduler` | APScheduler, five recommendation jobs | Scheduler disabled in API process; enabled only here | Retain; no duplicate API scheduler is active |
| `paper-scheduler` | One-minute loop for daily/weekly summaries | Transaction advisory lock plus unique summary key/revision | Retain; summary generation is idempotent for a period/revision |
| `oiis-live` | Dedicated bounded polling/daily selection | OIIS-owned run/selection identities | Retain; generic backtests must not share its execution loop |
| Proposed backtest-lab worker | Durable queue claim, not cron | Existing StratLab run/shard lease and `SKIP LOCKED` design | Add as an optional research worker, never as another market scheduler |

The remaining scheduler risk is not an observed duplicate job; it is fragmented
health, lag and failure reporting. A shared diagnostics page may aggregate each
owner's last-success and next-run state without taking over its work.

The run ledger reveals an evidence-based intraday scheduling problem:

- `intraday_sync_raw` averaged about 174.5 seconds over 625 successful runs,
  although its configured cron fires every minute;
- `intraday_refresh_features` averaged about 358.3 seconds over 329 successful
  runs and reached 1,578.9 seconds, also on a one-minute cron;
- APScheduler's per-job `max_instances=1` prevents same-job overlap, so this is
  persistent saturation/skipped cadence rather than duplicate execution;
- one sync and one quality run have remained `running` in the ledger since
  2026-08-04/05, showing missing abandoned-run reconciliation;
- the weekly intraday backfill completed successfully but occupied about 38.8
  minutes.

Do not simply add workers: these jobs execute large set-based PostgreSQL writes
and concurrent copies can increase contention. Batch F should add stale-run
reconciliation, expose observed runtime/lag, and set a measured cadence whose
interval is not shorter than sustainable completion time.

## Point-in-time resource risks

The first bounded sample found approximately 2,150 MiB total container memory
and 6.82 percent summed CPU. This is not a time-series benchmark.

| Container | Point sample | Interpretation |
|---|---:|---|
| option-chain-watcher | 496.9 / 512 MiB across repeated samples | Healthy and not OOM-killed, but only about 3% headroom remains |
| market-data-gateway | 330.7 / 384 MiB | Near limit; inspect retained frames/caches and worker count |
| PostgreSQL | 368.8 MiB / 1 GiB | Expected to vary strongly with active queries and dump load |
| collector | 191.9 / 512 MiB | Establish replay/load baseline before changing batching |

## Unresolved evidence

- Redis key cardinality, retention and memory-pressure behaviour; its consumers
  are now confirmed, so removal is not proposed. The bounded audit observed 11
  keys, all expiring, about 3.33 MiB Redis-reported memory and no configured
  `maxmemory` limit (`noeviction`). That is not present pressure, but a memory
  ceiling and alert should be evaluated before session/cache volume grows.
- Whether every base-Compose service is intentionally absent from the current
  overlay deployment.
- Whether each scheduler's run ledger is complete enough to prove missed-job
  recovery and expose one consistent diagnostic view.
- Whether the gateway memory is cache growth, Python allocator retention or a
  fixed working set.
- Whether the option watcher approaches OOM during a complete market session.

## Confirmed code-quality findings

- `ReplayPosition` in the analytics backtester declares `entry_charges` twice.
  Python resolves this to one field, so this is not evidence of duplicate
  charging, but the duplicate annotation should be removed under a golden test.
- Entry thresholds for the three published daily strategies are hard-coded in
  `_evaluate_signal_candidate` while exits are read from version configuration.
  The testing workspace must extract threshold reads with the existing constants
  as defaults and prove signal parity before exposing levels.
- The v1 daily backtest explicitly uses current universe members. Results carry
  a survivorship limitation and must not be relabelled point-in-time membership.
- The daily strategy engine exits on its authoritative target/stop/timeout
  policy. It does not itself represent the independent diagnostic ladder; the
  governed StratLab Rules-of-Engagement modules must remain separate.
- The OIIS UI mutation route's actor helper checks `req.user`, while the current
  auth middleware populates `req.authUser`. Audit attribution therefore falls
  back to `n50-ui`; correct this with a request-auth contract test.
- Several API routes use `$queryRawUnsafe` with static SQL and bound values.
  The new lab API must keep SQL identifiers fixed and use bound parameters; no
  operator input may become SQL syntax.
- The production Vite bundle is compiled into the Node API image and Nginx
  proxies the SPA rather than serving files from its own filesystem. A hashed
  asset returned `Cache-Control: public, max-age=0`; `index.html` returned the
  same policy. Nested SPA refresh and API routing work, but immutable asset
  caching and the requested Nginx static-serving boundary are not yet met.
  Split/static cutover must retain the combined image as rollback and be tested
  through the current `/n50/` base path.
