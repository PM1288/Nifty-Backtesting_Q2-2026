# Home Scalper Progression dense matrix

Date: 12 September 2026

Route: `/n50/` (`Today` → both home lenses)

## Outcome

The existing read-only `Scalper progression · Monthly Open` homepage screener
now renders exactly one table row per stock. It no longer renders two tall route
rows or repeats the actual operand in every gate cell. The current/LTP value is
shown once; each gate shows status plus its exact reference value.

Both alternative routes remain simultaneously visible beneath grouped
`M−1 CLOSE` and `M−2 CLOSE` headers. Each retains the unchanged M, W0, W−1, D0,
1H, 15m and 5m comparisons. Score cells retain the canonical contiguous depth
and add pass/fail/pending counts so unavailable gates cannot resemble failures.

Rows default to 34 CSS pixels and the matrix is not assigned a fixed height.
All stock rows participate in normal page flow. Horizontal overflow is confined
to the matrix, with Stock and LTP frozen on the left and Best frozen on the
right. The default order is fully-qualified route, deepest contiguous
progression, most passed gates, fewest failures, newest observation and symbol.

## Interaction and evidence

- Dynamic filter chips: 7/7, 6/7, 5+/7, best route, waiting intraday and failure.
- Stock search, Comfortable/Compact/Ultra Compact density and one/both-route views.
- Persisted gate-column visibility using the existing browser preference boundary.
- Seven-dot best-route progression strip.
- CSV export includes raw actual/reference operands and exact state.
- Clicking a row opens a side evidence inspector with complete equations,
  absolute/percentage margins, source comparison labels and timestamps.
- Clicking the stock identity retains the existing homepage Quick View.
- Missing values remain pending/unavailable and are never converted to zero.

No API, collector, order permission, Monthly Open calculation, route identity
or Stock 360 calculation changed.

## Verification

Run from the canonical repository:

```bash
cd neon-stock-terminal/apps/web
npm run typecheck
npm test
npm run build

cd ../../..
bash scripts/verify/canonical-repository-gate.sh
```

Authenticated browser verification uses
`tools/playwright/today-scalper-progression.mjs` and protected credentials.

Deployed result: 16/16 browser checks pass at 1440px desktop and 390px mobile.
The live response rendered 210 unique stocks as 210 rows; compact rows measure
34px. Both grouped routes, contained horizontal scrolling, uncut vertical flow,
qualification-first ordering and the row inspector were verified. Runtime
evidence is stored outside Git at
`/tmp/today-scalper-progression-matrix-20260912`.

## Rollback

Revert the scoped UI commit and rebuild/recreate only `n50-dashboard`. No schema
or data rollback is required.
