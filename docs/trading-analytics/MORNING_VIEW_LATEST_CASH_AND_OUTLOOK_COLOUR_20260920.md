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
