# Database retention, reliability and dashboard audit — 7 September 2026

## Verdict

The database is **377.84 GiB (405,708,561,431 bytes)**, not approximately 300 GB. The principal issue is unbounded high-frequency retention, not daily stock history. This is a read-only review: **no tables, rows, indexes, volumes or caches were deleted; no production configuration was changed.**

There is also a separate P0 reliability problem. Broad sequential browser checks encountered Prisma connection-pool timeouts and HTTP 502s; the dashboard process restarted during the observation window. Broad testing was stopped. It subsequently reported healthy. Cleanup alone cannot certify dashboard reliability.

## Evidence and scope

Canonical source: `/home/novius2/trading-stack`, audit branch `audit/retention-reliability-20260907`, starting commit `9e6b268`. Database catalog captured at 18:29 UTC. Evidence: `/home/novius2/trading-stack/output/retention-review-20260907/`.

The audit covers 509 physical database relations, index definitions, declared dependencies, retention implementations/runtime settings, sampled query statistics, service health, 55 fixed desktop routes and ten mobile page families. It is not a certification of every external consumer, every chart value, backup restoration or all possible route states. Parameterized routes and aliases are inventoried but not all independently exercised.

| Largest physical objects | GiB, including indexes | Assessment |
| --- | ---: | --- |
| August market ticks | 141.54 | Missing cleanup coverage; partial month expires under 15-day policy |
| September market ticks | 52.12 | Extremely expensive ingestion; distinguish ticks from minute candles |
| research.security_minute_technical | 43.31 | Entire retained timestamp range is old: February 2015–August 2025 |
| August depth_5_metrics | 21.82 | Missing cleanup coverage |
| oiis.decision_snapshot | ~17.0 | Research replay lineage; not automatically disposable |
| September quote snapshots | 12.47 | Boundary-month retention mismatch |
| September option OI snapshots | 12.19 | Observation-age retention needed |
| September depth_5_metrics | 7.70 | Missing cleanup coverage |
| Migration backup schema, all seven tables | 7.24 | Recovery copies; replacement/restore verification required |
| Instrument-master snapshots | 6.11 | Repeated master capture; retain effective-dated historical identities |
| nse_app.backtest_daily_equity | 5.18 | Published analytical results, not proven dummy data |
| symbol_perf_snapshot | 5.17 | Review consumer horizon and incremental snapshot policy |

Daily `public.bars_1d` occupies only approximately **48.85 MiB**. `nse.fact_eod_prices` occupies approximately 0.81 GiB. Preserve both source meanings and adjustment conventions. Index storage is **112.43 GiB already included in the database/table totals**; never add it again as separate savings.

## Space recovery decision

| Candidate | Potential | Required safety gates / confidence |
| --- | ---: | --- |
| Old research minute indicators | 43.31 GiB whole relation | No declared FK/view dependency found; no tracked canonical consumer found. External/dynamic consumers and owner approval remain unverified. Export/restore and ownership checks first. |
| Seven August migration recovery tables | 7.24 GiB whole schema | Verify migration parity, required daily coverage and replacement recovery copy before retirement. Never use CASCADE. |
| Above two groups combined | **50.55 GiB** | Strongest initial shortlist, **not unconditional approval to delete** |
| June/July minute partitions >100 MiB each | 2.05 GiB measured | Blocked until daily-view migration and paper/horizon evidence preservation pass |
| Conservative 15-day high-frequency / 30-day option and quote audit | **~145.57 GiB logical estimate** | Includes the 43.31 GiB research relation. Planner estimates, not measured reclaimable filesystem bytes; do not add to preceding rows. |
| Optional 72-hour raw ticks/depth metrics | **163.36 GiB entire August partitions** | Additional policy decision; only after validated minute/daily rollups. Replaces partial-August estimates, not additive to them. |
| Published nse_app backtest tables | 8.35 GiB total footprint | Retire only explicitly superseded/unpinned batches; 92 published batches exist. Not all 8.35 GiB is approved waste. |
| Two duplicate-key index candidates | ~0.18 MiB | Verify constraints/plans first. This is negligible, not a solution to database growth. |
| Five named test databases | ~54 MiB total | Confirm ownership/no running tests; very low priority |

The estimated 145.57 GiB uses catalog/planner row fractions over whitelisted physical relations larger than 100 MiB. Statistics can be stale; fractions can overestimate old content. It is not an exact count, not comprehensive small-table coverage and not a promise of operating-system space recovery.

Deleting rows usually makes space reusable inside PostgreSQL after vacuum; it does not automatically shrink the files. Dropping eligible partitions/whole retired tables releases their files after transactional completion. Detaching alone retains data/files. Rewriting a boundary partition or `VACUUM FULL` needs workspace and disruptive locks; do not run a blanket production rewrite. [PostgreSQL vacuum guidance](https://www.postgresql.org/docs/16/routine-vacuuming.html), [partition maintenance](https://www.postgresql.org/docs/16/ddl-partitioning.html).

## Why this happened

1. `internal/store/cleanup.go` creates future partitions for market ticks, depth metrics and SmartAPI option-chain snapshots but does not clean those families afterward.
2. Most partition cleanup drops only months completely before the cutoff month. It does not enforce the expired portion of the boundary month. Runtime quote/OI settings say five hours, yet current-month data can survive.
3. Runtime minute/Greek retention is 90 days, not the requested 15/30. The separate NSE pipeline has 31-day raw and 730-day minute-feature retention. Policies disagree.
4. The NSE pipeline defines `retention_cleanup` twice; the later definition overrides the earlier one. Its large range deletes lack bounded batch budgets.
5. Existing dry-run is not strictly read-only: future partition creation still runs. The audit did **not** invoke that command.
6. Cleanup logs can emit `retention_cleanup_failed` followed by `retention_cleanup_done`. Counts mix partitions and rows. A sample of 128 done messages is not proof of policy enforcement.
7. `cutoffUTC` constructs local dates at UTC midnight rather than converting actual IST midnight, introducing a 5h30m boundary error.
8. There is no consistently enforced producer watermark, consumer hold, verified daily-rollup gate, reclaim measurement or durable per-table retention manifest.

## Read next

- [Retention policy and staged cleanup](RETENTION_POLICY_AND_CLEANUP.md)
- [Reliability and dashboard findings](RELIABILITY_AND_DASHBOARDS.md)
- [Evidence, reruns and acceptance](VALIDATION_AND_RERUN.md)

**Recommended order:** stabilize API failure isolation → preserve daily/evidence dependencies → repair retention and producer horizons → verify backups → approve exact cleanup manifest → staged expiry/reclaim → repeat numerical and visual regression. No paper/live execution settings should change as part of this work.
