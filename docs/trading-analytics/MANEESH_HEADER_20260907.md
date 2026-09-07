# Temporary MANEESH shortcut — 7 September 2026

## Scope

Plain solid `#be185d` pink with white text, no icon, gradient or animation.
Direct destination `/strategy/trading-analytics?view=scalper`; canonical Strategy
menu retained. Shared route configuration supplies the shortcut. Desktop/tablet
show it beside navigation, mobile in the existing second context row without
adding a header band. Existing authentication and feature gate remain in force.

No calculation, source, database, order, notification or paper lifecycle changes.
The latest strategy is still a read-only research preview, not a completed
execution system. See `FNO_COVERAGE_20260907.md` for source and policy limitations.
265 catalogued underlyings do not imply complete data coverage; BANKNIFTY option
history/metrics were missing in the last four-instrument sample. Max pain is
explicitly indicative observed-window evidence, not verified full-chain max pain.

## Validation and reruns

From `neon-stock-terminal/apps/web` and `apps/api` respectively:
`npm run typecheck && npm test && npm run build`.
From repository root: `bash scripts/verify/canonical-repository-gate.sh`.
Browser scripts use protected `PLAYWRIGHT_ADMIN_PASSWORD`, never log it:

- `tools/playwright/option4-command-header-regression.mjs`
  with `PLAYWRIGHT_BASE_URL=https://n50.nifty50today.co.in/n50`.
- `tools/playwright/paper-event-notifier-regression.mjs`
  with `PLAYWRIGHT_ORIGIN=https://n50.nifty50today.co.in`.
- `tools/playwright/trading-analytics-fno-coverage.mjs` (public default).

The header harness checks seven widths (1920, 1440, 1280, 1024, 430, 390, 360),
shortcut destination/style/fit, header geometry and existing menu interactions.
Browser synthetic notifier events are intercepted responses, not stored trades.

Release results will be appended after deployment validation. Do not interpret
this document as full strategy acceptance.

## Rollback

Revert this scoped frontend commit on master, run gates, rebuild/recreate only
`n50-dashboard`. No database rollback. Previous running image is retained as
`trading-stack-n50-dashboard:before-maneesh-20260907`.
