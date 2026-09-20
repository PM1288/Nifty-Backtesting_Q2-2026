# Scalper V2 option premium and spread repair

Date: 20 September 2026
Scope: existing `view=scalper_v2` only

## Cause and data decision

The third strike panel displayed change in IV. That calculation requires a
current and prior IV for the same contract. An authenticated read of the active
NIFTY 22 September cohort found current IV, prior IV and Greeks on 0/20 legs,
so the panel could only show `IV change unavailable`. Drawing an IV curve from
price or another strike would fabricate data.

The same exact cohort has complete retained values on 20/20 legs for option
LTP, bid, ask, bid quantity and ask quantity. The repair therefore uses:

- `Option premium by strike`: exact retained LTP for CE and PE, plus the
  descriptive PE-minus-CE premium difference on its own axis.
- `Bid-ask spread by strike`: exact `ask - bid` in rupees for CE and PE, plus
  the descriptive PE-minus-CE spread difference on its own axis.

Crossed or incomplete quotes remain unavailable. Missing values are not zero.
The rejected volume-by-strike chart is removed from the lower-right slot.

## Presentation and preservation

- CE remains yellow and PE remains blue. The two difference lines remain
  purple and use independent scales.
- Both panels retain shared strike hover and the exact NIFTY/nearest-strike
  guide.
- The premium panel replaces the unavailable IV panel in the three-panel side
  column. The spread panel fills the lower-right slot aligned with the two
  cumulative OI-difference charts.
- Current IV, IV change, Greeks, volume and quote-depth evidence remain in the
  selected-pair table and exports when supplied. No source field is deleted.
- No collector, strategy, order permission, signal rule, OI calculation,
  cumulative history, chart cursor, drawing or measurement contract changes.

## Validation

- Focused option-chart tests: 10/10 passed.
- Authenticated local browser geometry and pop-out regression: 35/35 passed.
- Web typecheck, 236/236 tests and production build: passed.
- API typecheck, 261/261 tests and build: passed.
- Browser evidence:
  `output/playwright/scalper-v2-option-premium-spread-local/`.

## Production release

- Implementation `0f2326b` was merged and pushed to `master` as `7fc7fa8`.
- The scoped release recreated only `n50-dashboard`; it is healthy on image
  `sha256:307b4d9b2da72e87935598725335106bd3c8acfeb09643c0cb85fd0d0402ee75`.
- Routed entry asset: `/n50/assets/index-C5vtlmWO.js`.
- Authenticated production browser regression: 35/35 passed. Evidence:
  `output/playwright/scalper-v2-option-premium-spread-production/`.
- Rollback image:
  `trading-stack-n50-dashboard:before-scalper-v2-premium-spread-20260920`.
- No database, collector or order service was changed or restarted.
