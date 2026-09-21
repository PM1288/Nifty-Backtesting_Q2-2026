# Scalper V2 pop-out scroll and cumulative context lines

Date: 21 September 2026

## Scope

This is a presentation repair of the existing `scalper_v2` workstation. It
does not change chain collection, cumulative arithmetic, contract selection,
strategy rules, alerts or order permissions.

## Pop-out scrolling

The Trading Analytics wrapper applies a fixed viewport height and
`overflow:hidden` to the embedded Scalper workstation. The same wrapper rule
was also applied to `popout=scalper_v2`, although the pop-out contains the price
workspace, two history charts, the detail inspector and analytics below it.
Content below the viewport therefore existed but the document could not scroll.

The route wrapper now exposes `data-popout=true`. Only that state changes to an
auto-height, visible-overflow document, while the minimal pop-out shell and main
container explicitly permit vertical document growth. The normal embedded
workstation keeps its prior bounded layout.

## Cumulative difference charts

The two existing timestamp charts retain their primary arithmetic and primary
Y-axis:

```text
OI difference(t)  = cumulative PE OI(t)  - cumulative CE OI(t)
Delta difference(t) = cumulative PE Delta OI(t) - cumulative CE Delta OI(t)
```

Each chart adds two contextual lines on an independent secondary Y-axis:

| Chart | CE context line | PE context line |
|---|---|---|
| OI difference | Cumulative CE OI | Cumulative PE OI |
| Delta OI difference | Cumulative CE Delta OI | Cumulative PE Delta OI |

CE is yellow and PE is blue. Both contextual series are thin, dotted and 42%
opaque, with no area fill. Their independent secondary scale prevents their
larger absolute totals from flattening or changing the primary difference
series.

## Session-relative difference colour

The primary difference line preserves its raw numerical Y value and receives a
separate visual score:

```text
session minimum difference -> -1 -> red
first observed difference  ->  0 -> black
session maximum difference -> +1 -> green
```

Values below the opening observation are interpolated from red to black;
values above it are interpolated from black to green. This is not a directional
trade label and does not alter the source value. A missing observation remains
missing. When all observed values are identical, the score remains zero/black.

## Files

- `apps/web/src/lib/scalperV2OiTime.ts`
- `apps/web/src/pages/TradingAnalyticsPage.tsx`
- `apps/web/src/pages/TradingAnalyticsPage.module.css`
- `apps/web/src/components/chrome/AppShell.module.css`
- `apps/web/tests/scalperV2OiTime.test.ts`
- `tools/playwright/scalper-v2-popout-structure.mjs`

## Acceptance

- The 1920x1080 pop-out has a document taller than the viewport and can scroll
  to the lower charts/details.
- Both primary difference series retain their original values and main axis.
- Each chart exposes three series: primary difference, cumulative CE and
  cumulative PE.
- CE/PE context series use the secondary axis, are dotted/faint and have no
  area fill.
- The primary line maps session low/open/high to red/black/green.
- Time-domain and shared cursor behavior remain unchanged.
- Missing values are not converted to zero.
