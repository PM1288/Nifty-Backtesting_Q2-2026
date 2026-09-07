# Reliability, speed and dashboard consistency

## Incident observed, not hidden

During the sequential route smoke review, dashboard logs showed repeated Prisma P2024 connection-pool timeouts. Several requests returned HTTP 502, including Trading Analytics, header/notification/session requests and Paper/Backtesting HTML. The dashboard process restarted at **2026-09-07 18:33:04.700 UTC**, RestartCount 1, and subsequently became healthy. Broad extended rechecks were stopped to avoid additional load. No production service was manually restarted or killed by this audit. The audit-owned browser process was terminated.

The temporal association is evidence of load sensitivity, not proof of one root cause. OOMKilled was false: do **not** label this a proven OOM crash. Additional exception/lifecycle profiling is needed in isolation.

Verified runtime constraints: dashboard 512 MiB / 0.5 CPU, Prisma connection limit 4, pool timeout 15 seconds. PostgreSQL 2 GiB / 2 CPU, shared buffers 256 MiB, work_mem 4 MiB, max connections 80; approximately 37 observed sessions. Global database connection exhaustion was not established. Four busy API connections can still queue expensive requests until they fail.

## Query evidence

Statistics are cumulative over an unverified interval, not a controlled benchmark. No SQL text/user payloads are included in the exported slow-query list.

| Observed family | Mean execution | Implication |
| --- | ---: | --- |
| Market-state history statistics | ~7.74 s | Whole-history work is unsuitable for every dashboard refresh |
| Security-minute feature query | ~7.46 s | Large temp-write workload; bound dates/materialize aggregates |
| Instrument profiles query | ~3.74 s | Investigate joins, selectivity and cache ownership |
| Stock signal history statistics | ~3.23 s | Precompute stable historical outcomes |
| Raw security minute query | ~3.05 s | Partition pruning, bounded windows and incremental processing |

Database cumulative temporary writes were ~352.65 GiB across 68,599 files: **not current occupied temporary disk space**. WAL was ~560 MiB with no replication slots, not the dominant storage issue. One ingestion connection was idle in transaction for over four days; backend_xmin was null at observation, so it was not proven to block vacuum. Fix transaction scope, connection lifetime and idle transaction timeouts with service-owner review.

## Prioritized changes

### P0 — service stability and correctness

- Bound/cancel expensive dashboard queries, deduplicate shared fetches, cache latest snapshots and isolate failure of secondary panels. Preserve prior valid data with as-of/stale labels.
- Handle Prisma timeout/rejection at request and background-job boundaries; return typed partial/degraded responses instead of crashing a shared process. Add queue limits and circuit breakers, not unlimited retries.
- Measure request concurrency, queue time, query time, event-loop delay, RSS, restart reasons and per-endpoint errors. Correlation IDs in structured logs, no credentials or large market payloads.
- Budget connections across services before tuning the four-connection pool. Increasing it alone may increase database contention. Load-test after query fixes; evaluate higher CPU/memory allocations with host headroom and rollback.
- Materialize canonical daily index history before retention; keep target-path facts and maturity correct after raw expiry.
- Repair misleading health checks: NSE analytics worker health currently calls an unsupported CLI command, causing usage/exit 2. This does not prove its analytical jobs have stopped.
- Reconcile stale RUNNING jobs using durable leases/heartbeats; prevent duplicate restarts and historical regeneration.

### P1 — efficient analysis

- Latest-state tables/cache separate from append-only raw evidence. Incremental rollups and watermarks; run historical analytics asynchronously, not inside first-render queries.
- Date predicates must be sargable and prune partitions. Inspect bounded EXPLAIN plans in staging, never assume a new index fixes an unbounded aggregate.
- Persist compact daily outcomes / cohort summaries. Keep source, calculation version, denominator and freshness with every result.
- Consolidate source-equivalent duplicates only after semantic comparison. Yahoo adjusted prices, official EOD and live quotes are not interchangeable duplicates.
- Keep tables virtualized and exports server/full-dataset based. Mount only active charts/lenses. Cancel abandoned route requests without introducing component-owned polling.
- Target autovacuum/analyze thresholds for high-churn relations. Consider PostgreSQL memory/CPU increases only after workload measurement; avoid large global work_mem per connection.

### P2 — operational management

- Daily storage report by producer/table/index/partition, growth GiB/day, expired backlog, deletion failures, disk forecast and held evidence.
- Separate production, research scratch and CI data ownership/TTL; pin approved results instead of retaining every intermediate observation.
- Backup restore drills, capacity budget, deployment checksum enforcement and retention policy tests in CI.

## Browser regression results — limited acceptance

Initial 4.5-second observations: **65 total, 49 shell-smoke passes, 16 review/incomplete**. This includes 55 fixed desktop routes at 1440×900 and ten mobile families at 390×900. “Shell smoke pass” explicitly does **not** mean numerical, chart, export or full accessibility parity. Loading screens can pass some structural checks.

Extended 20-second rechecks loaded `/analytics/leadership`, `/analytics/daily-setups` and `/options/structure`, which were incomplete/empty at the short observation. The extended run was stopped during the reliability incident and is not a completed regression run.

Observed accessibility findings include OISS color contrast (ten affected nodes), nested/duplicate landmark issues, and an Institutional Flow heading-order issue. Tested shell geometry was compact, but this cannot certify every loaded chart axis, tooltip or missing-data state.

Known source gaps remain: cash FII/DII latest retained date September 3 with ingestion DNS failures; near-ATM Greeks absent in the retained source and blank-symbol persistence collision suspected. See `docs/trading-analytics/CASH_OI_AXIS_20260907.md`. Neither gap is solved by deleting history.

## Required consistency regression before any purge sign-off

Use frozen, timestamped fixtures and a restored staging database. Compare before/after values, not screenshots alone:

1. Daily OHLCV, adjustment/source precedence and every tracked stock/session; index daily fallback parity.
2. Market/sector breadth denominators and windows; zero vs missing vs stale; stock identity and eligibility.
3. OI totals, previous-observation change vs daily OI change, Greek delta units; chart axes and scales.
4. Actual realized/open P&L vs hypothetical paths; entry/stop/target first-hit timing, MFE/MAE and maturity for open and 30-session positions.
5. Seven exchange-session intraday backtesting window; expired data explicitly unavailable, not fabricated “no trade.”
6. OIIS/OISS run versions, AI research, selected-contract evidence, audit/comments, exports and deep links.
7. Representative desktop/mobile loaded states and keyboard/axe checks; selected entity retained across refresh/lens changes.
8. Controlled three-user request load with p50/p95 latency, error/restart count, query queue, DB I/O and resource usage. Stop on sustained 5xx or pool exhaustion.

No all-stack regression sign-off is issued. No new performance improvement is claimed because this turn changed no runtime code.

## Host storage is separate

Filesystem observation: approximately 921 GiB used / 763 GiB free, 55% used. Docker reported ~155.9 GB reclaimable build cache and ~29.72 GB reclaimable images, but these may overlap and include unrelated applications. Do not sum them or run a global prune. Review only project-owned stale artifacts and preserve deployed/rollback images. Never prune named database volumes.
