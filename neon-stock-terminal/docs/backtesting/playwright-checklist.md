# Playwright Checklist

## Routes

- `/backtesting`
- `/backtesting/strategies`
- `/backtesting/strategies/rsi30_willr80_closegtprev_tp125`
- `/backtesting/results`
- `/backtesting/regimes`
- `/backtesting/stocks`
- `/backtesting/daily-summary`
- `/backtesting/compare`
- `/backtesting/runs`

## Viewports

- desktop `1920x1080`
- laptop `1366x768`
- mobile `390x844`

## Required checks

1. Sidebar shows `Backtesting` group and links.
2. Overview loads without console errors.
3. Strategy Library shows all three active strategies and their archetypes.
4. Strategy Detail shows summary cards and chart panels for each of the three strategies.
5. Strategy Detail scenario filters switch between:
   - `Single Stock`
   - `Nifty 100`
6. Capital filter exposes:
   - `No Capital Limit`
   - `10L`
   - `20L`
   - `50L`
7. Single Stock mode enables the stock selector.
8. Results page shows portfolio-level cards and tables.
9. Regimes page shows side-by-side strategy regime comparison visuals.
10. Stocks page loads cross-strategy stock suitability rows.
11. Daily Summary shows latest entries, exits, and skipped signals.
12. Compare page shows three strategy rows by default and all three names in the compare visuals.
13. Runs page shows run metadata and validation rows.
14. No page overlaps the footer disclaimer.
15. No chart legend overlaps the plot area.
16. No page shows index instruments as tradable symbols.
17. Route reload preserves a valid default state.
18. Empty and stale states render gracefully when mocked.

## Screenshots to capture

- one full-page screenshot per route at desktop
- one laptop screenshot for Strategy Detail
- one mobile screenshot for Overview
- one mobile screenshot for Strategy Detail filter controls
- compare screenshot with all three strategies visible
- regime screenshot with all three strategies visible
- stock insights screenshot with cross-strategy rows visible

## Console assertions

- no uncaught exceptions
- no failed route-module imports
- no failed `/v1/backtesting/*` responses
