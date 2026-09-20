# Scalper V2 option metrics and compact chart layout

Date: 20 September 2026
Scope: existing `view=scalper_v2` only

## Outcome

- The command row starts with the selected underlying symbol. The 1m, 5m and
  15m buttons are removed from V2; the remaining 1h choice and session/day-fit
  controls retain the existing URL and chart-data contracts.
- Price-card headers, chart gaps, card insets and page padding are reduced. The
  three right-side strike panels divide the 640px price workspace equally and
  the two timestamp-difference panels use the same approximately 210px panel
  height.
- Exact-contract IV comparison is now consistent across both option sources.
  Native archived chains derive `change_in_iv` from the previous exact
  strike/right snapshot. SmartAPI fallback cohorts use the preceding retained
  row for the same symbol token, expiry and underlying, bounded by the request
  as-of time.
- The selected CE/PE metrics table exposes the parameters already retained by
  the collector: current OI, change in OI, IV, IV change, volume, bid/ask
  quantity, delta, gamma, theta, vega and bid/ask spread.
- When no exact prior IV exists, the third strike panel explicitly says IV
  comparison is unavailable and displays tracked source volume instead. It
  does not convert unavailable IV into zero.

## Data audit

Read-only production database inspection found the latest archived NSE chain
snapshots contained non-null OI, reported change in OI, IV, volume and all four
Greeks for every retained leg. The separate SmartAPI `option_greeks` history
for the active NIFTY expiry was incomplete for the displayed cohort (PE-only,
outside the displayed ATM window). The UI therefore uses only exact matches and
does not borrow a Greek from another strike or option side.

## Preservation

No order route, permission, strategy calculation, signal formula, drawing,
measurement, independent CE/PE selection, export, cursor coordinator or source
observation is changed. Missing values remain unavailable. The original
collector tables and historical rows are unchanged.

## Validation

- Focused API option-source and chain-comparison tests passed.
- Focused web strike-chart tests passed.
- API typecheck/build and the full 260-test suite passed.
- Web typecheck/build and the full 235-test suite passed.
- Canonical repository preservation gate passed.
- Authenticated local Playwright geometry/data-state regression passed 33/33
  at 1920x1080. Production browser evidence is recorded after deployment.
- A read-only execution of the stock-chain lateral comparison found exact
  prior contract rows for 12/14 latest RVNL legs. Neither current nor prior
  retained broker IV was populated in that cohort, validating the truthful
  volume fallback rather than a fabricated IV delta.

Browser evidence is written under
`output/playwright/scalper-v2-option-metrics-layout-*` and is not committed.
