# Implementation — RETENTION-20260907.1

Scope: implement the audit findings in the canonical repository without blind deletion. This record distinguishes delivered controls from gated operations; it is not an all-stack completion certificate.

## Implemented controls

- Collector: explicit 16-family retention registry including previously omitted ticks/depth/SmartAPI chains; actual catalog partition bounds; bounded 10,000-row batches with tableoid+ctid correctness; 8-second statements, 1-second locks and 90-second run budget; per-table transaction and rollback-correct counters.
- Unknown/missing/expired evidence gates fail closed. Required verification: daily coverage, paper evidence, dependencies and restore; `retain_from` can extend retention for seven-session and open-position holds. No auto-approvals are inserted.
- Read-only planning never provisions partitions or runs destructive statements. CLI `--db-cleanup-plan`; operator script defaults to plan and uses the canonical Compose project. `--apply` is separately explicit and still gated.
- Advisory lock has a dedicated session and reliable release, including callback failure; it does not occupy the only slot in a size-one pool.
- Collector failures no longer also log success. Successful table changes and their cutoffs/counts are recorded transactionally in `operations.retention_result`. Blocked/error information remains in local structured logs, not WhatsApp.
- Runtime migration errors fail closed instead of continuing against an unverified schema.
- NSE intraday: removed overriding duplicate cleanup implementation; bounded shared-gate cleanup only for five minute families. Daily summaries/beta records are no longer indiscriminately purged. Explicit expired-replay override prevents ordinary jobs regenerating old raw history.
- Additive `minute_daily_archive` and per-session OHLCV/source/count archive function. Original official daily stores are untouched. Index view cutover checks exact retained legacy closes before switching to archive plus current-session source, preserving official EOD precedence.
- Daily scheduled NSE cleanup archives yesterday before considering deletion. Historical bootstrap is an explicit separate script; archive failure aborts cleanup.
- Confirmed crash path: Express 4 unhandled rejection in OIIS dashboard. Eight OIIS handlers now forward errors; dashboard fan-out is bounded at two. Snapshot builds share bounded FIFO admission with queue expiry and deduplication. Pool exhaustion returns retryable 503; errors/slow logs no longer dump SQL/full exception objects in these boundaries.
- OISS nested main/complementary landmarks removed, KPI text contrast improved, missing final lots show unavailable rather than fabricated zero; no score/strategy changes.

## Operator procedure

1. Deploy only tested pushed master, preserving rollback images. Do not change unrelated services.
2. Apply additive SQL `scripts/sql/retention_safety_20260907.sql`, then `scripts/sql/daily_archive_20260907.sql` with ON_ERROR_STOP. Both transactions are rerunnable and grant no deletion approvals.
3. Bootstrap actual retained completed sessions using `scripts/audit/archive_daily_sessions.py --start YYYY-MM-DD --end YYYY-MM-DD --output output/retention-implementation/daily-archive.json`. Each session commits independently, with timeout and failure stop. Raw data stays intact.
4. Verify daily coverage and execute `scripts/sql/index_daily_cutover_20260907.sql` only after archive parity. Do not use it as evidence that every stock/session is complete: its automatic gate checks the three canonical indices.
5. Provide backup destination outside the database volume, restore-test shortlisted objects and preserve paper path facts. Populate short-lived per-relation evidence gates only after genuine verification. No example blanket approval SQL is supplied.
6. Plan, review exact cutoffs/holds, then execute a bounded approved cleanup. Measure operating-system bytes separately from reusable PostgreSQL space. Committed deletion recovery requires the verified archive.

Runtime collector config is an ignored/protected deployment file, not a Git source artifact. Requested scoped values: minute/tick/depth=15 days, options/quotes=30 days, hourly overrides/cap=0, cadence=30 minutes. Evidence gates remain authoritative even when configuration permits expiry.

## Explicitly not yet completed

- Restore-tested off-volume backup destination and production deletion approval gates; no space recovery claimed without measured deletion.
- Full per-stock/session anti-join, immutable paper path preservation and seven-exchange-session hold automation. Currently absent approvals block deletion safely.
- Published backtest retirement / stale run lease reconciliation, effective-dated master compaction, research-table disposal, duplicate index removal and off-host backup drills.
- Daily-partition conversion, all producer watermarks, per-table autovacuum tuning, full slow-query materialization, multi-user load certification and complete chart/export parity.
- Cash ingestion DNS and Greek source-key repairs; these are separate unresolved source defects, not fixed by retention.

Do not call this “all changes complete.” The archive and guarded cleanup support safe staged implementation; the remaining evidence/backup gates and broader performance work are material.

## Tests and rollback

API 173 tests passed; web 78 tests passed in initial run, final rerun recorded at handoff. Go fixture verifies unapproved/expired gates, dry-run nonmutation, partition+boundary expiry with repeated ctid values, rerun idempotency and lock release. Daily fixture verifies refused premature cutover, exact OHLCV, official-source precedence and daily/prior-close survival after raw removal. Tests use a disposable PostgreSQL container, never production tables.

Rollback runtime images independently; preserve new archive/operations tables. Do not revert to destructive legacy cleanup while reducing TTL. Retain all original raw data until cutover acceptance and backup verification. No live/paper permission or notification destination changes.
