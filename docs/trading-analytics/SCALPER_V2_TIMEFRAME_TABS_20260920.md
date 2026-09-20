# Scalper V2 timeframe tabs

Date: 20 September 2026
Scope: existing `view=scalper_v2` only

## Change

The Time command group again exposes four direct chart timeframe buttons:

`1m | 5m | 15m | 1h`

All four buttons use the existing `interval` URL and chart API contract. The
selected interval receives the existing active styling. Session selection,
Fit Day, independent CE/PE contracts, range policy, linked cursor, drawings,
measurements and minute refresh behavior are unchanged.

## Validation

- Web typecheck passed.
- Authenticated local Playwright passed 39/39, including exactly one visible
  control for every interval, active 5m styling and a real 5m to 15m to 5m URL
  switch.
- Evidence: `output/playwright/scalper-v2-timeframe-tabs-local/`.

Full-suite and production release evidence is appended after deployment.
