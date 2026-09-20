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
- Web checks passed: typecheck, 236/236 tests and production build.
- API checks passed: typecheck, 261/261 tests and production build.
- Canonical repository preservation gate and `git diff --check` passed.
- Authenticated production Playwright passed 39/39, including the same real
  interval switch. Evidence:
  `output/playwright/scalper-v2-timeframe-tabs-production/`.
- Production dashboard container is healthy on image
  `sha256:f80d2fef4430a3e3c704d6b59e46c5bc49c14236948d389566f8dffbadbbbe93`;
  entry asset `/n50/assets/index-De0qqYnF.js`.
- Rollback tag:
  `trading-stack-n50-dashboard:before-scalper-v2-timeframe-tabs-20260920`.
- The feature was merged locally to `master` at `bdf4ef3`. GitHub push remains
  blocked by an outbound `github.com:443` connection failure from this host;
  the production deployment itself completed successfully.
