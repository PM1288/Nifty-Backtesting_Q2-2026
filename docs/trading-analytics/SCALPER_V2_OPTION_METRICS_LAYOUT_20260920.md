# Scalper V2 option metrics and compact chart layout

Date: 20 September 2026
Scope: existing `view=scalper_v2` only

## Outcome

- The command row starts with the selected underlying symbol. The 1m, 5m and
  15m buttons are removed from V2; the remaining 1h choice and session/day-fit
  controls retain the existing URL and chart-data contracts.
- Price-card headers, chart gaps, card insets and page padding are reduced. The
  three right-side strike panels divide the 640px price workspace equally. The
  two timestamp-difference panels and the lower-right volume-by-strike panel
  share the same approximately 210px height and fill the complete lower row.
- Exact-contract IV comparison is now consistent across both option sources.
  Native archived chains derive `change_in_iv` from the previous exact
  strike/right snapshot. SmartAPI fallback cohorts use the preceding retained
  row for the same symbol token, expiry and underlying, bounded by the request
  as-of time.
- The selected CE/PE metrics table exposes the parameters already retained by
  the collector: current OI, change in OI, IV, IV change, volume, bid/ask
  quantity, delta, gamma, theta, vega and bid/ask spread.
- When no exact prior IV exists, the third strike panel remains the IV panel
  and explicitly says the comparison is unavailable. Tracked source volume is
  a separate chart in the previously empty lower-right corner. Missing IV is
  never converted into zero or replaced by another metric.

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
- The follow-up authenticated local Playwright geometry/data-state regression
  passed 35/35 at 1920x1080, including separate IV and volume semantics and
  lower-row alignment.
- A read-only execution of the stock-chain lateral comparison found exact
  prior contract rows for 12/14 latest RVNL legs. Neither current nor prior
  retained broker IV was populated in that cohort, validating the truthful
  unavailable IV state rather than a fabricated IV delta.

Browser evidence is written under
`output/playwright/scalper-v2-option-metrics-layout-*` and is not committed.

## Production release

- Implementation commit `70155ab` was merged to pushed `master` as `71e1116`.
- The scoped production procedure rebuilt and recreated only `n50-dashboard`.
- Container `414f0e3be8b...` is healthy on image
  `sha256:59b94444f25895dbe830cc9eef8e1a85134a434f601e27f7824c17d5d1031c6b`.
- The routed entry asset is `/n50/assets/index-DcWQZeSp.js`.
- Authenticated production Playwright passed 33/33. Evidence:
  `output/playwright/scalper-v2-option-metrics-layout-production/`.
- Rollback image:
  `trading-stack-n50-dashboard:before-scalper-v2-option-metrics-20260920`.
- No database migration, data rewrite, collector restart or order change was
  part of this release.

### Separate IV and volume follow-up

- Follow-up implementation `a8c1f0a` was merged and pushed to `master` as
  `820b984`.
- The IV panel no longer changes identity when comparison data is unavailable.
  A fourth, independent volume-by-strike chart fills the lower-right corner.
- Web typecheck, 235/235 tests, build, repository gate and authenticated local
  browser validation passed. The deployed production container passed 35/35
  through its local gateway at 1920x1080.
- Production container `936d2d65dd4c...` is healthy on image
  `sha256:2a29abfff98cffdd82ba64d67f5543d1ca964b39e8fe26a07dbfe02bc3469702`;
  routed entry asset `/n50/assets/index-C48gZN1P.js` passed the deployment gate.
- A separate public-domain rerun reached the page but its pop-out navigation
  encountered a transient external network error. This was not counted as a
  pass; the same deployed image passed through `127.0.0.1:19090`.
- Follow-up rollback image:
  `trading-stack-n50-dashboard:before-scalper-v2-separate-iv-volume-20260920`.
