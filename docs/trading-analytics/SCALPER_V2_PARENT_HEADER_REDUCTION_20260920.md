# Scalper V2 parent-header reduction

Date: 20 September 2026
Scope: existing `view=scalper_v2` parent toolbar only

## Change

The redundant parent-toolbar items are hidden in Scalper V2:

- `Trading Analytics · Scalper V2`
- `NIFTY strategy`
- `Health`
- `Formula`
- `Conditions`

The change is scoped to Scalper V2. Other Trading Analytics views retain their
title, NIFTY strategy link and evidence controls. Scalper V2 keeps its compact
view navigation, OI/Volume PCR values, refresh, symbol and chain selectors; its
own command bar and deeper evidence remain unchanged.

## Validation

- Web typecheck, 236/236 tests and production build passed.
- API typecheck, 261/261 tests and production build passed.
- Authenticated local Playwright passed 39/39, including the explicit hidden
  parent-label assertion and all existing Scalper V2 preservation checks.
- Local evidence: `output/playwright/scalper-v2-parent-header-local/`.

## Production release

- Feature branch and merged `master` are pushed.
- Scoped dashboard deployment completed; the container is healthy on image
  `sha256:1e540e0fca96e106020c149e53accb1b1d3f0a369bcfca25bcfffec3bede81b4`.
- Routed entry asset: `/n50/assets/index-BqkN37tE.js`.
- Authenticated production Playwright passed 39/39. Evidence:
  `output/playwright/scalper-v2-parent-header-production/`.
- Rollback tag:
  `trading-stack-n50-dashboard:before-scalper-v2-parent-header-20260920`.
- No database, collector, strategy, order service or mounted volume changed.
