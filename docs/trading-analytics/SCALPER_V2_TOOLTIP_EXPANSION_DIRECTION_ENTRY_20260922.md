# Scalper V2 compact tooltips, chart expansion and direction/OI entry reference

Date: 22 September 2026
Scope: existing `view=scalper_v2` only

## Outcome

The four compact strike-side charts and the three compact timestamp charts now
retain their exact hover evidence in a small, confined tooltip. The tooltip uses
2x4 px padding, an 8 px font, a 190 px maximum width and a 112 px maximum height,
with local scrolling for exceptional content. It cannot expand across the whole
chart.

Every one of those seven charts has an accessible expand control. Expansion is
a fixed viewport dialog with larger axes, legend and tooltip text. Only the
selected expanded ECharts instance is mounted; closing it disposes that instance
instead of retaining seven duplicate full-size canvases.

Strike Structure and Strike-by-Time Positioning have click/keyboard `i` controls.
Their dialogs disclose the exact current implementation:

- Strike Structure: current OI, comparable signed Delta OI, return from the
  first observed session premium, rank-before-filter behavior, and the four
  mechanical price/OI regimes.
- Positioning heatmap: signed Delta-OI share, clamped premium component,
  premium-signed volume share, depth imbalance and the arithmetic mean across
  available components. Missing components are omitted, not converted to zero.

## Independent direction/OI entry reference

The existing `FNO_PAIRED_EMA9_POSITION_BODY70_NEXT_OPEN_V7` calculation is not
changed. A second research-only rule is added as
`SCALPER_V2_OI_DIRECTION_EMA_CROSS_V1`.

For each retained chain snapshot:

```text
oiDifference = cumulative PE OI - cumulative CE OI
deltaPressure = cumulative PE Delta OI - cumulative CE Delta OI
dayOpenDeltaPressure = first finite deltaPressure in the selected session
```

A CALL entry reference requires all of:

1. the OI difference freshly crosses from `<= 0` to `> 0`;
2. Delta-OI pressure is above its session-open observation and rising;
3. the latest completed underlying close at or before that snapshot freshly
   crosses from at/below EMA9 to above EMA9;
4. that underlying close is above at least one available named reference from
   Today Open, Previous Day Close or Previous Day High.

A PUT is the exact inverse: fresh positive-to-negative OI crossover, falling
Delta-OI pressure below its opening observation, completed-bar close crossing
below EMA9, and price below at least one named reference.

The option premium is the exact selected CE/PE completed close with the same bar
end as the underlying setup. If it is absent the event state is
`OPTION_PRICE_UNAVAILABLE`; no nearest or future premium is substituted. These
are retrospective/research references, not recorded fills or order permission.

## Performance boundaries

- Chart options and the direction rule are memoized by actual price/OI/reference
  revisions, not cursor state.
- ECharts pointer propagation remains requestAnimationFrame-coalesced.
- Expansion mounts one additional chart only while open.
- Pointer movement performs no trading-analytics or option-chain request.

## Validation

- Web unit suite: 260/260 passed, including three new direction-rule fixtures.
- Web production typecheck/build: passed.
- Authenticated local Chromium: 9/9 passed at 1920x1080, covering all seven
  expand controls, viewport geometry, both click calculation dialogs, compact
  tooltip visibility, zero chart-data requests during hover and no page errors.
- Local evidence:
  `/tmp/scalper-v2-tooltip-expand-local-20260922-rerun/`.

API checks, canonical gate, deployed browser evidence and release identity are
recorded in `AGENT_HANDOFF.md` after release. No database migration is required.
