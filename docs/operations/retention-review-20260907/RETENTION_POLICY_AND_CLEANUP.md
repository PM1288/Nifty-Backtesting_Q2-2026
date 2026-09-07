# Proposed retention policy and safe execution sequence

This is a proposal, not an executed purge. Retention must be based on event/session time, not file names alone or insertion time alone. Record the exact cutoff, timezone, rule version and holds in each job.

## Dataset contracts

| Data family | Proposed hot retention | Long-term representation / prerequisite |
| --- | --- | --- |
| Stock daily OHLCV | Permanent | Source, adjustment basis, trading date, symbol/ISIN identity, revision lineage |
| Index/sector/VIX daily data | Permanent | Canonical daily values and source precedence, not recalculated differently after purge |
| One-minute candles, raw minute and minute-derived features | 15 calendar days minimum | Also preserve seven completed exchange sessions and pinned open evaluation windows; holidays can require longer than 15 calendar days |
| Raw ticks / full depth / depth metrics | Conservative 15 days; recommend 72h separately | Validate minute/daily rollups and immutable execution evidence first; ticks are not minute candles |
| Option chains, Greeks, option OI / quotes | 30 days | Preserve selected-contract entry/exit evidence and referenced master metadata, not every old chain |
| Other intraday OI and quotes | 15 days where required for intraday; explicit owner-specific window | Daily aggregates only where already meaningful; retain original units and source timestamp |
| Paper trades, fills, events, fees, stops, targets, AI research and audit lineage | Preserve | These are authoritative business records, not disposable backtesting data |
| Published backtests / OIIS replay outputs | Latest/pinned/approved comparison results | Retire superseded batches explicitly; retain compact run manifest, version, metrics and deletion provenance |
| Experimental/dummy runs | Short TTL after owner confirmation | Classification must be explicit, not inferred from table/schema name |
| Instrument master / sector/universe/lot membership | Permanent effective-dated compact history | Deduplicate unchanged snapshots, preserve contract IDs, lot changes, listings and historical joins |
| API request / operational debug payloads | Proposed 7–15 days raw, 90 days compact aggregates | Error/security/audit record obligations and incident holds reviewed separately; redact secrets |
| Migration backup copies | Until replacement recovery verified | Checksummed export, restore trial and owner sign-off before expiry |
| WAL/backups | Recovery-policy owned | Never delete PostgreSQL files manually; verify backup chain and restore objective |

The user requested options older than a month removed; this proposal expresses the window as **30 days**, not an unspecified calendar month. Confirm if calendar-month semantics are intended. The audit cutoff example used IST date 2026-09-07: minute cutoff **2026-08-22 18:30 UTC** (23 August 00:00 IST), option cutoff **2026-08-07 18:30 UTC** (8 August 00:00 IST). A deployment must compute fresh cutoffs rather than copy these dates.

## P0 deletion blockers

### Daily history still depends on minute bars

`integration.v_prev_index_daily` directly aggregates minute bars. `integration.v_index_daily_history` uses official market-activity data with a minute-derived fallback. `integration.v_source_index_1m`, `integration.v_source_security_1m`, `bar_1m_derived` and `bar_1m_official` also depend on minute data.

Sources: `services/nse_intraday_intelligence/sql/006_compatibility_views.sql` and `sql/030_views.sql` under that service. Preserve the existing session-close aggregation, official-source preference, exchange-calendar handling and fallback provenance in a materialized daily store. An official EOD close and the last intraday price are not necessarily interchangeable. Validate before changing the views.

Current daily coverage: `bars_1d` has 217,075 NSE rows / 276 tokens and 766 BSE rows / one token; NSE coverage starts January 2023. `nse.fact_eod_prices` covers 4,609 symbols from March 2021 through September 3. These aggregate counts do **not** prove every tracked stock/session exists. Run an instrument × exchange-session anti-join; compare daily OHLCV values and adjustment/source basis for every period proposed for deletion.

### Paper and horizon evidence

A 30-session open trade can outlive the proposed minute retention. Persist immutable entry/fill, target/stop first-hit times, MFE/MAE timestamps, path maturity and source references before raw expiry. Daily bars cannot later determine intraday target-before-stop order. Preserve pinned raw windows until those facts are finalized or explicitly mark reconstruction unavailable. Do not turn deleted evidence into zero or “not hit.”

### Backtests are not all dummy

`nse_app` has 92 published batches. OIIS replay metadata includes five RUNNING rows dating from August 7, seven FAILED and 77 SUCCEEDED. Reconcile worker leases and terminal status before retirement; do not delete a RUNNING row merely because it is old. Prevent scheduled producers from recreating purged historical outputs. Keep original OIIS, live OIIS, OISS and Paper identities separate.

## Exact first shortlist

1. `research.security_minute_technical`: all timestamps February 2, 2015–August 6, 2025. This table contains derived technical fields, not the underlying daily OHLCV store. 43.31 GiB. No declared FK/view dependency or tracked canonical consumer found, but external consumers are not ruled out.
2. `migration_backup_20260808` tables: `bars_1m_legacy_20260808`, `oi_snapshots_index_legacy_20260808`, `oi_snapshots_options_legacy_20260808`, `quote_snapshots_legacy_20260808`, `oi_snapshots_futures_legacy_20260808`, `oi_snapshots_equity_legacy_20260808`, `option_greeks_legacy_20260808`. Resolve actual names against the attached catalog before action; 7.24 GiB collectively. Their purpose is migration recovery, not confirmed duplicates safe to discard immediately.
3. `public.bars_1m_2026_06` and `public.bars_1m_2026_07`: measured combined 2.05 GiB. Require the daily/consumer gates above.

Never use schema-wide CASCADE, truncate a live parent, or delete by a broad name pattern. Every authorized batch needs resolved OIDs, bounds, measured bytes and dependencies from a fresh catalog.

## Index disposition

Two matching-key candidate groups were found: ordinary `paper_trading.trade_events_aggregate_idx` overlaps protected `trade_events_aggregate_id_sequence_key`; ordinary `public.equilibrium_strike_snapshot_idx` overlaps the protected primary key. Combined ordinary-index size is only approximately 0.18 MiB. Check ordering, predicates, included columns, uniqueness, dependencies and actual workload before a concurrent drop.

Many large indexes report zero scans, but statistics-window/reset history is unknown. This is not sufficient evidence to drop them. Preserve primary, unique, replica-identity and required lookup/FK-support indexes. Dropping expired partitions already drops their indexes; do not double-count. Measure retained-partition query plans before considering BRIN or narrower B-tree replacements. [PostgreSQL statistics interpretation](https://www.postgresql.org/docs/16/monitoring-stats.html).

## Required retention implementation

1. One versioned registry for every producer/table: owner, event-time field, granularity, TTL, consumers, daily rollup, holds, partition strategy and deletion method. Unknown classifications default to retain/review.
2. Strict read-only planning command: no partition creation, ANALYZE or cleanup side effects. It must report eligible partitions and estimated/exact counts distinctly.
3. Separate partition provisioning from retention. Prefer daily partitions for high-volume 15/30-day families; avoid rewriting all retained history solely to achieve this.
4. Advisory-lock single-flight execution, per-table checkpoints and bounded batches. Use lock/statement timeouts and stop on query latency, replication lag, WAL pressure or free-space guard breaches.
5. Correct boundary-month expiry: complete partitions first; bounded boundary-row expiry or validated partition replacement off-hours. Stop inserts/backfills from repopulating old windows unless explicitly pinned.
6. Durable job summary: policy/build, start/end, cutoff, eligible/deleted rows, dropped partitions, bytes before/after, vacuum-reusable vs OS-reclaimed bytes, failures and next retry. Emit one truthful terminal status, not “done” after failure.
7. Keep alerts in operations channels. No WhatsApp error/debug spam. Notify only threshold breach/recovery through existing governed operations mechanisms.
8. Target autovacuum/analyze settings by churn and size; observe long transactions. Normal vacuum enables reuse. Do not blanket `VACUUM FULL`, rebuild all indexes or kill unrelated processes.

## Approved-execution checklist (future phase)

- Owner signs exact objects/cutoffs and protected exceptions.
- Recoverable backup/export lives outside the same threatened volume; checksums and an isolated restore test pass. `archive_mode=off` and no slots do not establish a backup strategy.
- Daily completeness/parity, open-trade evidence, FK/view/application dependencies and pinned runs pass.
- Baseline health and lightweight key-chart/API values saved; purge in a maintenance window with immediate stop conditions.
- Execute the smallest whole-object batch first, without CASCADE, then measure disk/DB/WAL/latency and retest.
- Keep a signed deletion manifest and archive locator. SQL rollback cannot recover a committed drop; restoration requires the tested backup.
- Only proceed to boundary partitions and superseded backtests after first-batch validation.

No destructive SQL is shipped in this audit: the missing coverage and restoration checks make an executable bulk-purge script premature.
