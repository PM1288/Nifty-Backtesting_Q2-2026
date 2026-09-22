# Scalper V2 cumulative bands and compact range chart

Date: 22 September 2026  
Route: `/n50/strategy/trading-analytics?view=scalper_v2`

## Changes

### Cumulative OI and Delta OI history

Both history cards preserve their primary calculations:

- `cumulative PE OI - cumulative CE OI`
- `cumulative PE Delta OI - cumulative CE Delta OI`

The primary values remain on their own right-side axis. Their session-relative
line colour remains low red, first observed/open black and high green without
changing the plotted number.

The independent secondary axis now renders:

- CE as a thin dotted yellow line at 70% opacity;
- PE as a thin dotted blue line at 70% opacity;
- a 30%-opacity green band where PE is above CE;
- a 30%-opacity red band where CE is above PE.

The band is built from two transparent bases and two signed-gap stacks. It does
not subtract, rescale or overwrite either source series. Missing either side
creates a gap rather than a zero.

Compact labels and tooltips use integer display rounding. Raw source values and
export evidence remain unchanged.

### Lower-right range-normalised chart

The blank cell below the strike-positioning heatmap now displays every retained
exact CE and PE price series for the selected session. It reuses the existing
legacy range-normalisation calculation independently for each contract:

- first observed session price = `0`;
- observed session high = `+100`;
- observed session low = `-100`.

CE lines are dotted yellow and PE lines dotted blue. The independently selected
CE and PE are darkest; opacity reduces with strike distance. The Y-axis is fixed
to `-100, 0, +100`, includes a dotted zero line, and displays integers only.
Hover time is coordinated with the NIFTY, selected CE/PE, cumulative history and
positioning views.

### Compact strike charts

OI by strike, Delta OI by strike and Strike Structure retain their value axes
and calculations but suppress value-axis tick labels in the narrow right column.
The X-axis and all exact hover/linkage evidence remain. The strike-by-time
heatmap keeps its categorical Y labels.

## Validation

- Focused calculations: 22/22 tests passed.
- Full web suite: 257/257 tests passed.
- Production web typecheck and build passed.
- Authenticated preview and production browser regressions each passed 49/49
  checks at 1920x1080.

The browser run used a labelled synthetic tracked-chain history injection only
for deterministic cumulative-band rendering. The option-price range chart used
the retained application endpoint. Fixture evidence is not proof of live-source
history completeness.

Production release `01d5d21` recreated only `n50-dashboard`. Container
`63efdd643bf7...` was healthy on image
`sha256:2868e6d2973dc2cfd6fc3ae761f92d65508508a30f265335f58252a90b17b91d`.
Rollback image:
`trading-stack-n50-dashboard:before-scalper-v2-cumulative-bands-20260922`.

## Rollback

Revert the release commit and recreate only `n50-dashboard`. This change needs
no database, collector or API rollback.
