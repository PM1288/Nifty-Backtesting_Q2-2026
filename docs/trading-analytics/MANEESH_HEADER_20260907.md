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

## Final release evidence

Deployed pushed-master application commit `c17b25c`. Image:
`sha256:6c0b4c1c2e21554565d32051bb9709eb5a30754dc04f520eddeeb9bfd2314553`.
Only dashboard recreated; final health healthy, zero restarts observed.

- Web 79/79 and API 180/180 unit tests pass; typechecks/builds pass.
- Canonical repository and whitespace gates pass.
- Final public header browser run: **184/184**, seven widths, actual shortcut
  clicks, solid pink/white, no gradient/animation, no navigation overlap,
  no page horizontal overflow, menu stacking and keyboard/search preserved.
- Paper notifier: **17/17**, durable endpoint, intercepted-only synthetic target,
  concise speech default on, mute cancellation, desktop/mobile popup preserved.
- Final Trading Analytics public retest: **53/53**, NIFTY/BANKNIFTY/RELIANCE/SBIN,
  5m/day defaults, exact instruments, selection reset, three populated PCR/window
  max-pain samples, charts ready and desktop/mobile axe checks.
- All four sampled evidence requests HTTP 200, 400 daily bars, no query errors.
  BANKNIFTY still has zero sampled quoted options; this is a real missing-data
  limitation, not a passing coverage claim. All 265 instruments were not tested.

Screenshot inspection caught an intermediate squeezed Paper label at 1280px;
fixed primary navigation flex sizing and added a no-overlap assertion. Final
1280 screenshot visually inspected: Paper and MANEESH both fully readable.
The old notifier harness expected muted/default verbose speech; updated to the
already-requested concise/default-on semantics, without changing runtime speech.
An initial header run recorded two analytics-dashboard HTTP 503 responses at
approximately ten seconds; final complete run had no console errors. A rerun
started before container readiness encountered login 502; after health became
healthy all three complete suites passed. These transient failures are retained
here rather than omitted; broad long-duration reliability is not certified.

Evidence under `/home/novius2/trading-stack/`:

- `output/playwright/option4-command-header/`: results.json and seven screenshots.
- `output/paper-event-notifier/`: results.json and desktop/mobile screenshots.
- `output/playwright/trading-analytics-fno-coverage/`: results.json, source
  coverage, screenshots and axe JSON.

No new flag: existing Trading Analytics flag controls the destination. To use,
click MANEESH on any authenticated page. Existing strategy menu remains intact.
Do not interpret this as full executable-strategy acceptance.

## Rollback

Revert this scoped frontend commit on master, run gates, rebuild/recreate only
`n50-dashboard`. No database rollback. Previous running image is retained as
`trading-stack-n50-dashboard:before-maneesh-20260907`.
