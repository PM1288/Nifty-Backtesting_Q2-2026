# Option Chain Data Model

## Live watcher tables

### `option_chain_snapshots`

Snapshot-level rows per captured timestamp.

Important fields used by the app:

- `id`
- `symbol`
- `captured_at`
- `trade_date`
- `expiry_date`
- `underlying_value`
- `atm_strike`
- `total_call_oi`
- `total_put_oi`
- `total_call_change_oi`
- `total_put_change_oi`
- `put_call_ratio`

### `option_chain_legs`

Per-strike option rows linked to one snapshot.

Important fields used by the app:

- `snapshot_id`
- `strike`
- `option_type`
- `last_price`
- `oi`
- `change_oi`
- `volume`
- `iv`
- `delta`
- `gamma`
- `theta`
- `vega`

## Derived runtime structures

The current implementation derives these in one batched store method rather than storing separate marts:

### `OptionChainAnalyticsResult`

- `tradeDate`
- `availableExpiries`
- `snapshot`
- `legs`
- `strikeWindow`
- `expiryContext`
- `equilibrium`
- `atmCombo`
- `diagnostics`

### Strike window

- `baseAtmStrike`
- `strikes`
- `tieBreak`

### Expiry context

- `selectedExpiry`
- `nextExpiry`
- `dteDays`
- `dteHours`
- `expiryProgressPct`
- `currentAtmStrike`
- `currentSpot`
- `spotToAtmDistance`
- `currentDominance`
- `lastCrossoverAt`

### Equilibrium series

Per timestamp:

- `capturedAt`
- `underlyingSpot`
- `atmStrike`
- `ceAggregateNorm`
- `peAggregateNorm`
- `spread`
- `equilibriumFlag`
- `crossoverFlag`

Latest strike snapshot:

- `strike`
- `ceClose`
- `ceNorm`
- `peClose`
- `peNorm`

### ATM combo series

Per timestamp:

- `capturedAt`
- `underlyingSpot`
- `atmStrike`
- `ceLtp`
- `peLtp`
- `atmCombo`
- `comboDelta`
- `comboDeltaPct`
- `comboDirection`
- `atmStrikeChanged`

### Diagnostics

- `freshnessMinutes`
- `strikeCount`
- `strikeWindowSize`
- `missingCeSeriesCount`
- `missingPeSeriesCount`
- `timestampDriftSeconds`
- `normalizationFallbackCount`
- `crossoverCount`
- `latestSnapshotAt`
- `latestPollOkAt`
- `cacheMode`
- `queryMode`

## Query pattern

The watcher store avoids per-strike N+1 fetches:

1. fetch latest snapshot row for the selected expiry
2. fetch latest legs for that snapshot
3. derive ATM and listed strike window from those legs
4. fetch all rows for the selected expiry/trade date/strike window in one query
5. fetch all dynamic-ATM combo rows in one query
6. align and compute derived series in memory once

## Indexing guidance

The live path benefits from indexes such as:

- `(symbol, expiry_date, captured_at desc)` on snapshots
- `(snapshot_id, strike, option_type)` on legs
- `(trade_date, expiry_date, captured_at)` on snapshots
- `(symbol, captured_at)` for spot/underlying retrieval
