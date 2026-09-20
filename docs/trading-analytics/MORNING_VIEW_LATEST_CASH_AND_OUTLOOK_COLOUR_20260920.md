# Morning View latest-cash and Outlook colour repair

Date: 20 September 2026

## Defect and cause

Morning View first selected the latest derivatives report date and then required
the NSE cash row to have that exact date. The retained sources legitimately lag
independently: derivatives currently end on 18 September while NSE cash ends on
17 September. Consequently Equity was displayed as unavailable and the original
six-row matrix could not produce an Outlook even though valid cash evidence was
stored.

## Repair

- The morning-summary endpoint independently selects the latest derivatives
  report and latest NSE-only cash report available on or before the request's
  IST date.
- Historical Morning View selection uses the latest retained NSE-only cash
  report on or before the selected derivatives date.
- Both dates are returned and displayed. Lagged cash is not relabelled as the
  derivatives date and missing cash remains unavailable rather than zero.
- The original matrix and Buy/Sell arithmetic are unchanged.
- The top Outlook applies an explicit green treatment to bullish results, red
  to bearish results and amber to unavailable/neutral results.

## Current retained evidence

- Derivatives report: 2026-09-18.
- Cash report: 2026-09-17.
- FII/FPI NSE cash net: -₹3,208.76 crore (`Sell`).
- Index futures net: +₹264.47 crore (`Buy`).
- Index options net: +₹4,404.77 crore (`Buy`).
- Canonical unchanged result: `Sideways (Bullish)`.

This is source-date reconciliation, not a strategy or order-rule change.

## Validation and release

- API focused tests: 13/13 passed.
- API full tests: 261/261 passed; typecheck/build passed.
- Web full tests: 235/235 passed; typecheck/build passed.
- Canonical repository gate and `git diff --check`: passed.
- Authenticated live Playwright: passed. It read the deployed summary rather
  than intercepting it and verified `Sell / Buy / Buy`, `Sideways (Bullish)`,
  both source dates, `data-tone=positive`, and the computed green background
  `rgb(220, 252, 231)`.
- Browser evidence:
  `output/playwright/morning-view-latest-cash-outlook/results.json` and
  `output/playwright/morning-view-latest-cash-outlook/desktop-morning-latest-cash-outlook.png`.
- Released commit: `fef0397` on `master`.
- Deployed image:
  `sha256:fd4048a59e29bdf61e01107196bdaac5a1563438462fadb9843d3f4b8ff9ef53`.
- Live asset: `/n50/assets/index-BpKb3D1W.js`.
- Rollback image:
  `trading-stack-n50-dashboard:before-morning-cash-outlook-20260920`.

The cash table lacks a publication/collection timestamp, so its point-in-time
knowledge state remains explicitly `CASH_PUBLICATION_TIME_UNVERIFIED`.
