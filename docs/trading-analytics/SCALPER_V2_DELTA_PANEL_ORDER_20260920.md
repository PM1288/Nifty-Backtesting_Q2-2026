# Scalper V2 strike-panel order — 20 September 2026

## Outcome

The Scalper V2 right-side strike stack now contains four compact panels in this
fixed order:

1. `OI by strike` — CE OI, PE OI and the independently scaled `PE − CE OI` line.
2. `ΔOI by strike` — signed CE/PE ΔOI bars and the independently scaled
   `PE ΔOI − CE ΔOI` line.
3. `Strike structure`.
4. `Strike × time positioning` heatmap.

The former bid–ask-spread chart was removed. The two timestamp-aligned
cumulative OI-difference panels retain the same widths as the price charts
above; a non-rendering side-column spacer preserves that X-axis alignment.

## Preserved contracts

- Missing ΔOI remains unavailable, never zero.
- Positive and negative ΔOI retain their sign and adaptive zero-inclusive
  domain.
- CE/PE identity, PE-minus-CE arithmetic, strike hover, time hover and the
  expanded analytics views are unchanged.
- Exact bid/ask source fields remain available in evidence/export and the
  selected-contract inspector; only the dedicated spread chart was removed.
- No strategy, signal, collector, broker, paper-order or live-order behavior
  changed.

## Validation

- Web TypeScript: pass.
- Web tests: 247/247 pass.
- Production build: pass.
- Authenticated local browser regression: 46/46 pass.
- Screenshot:
  `output/playwright/scalper-v2-delta-panel-order-local-final/scalper-v2-popout-1920x1080.png`.

## Production release — 21 September 2026

- Functional commit `56ca4566c0b7eb6fbf8101ce6806d55dad2f1155` was pushed to the
  feature branch and fast-forwarded to remote `master` before deployment.
- Only `n50-dashboard` was recreated. The deployed container is healthy with
  zero restarts on image
  `sha256:3fa7002513bcf4adea9eac79144a559694ff16852b5733fa7b8dfd52b1d776aa`.
- Routed entry asset: `/n50/assets/index-CeF0EzFt.js`.
- Authenticated deployed-container Scalper V2 regression: 46/46 pass. Evidence:
  `output/playwright/scalper-v2-delta-panel-order-deployed-20260921/`.
- The authenticated Home/Screener refresh regression also passed 11/11 against
  this deployment. It retained the same hydrated DOM surfaces and last-good
  data through forced background-request failures, recovered in place, and
  recorded no reload/navigation. Evidence:
  `output/playwright/home-screener-live-refresh-deployed-20260921/`.
- Measured first visible authenticated surfaces on the local production gateway:
  Home 685 ms and Screener 589 ms. Live quotes continue through the stream;
  cached structural snapshots refresh in place rather than remounting the page.
- Rollback image:
  `trading-stack-n50-dashboard:before-scalper-v2-delta-panel-order-20260921`.
