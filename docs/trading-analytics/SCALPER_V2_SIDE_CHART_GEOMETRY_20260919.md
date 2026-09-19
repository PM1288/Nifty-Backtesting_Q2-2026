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
and authenticated production browser evidence are required before completion.

