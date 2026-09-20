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

Production release evidence is appended after deployment.
