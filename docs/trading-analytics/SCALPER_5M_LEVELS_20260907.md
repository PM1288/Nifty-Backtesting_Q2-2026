# Scalper chart preferences and resistance overlays

Branch `ui/scalper-5m-levels-20260907`. Scope: Trading Analytics charts only; no orders, collector changes or database writes.

- Missing/invalid Scalper interval now defaults to 5 minutes. Explicit 15/60 selections remain supported.
- One-day view defaults to the latest retained NIFTY session, labelled by IST date. Other retained sessions and all-days view are selectable in URL state. Filtering is presentation-only: EMA still uses full source history and CSV exports keep all retained bars.
- Rising candles green, falling candles red in Scalper and Market Structure. NIFTY alone has a toggle for 50-point grid spacing; option axes remain independent.
- Monthly/weekly/daily resistance overlays reuse the existing backend `levels` engine: bearish open, largest bearish body then recency, later completed same-timeframe close strictly above breaks resistance, no resurrection and equality is a touch. Selected R must be above the as-of NIFTY price. Origin, full candidate set, break evidence, lookback and state are inspectable.
- Monthly lookback: 12 completed months, as documented. Daily/weekly counts are intentionally unset until chosen in the UI or supplied as `dailyLookback` / `weeklyLookback` query parameters. They are not hidden trading defaults. Test requests use 20/12 explicitly, without persisting production settings.
- All levels are **PREVIEW / UNAPPROVED**, not approved recommendations. Insufficient retained bars and unconfigured lookbacks display explicit states. Original revisions and session completeness remain uncertified. Daily eligibility uses the conservative IST calendar-day end; weekly/monthly use the next period boundary. Forming periods cannot establish levels. Resistance reflects the page as-of snapshot, not a claim of historical availability merely because a past chart day is selected.

Source policy: `The_Nifty_Options_stragty-2/Trading_Analytics_Story_and_Implementation_20260907_v1_0.md`, section 8.1. The source does not specify weekly/daily counts and contains conflicting ranking descriptions; this release does not silently approve one for trading.

## Completed validation and deployment

- Application commits: `65287b1` and `b2077c2`, pushed on the feature branch and merged into pushed master before building.
- Deployed dashboard image: `sha256:58033a33bd2f248854906a2329e9b1c31708ad8499018f5e9d11c27657b36ff3`. Only `n50-dashboard` was recreated.
- API unit tests: 165 passed, 0 failed. Web unit tests: 77 passed, 0 failed. Both typechecks, builds and canonical repository gate passed.
- Authenticated deployed browser checks: 22 passed, 0 failed at 1440px and 390px. Checks cover defaults, URL state, day filtering, configurable resistance evidence, no order eligibility, overflow and uncaught JavaScript. Both main-content axe scans have zero violations; this is not a whole-application accessibility certification.
- Evidence: `/home/novius2/trading-stack/output/playwright/scalper-5m-20260907/` contains `results.json`, `1440-scalper.png`, `390-scalper.png`, per-width axe results and resistance response snapshots. Screenshots wait for charts to finish loading. Their 20-day/12-week lookbacks are explicit test selections, not production defaults.
- Browser rerun: `node tools/playwright/trading-analytics-scalper-5m.mjs` with `PLAYWRIGHT_ADMIN_PASSWORD` supplied through the protected environment, never committed or printed.
- Live route: `https://n50.nifty50today.co.in/n50/strategy/trading-analytics?view=scalper`.
- NIFTY grid ticks are anchored to multiples of 50. Enabled resistance overlays expand the NIFTY axis so all selected levels remain visible. Disable resistance for a closer intraday price view. Option chart scales remain independent.

Remaining choice: daily and weekly lookback counts must be selected explicitly. Resistance remains unapproved preview evidence, not execution eligibility. Existing OI bins remain 15-minute quote bins; selecting 5-minute candles does not mislabel OI as 5-minute data.

Rollback: revert the two scoped application commits on a new reviewed branch, push/merge master and rebuild only `n50-dashboard` using the canonical deployment procedure. No migration rollback is needed. Test/documentation-only commits after `b2077c2` require no runtime rebuild.
