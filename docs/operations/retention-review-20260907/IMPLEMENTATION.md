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
- Published backtest retirement / stale run lease reconciliation, effective-dated master compaction, research-table disposal and off-host backup drills.
- Daily-partition conversion, all producer watermarks, per-table autovacuum tuning, full slow-query materialization, multi-user load certification and complete chart/export parity.
- Cash ingestion DNS and Greek source-key repairs; these are separate unresolved source defects, not fixed by retention.

Do not call this “all changes complete.” The archive and guarded cleanup support safe staged implementation; the remaining evidence/backup gates and broader performance work are material.

## Tests and rollback

API 173 tests passed; web 78 tests passed in initial run, final rerun recorded at handoff. Go fixture verifies unapproved/expired gates, dry-run nonmutation, partition+boundary expiry with repeated ctid values, rerun idempotency and lock release. Daily fixture verifies refused premature cutover, exact OHLCV, official-source precedence and daily/prior-close survival after raw removal. Tests use a disposable PostgreSQL container, never production tables.

Rollback runtime images independently; preserve new archive/operations tables. Do not revert to destructive legacy cleanup while reducing TTL. Retain all original raw data until cutover acceptance and backup verification. No live/paper permission or notification destination changes.

## Deployed acceptance — 7 September UTC / 8 September IST

Pushed application/control commits: `341dd78`, `75126b4`, `1f83cfb`; deployed-column compatibility fix `74196d0`; final OISS contrast fix `e6be7e8`; guarded redundant-index operation `7c7b0d5`. All merged to pushed master before the respective runtime operation. Audit/test branches remain available; production was built only from canonical master.

| Service | Deployed image digest | Acceptance |
| --- | --- | --- |
| n50-dashboard | `sha256:373a62f4e69034537e965a66867f6b99d45e9c8349ce6644c75b3893214c9da1` | healthy, restart count zero after final deployment |
| collector | `sha256:97c77022ed692f5026b4d235cad28ce07c7e02a799d26f690c3e667373a8d071` | healthy, restart count zero; all unverified relations held |
| NSE intraday API / scheduler | `sha256:b8f0c179a94cc15d46ae250387b929d8039d62fe568bfbb8c97507a81846d447` | running, restart counts zero; API /health 200; deployed cleanup returns COMPLETED_WITH_HOLDS |
| NSE analytics worker | `sha256:6c13b06b730256f5009b819d92c588ce0ae41d30ba8a77f1c70cf008bf004453` | previously unhealthy, now healthy; actual health CLI passes |

Only those five containers were recreated. PostgreSQL, paper engines and unrelated services were not restarted. Root Compose owns dashboard/collector; the existing base+core Compose manifests own the NSE services. Both manifest families now have aligned minute defaults. The first root intraday image build failed because its context did not match its Dockerfile; this was corrected in `1f83cfb` before deployment. No failed-build image was deployed.

### Actual database work

- Installed safety registry/result tables and additive daily archive function. **Zero production retention approvals and zero deletion-result records. No historical rows/tables were deleted.**
- Archived **7,697 daily rows over 41 nonempty observed sessions**, June 1–September 7, representing **2,639,317 retained regular-session minute bars**. Archive size at measurement **1,613,824 bytes**. These counts reflect actual available data, not a claim that all calendar/exchange sessions or every tracked stock were covered.
- Bootstrap searched May 11–September 6, then September 7 separately. May source rows were absent in the current retained table; zero-row dates are explicitly recorded in the JSON. Do not interpret a successful empty archive call as coverage.
- Midnight IST advanced during work: the parity guard correctly rejected a missing September 7 archive. After that session was archived, the first view replacement attempt also safely rolled back because the deployed view had additional `close/high/low` columns absent from the older compatibility SQL. The corrected script preserves **all six columns**, validates close/high/low parity, and committed successfully. Final daily-history view returns 4,011 rows; prior-index view returns 123 rows.
- Removed only `paper_trading.trade_events_aggregate_idx` and `public.equilibrium_strike_snapshot_idx`, after rechecking exact keys, validity, uniqueness and constraints. Combined measured size **188,416 bytes (184 KiB)**. Their protected unique/primary indexes remain. Recreation DDL is in `scripts/sql/redundant_indexes_20260907.sql`.
- Final database size **405,999,164,439 bytes (~378.1 GiB)**. Continuing ingestion and the added archive mean the total did not shrink. **No 50/145 GiB recovery claim is made.**

### Validation results

- API **173/173**, web **78/78**; both typechecks and builds passed. Final CSS-only contrast amendment also passed the production image build and deployed axe checks.
- Go isolated PostgreSQL retention fixture: six subtests passed. Daily archive fixture: four subtests passed, rerun with the deployed six-column contract. Go store/collector suites passed; Python isolated gated-retention fixture **1/1**.
- Deployed targeted HTTP checks: header **200 / 56 ms**, OIIS dashboard for September 7 **200 / 94 ms**, paper notifications **200 / 45 ms**. These are single warm observations, not a controlled before/after benchmark or load certification.
- OISS at **1440×900 and 390×900**: exactly one main landmark, no page overflow, no JavaScript errors and **zero axe violations** after the final contrast fix.
- Existing cash/OI chart preservation suite **28/28** against the deployed application after index cutover. CSV/value/source assertions remain in that harness. This is not all-route or three-user UAT.
- Actual deployed NSE retention call archived yesterday and returned **five BLOCKED_UNVERIFIED families with zero rows deleted**. Collector read-only plan also showed zero deletion and refused unverified families.

### Evidence and commands

`/home/novius2/trading-stack/output/retention-implementation/` contains daily-archive JSON, September 7 continuation, original index-view DDL and final browser JSON/screenshots. Cash/OI evidence: `output/playwright/cash-oi-20260907/` (latest rerun overwrites that harness's prior screenshots).

```bash
# Build/deploy scope used; never add --remove-orphans.
docker compose -p trading-stack-novius2 build n50-dashboard collector
docker compose -p trading-stack-novius2 up -d --no-deps n50-dashboard collector
docker compose --env-file .env -p trading-stack-novius2 -f compose/compose.base.yml -f compose/compose.core.yml build nse-intraday-api nse-analytics-worker
docker compose --env-file .env -p trading-stack-novius2 -f compose/compose.base.yml -f compose/compose.core.yml up -d --no-deps nse-intraday-api nse-intraday-scheduler nse-analytics-worker
# Read-only operator plan:
bash scripts/db_cleanup.sh
```

Rollback image tags: `trading-stack-n50-dashboard:before-retention-20260907`, `trading-stack-collector:before-retention-20260907`, `trading-stack-nse-intraday-intelligence:before-retention-20260907`, `trading-stack-nse-analytics-worker:before-retention-20260907`. Preserve these until acceptance. View rollback is `output/retention-implementation/index-views-before.sql`; it is safe only while original minute data remains. If reverting collector code, disable cleanup first or restore its old 90-day/legacy configuration: never combine legacy ungated cleanup with shortened TTL.

### Remaining blockers and caveats

An off-volume backup destination was requested from the user and is not yet confirmed. Large research/migration/partition disposal remains blocked, along with full paper path and daily-session verification. Other pending items in the preceding list remain material; this is **partial implementation, not completion of every audit recommendation**. The production build also reports 16 dependency vulnerability advisories (including one critical); they were not force-upgraded in this operational change and require a separate compatibility/security remediation pass. Institutional Flow's heading-order finding and broader chart/load regression are not signed off.
