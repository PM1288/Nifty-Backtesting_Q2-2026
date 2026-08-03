# Backtesting Changelog

## 2026-03-11

- Added native `Backtesting` route family and sidebar navigation.
- Added published worker batch `backtesting_precompute`.
- Added `nse_app.backtest_*` schema and publish flow.
- Added real snapshot reads in the API and scenario-selective detail fetches.
- Added Backtesting overview, library, detail, results, daily summary, compare, and runs pages.
- Added route analytics, monitoring thresholds, and prefetch support for Backtesting routes.
- Added initial Backtesting documentation set.

## 2026-03-11

- Expanded Backtesting from one strategy to three active v1 strategies:
  - `Fast Oversold Rebound`
  - `Confirmed Oversold Recovery`
  - `MACD Trend Continuation`
- Reworked worker precompute into layered storage:
  - feature layer
  - signal candidate layer
  - trade template layer
  - portfolio replay layer
  - summary marts
- Added benchmark FD storage and compare-summary marts.
- Upgraded Compare Strategies page from placeholder to a real multi-strategy comparison surface.
- Reworked Regime Analysis and Stock Insights to compare all active archetypes side by side.
- Updated Strategy Library to expose archetypes.
- Updated docs to reflect the three-strategy layered model.

## 2026-03-11

- Hardened the worker publish path by fixing the batch metadata constant reference that blocked `refresh-backtesting`.
- Corrected feature-layer validation so warm-up rows do not fail publish validation.
- Fixed rerun-safe publishing by batch-scoping `trade_template_id`, so repeated Backtesting publishes no longer fail on duplicate template keys.
- Fixed hook-order route crashes in Backtesting detail, results, and compare pages.
- Fixed local API base-path and dev CORS issues that broke browser-backed audit runs.
- Removed dead Backtesting-page request noise from unsupported shared prefetch calls.
- Made Backtesting `GET` endpoints guest-readable in the same way as the public analytics shell.
- Tightened API serving so published Backtesting snapshots are required by default; seeded fallback is now an explicit development opt-in.

## 2026-03-11

- Standardized shared Indian formatting utilities for numbers, compact numbers, INR currency, percentages, and IST dates across dashboard cards, tables, and chart tooltips.
- Converted Backtesting comparison, regime, stock-insight, detail, overview, portfolio, daily-summary, and runs visuals from pseudo/SVG placeholders to shared ECharts-backed charts with axis titles, legends, and zero/reference lines.
- Reworked Strategy Lab to use real evidence charts, a denser current-to-history bridge, and clearer action links instead of decorative placeholder sections.
- Added real focus charts to `% Change`, `RSI`, and `WILLR` heatmap pages with explicit axis titles and threshold markers.
- Added macro summary charts and audience-aware source-note collapse behavior to Supporting Metrics.
- Added shared analytics/Clarity-style interaction tags and region markers for headers, filters, tables, ticker, sidebar, and disclaimer banner.
- Regenerated the deployed nginx dashboard capture set after the charting/formatting cleanup for release QA.
