Title: Readable monthly partitions for consolidated market data
Status: Accepted
Date: 2026-08-08

## Decision

Keep one logical table per dataset and partition high-volume timestamp data by calendar month. Physical child relations use `<parent>_YYYY_MM`, for example `bars_1m_2026_08`.

Partitioned parents are `bars_1m`, `quote_snapshots`, `option_greeks`, `depth_5_snapshots`, and the equity/index/futures/options OI snapshot tables. `bars_1d` remains a single indexed table because it is compact.

Do not create one table per stock. Stock selection remains a predicate on `exchange` and `symbol_token`, preserving simple comparison, retention, backup and backtesting queries.

## Migration safety

The operational migration copies all rows into partitioned parents, validates counts, rebinds dependent views and retains the originals in `migration_backup_20260808`. The collector is paused during the copy/swap and restarted after validation.

## Consequences

- Operators can inspect or maintain one month directly by its `YYYY_MM` child name.
- Queries against the parent continue working unchanged and benefit from partition pruning.
- Future partitions are created two months ahead by the collector using the same naming convention.
