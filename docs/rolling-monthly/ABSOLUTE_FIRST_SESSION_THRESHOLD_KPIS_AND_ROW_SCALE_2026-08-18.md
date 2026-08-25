# Absolute First Session threshold KPIs and row scale

Date: 18 August 2026 (UTC)
Dashboard: `https://n50.nifty50today.co.in/n50/strategy/rolling-monthly?view=absolute-first-session&threshold=0.20`

## Delivered behaviour

- Every Absolute First Session evidence row is highlighted from its final or current-to-date return.
- `NOT_ENTERED_GAP_UNFILLED` rows are neutral grey and do not receive invented outcome values.
- Entered rows use a clamped −10% to +10% colour scale:
  - returns from −1% through +1% are yellow;
  - losses below −1% interpolate from yellow toward red at −10%;
  - gains above +1% interpolate from yellow toward green at +10%;
  - values outside ±10% retain their real displayed number while using the endpoint colour.
- Added cumulative favourable-excursion number KPIs for +1%, +2%, +3%, +5% and +10%.
- Added cumulative adverse-drawdown number KPIs for −1%, −2%, −3%, −5% and −10%.
- Each KPI shows the observation count, percentage and explicit numerator/denominator. No chart was introduced for these threshold ladders.

## Denominator and calculation semantics

The percentage denominator is `path_evaluable`, defined as:

```text
entry_status = ENTERED
AND evaluation_status != INCOMPLETE
```

An incomplete path is excluded from both numerator and denominator; it is not silently treated as a failed target. `entered` is still shown beside `path_evaluable` so coverage is visible.

```text
favourable count at T = max_profit_pct >= T
drawdown count at T   = max_drawdown_pct <= -T
rate                  = count / path_evaluable * 100
```

Threshold incidence is cumulative. For example, a trade that reached +10% also counts at +1%, +2%, +3% and +5%.

## Live reconciliation at validation time

The final browser-verified 0.20% gap-threshold response contained:

| Population | Count |
|---|---:|
| Entered | 524 |
| Evaluable entered paths | 520 |
| Incomplete entered paths | 4 |

| Favourable threshold | Count | Rate of 520 |
|---|---:|---:|
| +1% | 485 | 93.27% |
| +2% | 452 | 86.92% |
| +3% | 414 | 79.62% |
| +5% | 313 | 60.19% |
| +10% | 168 | 32.31% |

| Adverse threshold | Count | Rate of 520 |
|---|---:|---:|
| −1% | 430 | 82.69% |
| −2% | 378 | 72.69% |
| −3% | 337 | 64.81% |
| −5% | 258 | 49.62% |
| −10% | 109 | 20.96% |

These are derived from canonical stored paths at request time and are not hard-coded UI values.

## Files changed

- `neon-stock-terminal/apps/api/src/routes/rollingMonthly.ts`
- `neon-stock-terminal/apps/api/src/routes/rollingMonthly.test.ts`
- `neon-stock-terminal/apps/web/src/lib/api.ts`
- `neon-stock-terminal/apps/web/src/pages/RollingMonthlyPage.tsx`
- `neon-stock-terminal/apps/web/src/pages/RollingMonthlyPage.module.css`
- `tools/playwright/rolling-monthly-first-session-regression.mjs`

OpenAPI documentation was regenerated in:

`/home/novius2/NIFTY50/backend-openapi-documentation-2026-08-13`

The Absolute First Session response now documents `performanceThresholdsPct`, the target/drawdown counts and `path_evaluable` denominator.

## Validation

- API test suite: 102 passed.
- Web component/unit suite: 27 passed.
- Web TypeScript and production Vite build: passed; 2,490 modules transformed.
- Live Playwright reconciliation: 40 checks passed, covering API counts, denominator, all ten number KPIs, row highlighting, grey non-entry rows, chart evidence, URL state, desktop/mobile overflow and screenshots.
- OpenAPI: 18 specifications valid, 602 operations, zero validation errors.
- Live container: `trading-stack-novius2-n50-dashboard-1` healthy after replacement.

Screenshots and machine-readable results:

`/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/tools/playwright/output/playwright/rolling-monthly-first-session-20260818`

## Safety, schema impact and rollback

- No trading rules, candidate eligibility, paper-trading wiring or broker endpoints changed.
- No PostgreSQL schema or stored source data changed.
- The threshold fields are derived read-only in the API from existing candidate paths.
- Pre-change backup:
  `/home/novius2/trading-stack/backups/absolute-first-session-threshold-ui-20260818T022000Z/pre-change-files.tar.gz`
- Backup SHA-256:
  `2184b55f2057ee2753a584235fcf4833c9db5b51bfc8f82d343af4aeb8a6a202`
- Rollback: restore the backed-up source files, rebuild `n50-dashboard`, and recreate only that service with `--no-deps`. No database rollback is required.
