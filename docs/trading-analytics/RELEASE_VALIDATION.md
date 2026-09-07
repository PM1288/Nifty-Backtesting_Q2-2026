# Trading Analytics release validation — 7 September 2026

## Deployed identity

- Application commit: `f65d37d`, pushed on `master` and `feature/nifty-trading-analytics-20260907` before build.
- Dashboard image: `sha256:ec05e03704045e2c9f8ab88e5221cdfac859b9c20b2fceedbe41a2a2ca95b10f`.
- Public route: https://n50.nifty50today.co.in/n50/strategy/trading-analytics
- Flag: `N50_TRADING_ANALYTICS_ENABLED`; backend and build-time frontend flags inherit it.
- Only dashboard and the affected canonical FII parser service were rebuilt/recreated. Other collectors, AI research, paper workers and ledgers were not removed or restarted.
- This is a read-only research release, not completion of all implementation-prompt stages. See `IMPLEMENTATION_REPORT.md` for the eight material unfinished areas.

## Executed validation

| Check | Result |
|---|---|
| API unit/HTTP tests | 157 passed, 0 failed |
| Web tests | 69 passed, 0 failed |
| Python parser tests | 5 passed, 0 failed |
| API and web typechecks/builds | Passed |
| Canonical repository preservation gate | Passed |
| Supplied activity source values | 96/96 match |
| Final participant workbook block | 70/70 match; original raw CSV unavailable |
| Isolated migration/import rerun | Two runs retain 2 artifacts, 16 activity rows, 5 participant rows |
| Local deployed browser assertions | 108 passed, 0 failed |
| Public HTTPS deployed browser assertions | 108 passed, 0 failed |
| Axe options workspace main region | 0 violations at each of 4 viewports on both origins |
| Screenshots | 32 local + 32 public, eight lenses per viewport |

Viewports: 1920×1080, 1440×900, 1024×768 and 390×844. Checks include authenticated real-source access, paper/live disabled, source query errors absent, URL-addressable lenses, no browser horizontal overflow, inactive chart unmounting, option CSV row/contract parity, keyboard focus and no uncaught JavaScript errors. Axe coverage is the options main region, not a claim of exhaustive accessibility testing of the global shell or every lens.

Public smoke navigation also returned HTTP 200 for existing OIIS, OISS, NIFTY Options and Paper Trading routes. OIIS, NIFTY Options and Paper headings rendered; Paper reported 88 durable trades. OISS returned its shell during the short observation; this is not full OISS data acceptance. Existing strategy calculations and ledger lifecycle were not changed.

## Real snapshot and persistence

- Report 2026-09-04: 16 activity products, 5 participant rows, 5 preserved reconciliation discrepancies, 20 option legs, 400 daily candles, no source query errors.
- Three discrepancies are integer contract conflicts; two are ₹0.01-crore precision warnings. Neither source is silently repaired.
- Exact strike 23800 / expiry 2026-09-08 maps to `NIFTY08SEP2623800CE` and `NIFTY08SEP2623800PE`. Instrument-master strikes are already rupees; no second normalization is applied.
- Observed minute coverage: NIFTY 3020 minutes / 136 complete aggregated bars; CE 1433 / 86; PE 1435 / 86. Missing minutes remain incomplete, not confirmed signals.
- Explicit capture at `2026-09-07T16:23:00.000Z` repeated twice yields one evidence record with digest `73317c76a2ad6304fe72bd58fa16de1077bf88642287f3266e308f73e118df21`.
- Source archive: `/home/novius2/NIFTY50/The_Nifty_Options_stragty-2/implementation-evidence/source-artifacts/`.
- Additive schema `057_trading_analytics_provenance.sql` and reviewed import applied. No old report rows were overwritten.

## Performance and visual evidence

Local first useful evidence: 725 / 349 / 345 / 621 ms in viewport order above. Public: 833 / 645 / 778 / 664 ms. These include navigation and authenticated API verification, not isolated React commit timings.

Exact-contract lens switch plus data wait and screenshot: approximately 7.8–8.4 seconds locally. This remains a performance limitation. Ordinary lens timings include screenshot capture, so they do not establish a sub-150ms interaction target. There is no comparable old workspace baseline because this is a new route. No FPS or one-symbol render-count claim is made.

Evidence directories:

```text
/home/novius2/trading-stack/output/playwright/trading-analytics-20260907/
/home/novius2/trading-stack/output/playwright/trading-analytics-public-20260907/
```

Each contains `results.json`, viewport/lens PNGs, four axe JSONs and four actual option CSV downloads. Screenshots and market exports remain outside Git. Desktop exact-contract charts and mobile Morning Brief were visually inspected: tables scroll internally, identity/CE/PE labels are distinct, dates accompany multi-session chart timestamps, and mobile content stacks vertically.

## Failures found and resolved during testing

- Nested `main` landmark and inaccessible scroll regions: replaced feature main with a labelled section and made source regions focusable.
- Initial wrong strike conversion: corrected against canonical instrument-master units and verified real CE/PE data.
- Test initially mistook the active participant chart for an inactive chart; assertion now checks only genuinely chart-free lenses.
- First post-recreate login encountered startup 502; readiness was checked before final runs.
- An ad-hoc smoke script initially ran outside the Playwright dependency directory; rerun from `tools/playwright` succeeded.

## Reproduce and rollback

Run `tools/playwright/trading-analytics-regression.mjs` from the repository with `PLAYWRIGHT_ADMIN_PASSWORD` supplied only from protected runtime configuration. Optional `PLAYWRIGHT_BASE_URL` selects the public origin; `PLAYWRIGHT_OUTPUT_DIR` isolates evidence. Never place credentials in source or logs.

To disable the new workspace, set `N50_TRADING_ANALYTICS_ENABLED=false` in protected deployment configuration, then rebuild and recreate only `n50-dashboard` from a clean pushed master. Preserve additive source/evidence tables. Do not revert existing strategy or ledger data. No scheduled morning job or paper/live execution was activated by this release.
