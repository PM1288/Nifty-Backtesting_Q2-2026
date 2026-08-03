# Option Equilibrium

## Final formula

The current app uses the same conceptual formula as the legacy equilibrium code path, but it is now computed from the watcher snapshot tables instead of the stale legacy service tables.

## Strike universe

For the selected expiry:

1. take the latest stored underlying spot
2. choose the nearest listed ATM strike from actual listed strikes
3. if spot is exactly between two listed strikes, choose the **lower strike**
4. use the listed ATM ± 3 strike window inclusive

## Per-strike normalization

For each strike and option type, use the current trade date intraday series:

`norm = 100 * (ltp - min_day_ltp) / (max_day_ltp - min_day_ltp)`

Fallback:

- if `max_day_ltp <= min_day_ltp`, use `50`
- this is counted in diagnostics as a normalization fallback

## Aggregate basket

At each timestamp:

- CE basket = arithmetic mean of all available normalized CE series in the strike window
- PE basket = arithmetic mean of all available normalized PE series in the strike window

The app does **not** currently apply weighting by OI, distance from ATM, or volume.

## Equilibrium / crossover definition

Let:

- `spread = ceAggregateNorm - peAggregateNorm`
- `epsilon = 2`

Flags:

- `equilibriumFlag = abs(spread) <= epsilon`
- `crossoverFlag = sign(spread)` changed vs the previous aligned point

The chart highlights timestamps where either flag is true.

## Dominance

- CE dominant: `spread > epsilon`
- PE dominant: `spread < -epsilon`
- Near equilibrium: `abs(spread) <= epsilon`

## Chart contract

- title: `Option Equilibrium Around ATM`
- x-axis: `Time`
- y-axis: `Normalized Value (0-100)`
- CE line: green
- PE line: red
- equilibrium / crossover marker: gold

## Why this method was kept

The legacy repo/Grafana implementation already used normalized per-strike series and mean aggregation. That makes the new app behavior:

- explainable
- consistent with prior operator intuition
- deterministic from the available data

The main migration was the **data source**, not the conceptual formula.
