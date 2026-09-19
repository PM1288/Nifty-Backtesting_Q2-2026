# Scalper V2 side OI chart geometry — 19 September 2026

## Defect

The right-side OI and Change-in-OI strike charts were each rendered in a narrow
320–380px column, but their ECharts grid added fixed 62px left, 58px right, 48px
top and 52px bottom gutters. Axis labels were outside that fixed grid, so the
fixed values did not represent the true minimum label footprint. Card padding,
an 8px inter-chart gap and a 12px workspace gap further reduced the visible data
area.

## Repair

- Both vertical strike charts now use `containLabel: true`, allowing ECharts to
  reserve only the measured label space.
- Outer grid insets are 2px left/right/bottom and 32px top for the compact
  three-series legend.
- The redundant `Strike` axis title/name gap is removed; numerical strike ticks
  remain visible.
- Legend symbols, text and item gaps are compacted without removing CE, PE or
  PE-minus-CE identity.
- Side-card padding is reduced from 6px to 2px, the gap between the two cards
  from 8px to 4px, and the underlying-to-side-column gap from 12px to 4px.

The charts remain in their existing side column. Both value axes, exact strike
categories, underlying nearest-strike marker, signed Change-in-OI, and
PE-minus-CE difference lines are preserved. No market data, OI baseline,
strategy, order or export behavior changes.

## Automated validation

The focused analytical test asserts the label-aware grid and 2px insets in
addition to the existing exact difference, signed-value, missingness, axis and
NIFTY-guide contracts. Full repository web/API tests, builds, preservation gate
and authenticated production browser evidence were completed:

- Web typecheck, 220/220 tests and production build: PASS.
- API typecheck, 252/252 tests and build: PASS.
- Canonical repository preservation gate: PASS.
- Authenticated production Playwright: 14/14 checks PASS with no page errors.
- Each 380px side card exposes a 374px chart host: 3px inset per side and 6px
  total non-chart width, meeting the near-edge browser assertion.
- Both chart hosts are 332.61px high inside 358px cards; the remaining height
  is the compact visible title/legend region rather than an unexplained plot
  margin.
- The side column is separated from the adjacent price-chart area by 4px.
- Live evidence and screenshots:
  `/home/novius2/NIFTY50/evidence/scalper-v2-side-margin-after-20260919-production01/`.

## Release

- Application commit: `a0facdf` (`fix: expand Scalper V2 side chart plots`).
- Feature branch and `master` were pushed.
- Rollback tag: `before-scalper-v2-side-chart-geometry-20260919`.
- The approved dashboard deployment recreated only `n50-dashboard`.
- Deployed image:
  `sha256:d5c5e3c059747768abfe268896013f06fdd93fed36357f25463025dd357fe93a`.
- Live container `49c72f97555f...` is healthy and the route returns HTTP 200.
- Live entry asset: `/n50/assets/index-BRExCwJn.js`.
- No strategy, OI calculation, API, database, collector or order behavior was
  changed.
