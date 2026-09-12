# Home MWHD Bull and Bear ranks — 12 September 2026

## Outcome

The existing Home `SCALPER PROGRESSION · MWHD RANK` surface is now a compact,
two-column candidate board. The left half is `MWHD-BULL RANK`; the right half
is `MWHD-BEAR RANK`. Every available stock receives both independently sorted
ranks.

The primary tables show only rank, weighted score and pass/fail/pending ticks.
They do not repeat LTP or reference prices in every gate. Selecting a row opens
the existing evidence drawer, which now exposes complete Bull and Bear
arithmetic, source values, route sufficiency, weights and timestamps. CSV export
retains both operands and the comparison operator for every gate.

Each half shows exactly the top 15 ranked stocks before its own vertical
scrollbar. Remaining stocks stay in rank order inside that board. Every stock
identity carries two explicit direction tags, `BULL #n` and `BEAR #n`; the
Bear table's primary rank column is its independent Bear order and never reuses
the Bull row number.

The visible gate columns are ordered `M−2`, `M−1`, `W0`, `W−1`, `D0`, `1H`,
`15m`, `5m`. This is presentation order only: the M−2 calculation continues to
require the M−1 sufficiency gate before M−2 and the lower-timeframe gates can
form a complete route.

## Calculation contract

`MWHD-BULL` is unchanged:

```text
actual > reference
```

`MWHD-BEAR` is the exact inverse over the same observations:

```text
actual < reference
```

Both directions preserve the existing two alternative monthly routes:

- M−1 route: current-month open compared with previous-month close.
- M−2 route: the M−1 sufficiency gate and current-month open compared with the
  two-months-ago close.

Both then use W0, W−1, D0, 1H, 15m and 5m confirmations. Weights remain M−1=1,
M−2=1, W0=2, W−1=3, D0=4, 1H=5, 15m=6 and 5m=7. Missing values remain
pending, never pass, fail or zero.

Candidate stock identity is highlighted only when an entire route is complete:
green in the Bull board and red in the Bear board. A single passing gate cannot
colour the stock identity.

## Shared surfaces

The existing shared MWHD badge now shows both Bull and Bear ranks in Stock 360,
OIIS, Scalper V1, Scalper V2, Trade Observations and Trade Log. No underlying
market data, collector, monthly strategy, signal rule, order permission or
historical record was changed.

## Validation

Focused fixtures cover bullish parity, exact bearish inversion, M−2 requiring
M−1 sufficiency, unchanged weights, missingness and independent ranking. The
authenticated Home browser regression verifies the two half-width boards,
tick-only cells, full arithmetic drawer, contained horizontal overflow and
mobile stacking.
