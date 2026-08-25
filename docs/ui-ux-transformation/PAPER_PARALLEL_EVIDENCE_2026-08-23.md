# Paper Trading HiPlot-style parallel evidence — 2026-08-23

## Outcome

The primary Paper Trading factor visual is now a parallel-coordinates evidence plot rather than a two-factor interpolated contour. The prior contour is retained, collapsed, as secondary evidence so no existing analysis is removed.

Live route:

`https://n50.nifty50today.co.in/n50/paper-trading?section=factor-analysis`

## Dimensions

Each line represents one canonical paper trade and connects twelve dimensions:

1. OFactor.
2. XFactor.
3. Entry-time RSI14.
4. Entry-time ATR14.
5. Entry-time Williams %R.
6. Entry-time relative volume versus SMA20.
7. Actual paper entry price.
8. Direction-normalised entry price versus the point-in-time OIIS reference.
9. D0 maximum observed profit, scaled to fixed ₹2 lakh whole-share quantity.
10. Highest hit swing target profit, scaled to fixed ₹2 lakh quantity.
11. Five-session maximum observed profit, fixed ₹2 lakh basis.
12. Thirty-session maximum observed profit, fixed ₹2 lakh basis.

Swing target profit is zero only when swing targets are eligible but none was hit. It remains unavailable when no swing target is eligible or entry/quantity inputs are unavailable. Other missing dimensions remain gaps and are never converted to zero.

## Interaction

- Filter by stock and entry strategy.
- Colour lines by any factor or outcome dimension.
- Hover/focus a line to inspect exact values.
- Enter/click opens the canonical trade evidence drawer.
- Complete underlying table remains available.
- Download the filtered data as CSV.
- Download the current plot as standalone SVG.
- Line colours and labels do not represent a buy/sell recommendation.

The implementation is repository-native React/TypeScript/SVG, following the interaction model of Facebook Research HiPlot without adding a second Python runtime or frontend chart dependency.

## Axis correction

`minimumOneAxisScale()` now guarantees at least one displayed unit between adjacent numeric axis ticks. It is applied to:

- all parallel-coordinate axes;
- retained two-factor contour X/Y axes;
- reward-versus-pain reward and pain axes.

Calendar and event heatmaps use categorical rows/columns and therefore have no numeric Y-axis ticks to change.

## Files

- `neon-stock-terminal/apps/web/src/lib/paperParallelPlot.ts`
- `neon-stock-terminal/apps/web/tests/paperParallelPlot.test.ts`
- `neon-stock-terminal/apps/web/src/pages/PaperTradingCommandCenter.tsx`
- `neon-stock-terminal/apps/web/src/pages/PaperTradingCommandCenter.module.css`
- `/home/novius2/trading-stack/tools/playwright/paper-parallel-evidence-regression.mjs`

## Validation

- Web unit tests: PASS — 42/42.
- TypeScript: PASS.
- Production Vite build: PASS — 2,500 modules.
- Docker build/recreate: PASS; production dashboard healthy.
- Authenticated production Chromium: PASS — 35 trades, 12 axes, minimum tick interval 1.
- Stock/strategy filters: PASS.
- Keyboard line focus and canonical trade drawer: PASS.
- CSV and SVG downloads: PASS.
- Legacy contour collapsed by default and opens on request: PASS.
- Responsive/no body overflow: PASS at 1920×1080, 1366×768 and 390×844.

Two initial browser harness runs failed honestly: the first incorrectly treated collapsed `<details>` DOM content as visible, and the second attempted to hover a lower overlapping SVG line. The final harness checks visibility and uses keyboard focus after narrowing by stock; it passes.

Evidence:

`docs/paper-trading-v2/parallel-evidence/`

## API, schema and safety

- No API or Swagger/OpenAPI contract change.
- No database migration or production-row mutation.
- No SmartAPI/collector change.
- No paper-trade execution rule change.
- No live broker order.

Rollback backup:

`/home/novius2/trading-stack/backups/paper-parallel-plot-20260823T000000Z`
