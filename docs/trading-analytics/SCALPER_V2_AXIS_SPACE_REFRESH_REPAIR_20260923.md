# Scalper V2 axis, space and refresh repair — 23 September 2026

## Scope

This is a presentation and chart-lifecycle repair for the existing read-only
Scalper V2 workstation. Strategy calculations, canonical CE/PE OI ranking,
data collection, exports and order permissions are unchanged.

## Implemented

- Removed the obsolete OI/Delta-OI primitive from the underlying candle pane.
  OI remains available in the dedicated strike charts, matrix, time charts and
  detail table. The candle pane no longer reserves or redraws an overlay lane.
- Removed the associated pointer, wheel, resize and data-update reprojection
  loop. Candle, EMA and volume series continue to update incrementally.
- Changed native chart grid lines to dotted lines and added dotted, price-scale
  labelled rank guides for the first two OI leaders on each side, only when the
  strike is inside the raw observed day high/low.
- The underlying presentation follows the requested opposing guide convention:
  canonical CE OI ranks display as `PE1`/`PE2`, and canonical PE OI ranks display
  as `CE1`/`CE2`. Canonical ranking and the matrix/rail identities are not changed.
- Replaced four separate timeframe buttons with one 1m/5m/15m/1h selector.
- New/default OI presentation is underlying units (`OI x exact lot size`) when
  the source is verified as contracts and one exact common lot size exists.
  Contracts remain selectable; unavailable lot conversion fails back honestly.
- Added a visible boundary around the OI unit control and constrained chart and
  strike-panel headers to one clipped line so metadata cannot float over plots.
- Added browser diagnostics for chart instance creation and verified that the
  15-second refresh changes the refresh clock without remounting native charts.
- Removed ECharts' deferred/progressive render path for these bounded analytics
  datasets. Fast tab changes can no longer leave an orphan scheduler/canvas
  pipeline, which was the live-data cause of occasional stuck/blank analytics.

## Validation

- Web unit tests: 281/281 passed.
- Web typecheck and production build: passed.
- API tests: 272/272 passed; API build passed.
- Authenticated local and production Chromium at 1920x1080 and 1440x900
  each passed 23/23 checks validating geometry,
  no underlying OI overlay, opposing guide labels, timeframe selector, no hover
  network/hydration, in-place refresh, no refresh remount and rapid analytics-tab
  lifecycle stability.
- Evidence: `/home/novius2/NIFTY50/evidence/scalper-v2-axis-space-refresh-20260923/`.

## Release

- Deployed commit: `346eac219e227534495caeb5a1fe58ac28bc564b`.
- Production image: `trading-stack-n50-dashboard:scalper-v2-axis-space-refresh-20260923-346eac2`
  (`sha256:c13931efb1893b30fcd77ddeeba07597899b792204fb2be734be63611d90df26`).
- Container is healthy with zero restarts; public health is ready and serving
  `/n50/assets/index-C99uRvnV.js`.
- Rollback images: `trading-stack-n50-dashboard:before-scalper-v2-axis-space-refresh-20260923`
  and `trading-stack-n50-dashboard:before-echarts-tab-pipeline-20260923`.

## Rollback

Revert the delivery commit. No database migration or data rewrite is involved.
