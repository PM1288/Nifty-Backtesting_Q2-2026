# Monthly and Rolling Strategy Validation Evidence

Date: 2026-08-23

## Delivered data state

- Governed universe: 268 unique profiles (`is_nse_fno OR is_nifty_largemidcap_250`).
- Calendar-month closure backfill: 36 months, 1,114 candidates; latest source date 2026-08-21.
- First-session scenarios: 36 months, 1,404 rows across 0.5% and 1.0% gap thresholds; latest source date 2026-08-21.
- Rolling 5/30/60 persisted backfill: 5,060 transitions from 2023-08-21 through 2026-08-20; source data through 2026-08-21.
- Expiry cohorts: 36 months from 2023-08 through 2026-07, 1,886 candidates. The optimized backfill completed in 1 minute 26.6 seconds after expanding the canonical lookback from 900 to 1,300 days and reusing one prepared frame.

## Tests and exact results

- Worker image: `trading-stack-rolling-monthly:2.2.0` — built successfully.
- Worker unit suite: `22 passed in 0.82s`.
- API tests: `116 passed, 0 failed`.
- Web tests: `43 passed, 0 failed`.
- API TypeScript: passed.
- Web TypeScript: passed.
- API production build: passed.
- Web production build: passed; 2,506 modules transformed.
- Clean Node 22 Docker build: passed.
- Playwright Chromium: `38 passed, 0 failed` at 1920×1080, 768×1024 and 390×844, including the legacy first-session redirect.
- Persisted rolling API: HTTP 200, 0.423 s, 1,730,957 bytes for the 2026 filter; 1,107 rows.
- Consolidated monthly API after full history: HTTP 200, 1.290 s, 36 cohorts and 1,886 expiry rows.
- Lint: failed with 64 errors and 26 warnings in pre-existing files. This is not relabelled as a warning; details are in `OPEN_ISSUES.md`.

## Migration evidence

- `db/050_monthly_strategy_consolidation.sql`: additive EMA9 and anchor columns/indexes.
- `db/051_rolling_window_strategy.sql`: additive persisted rolling candidate and refresh tables.
- Both migrations were tested on disposable databases before live application; disposable databases were dropped after validation.
- Live pre-change database backup:
  `/home/novius2/trading-stack/backups/monthly-strategy-consolidation-20260823T0938Z/rolling_monthly_before.dump`
- Database backup SHA-256:
  `2c69918d6c645706eecebcad2f11eed974140b2bcab85cbe8ec677cf6a1b47fa`
- Live UI source backup:
  `/home/novius2/trading-stack/backups/monthly-strategy-ui-20260823T1007Z/live-source-before.tgz`
- UI source backup SHA-256:
  `d898f1608da3757e5f55540b342f43f8fd0fe6677e418373d35a397c313d1f56`

## Deployment evidence

- Dashboard image: `trading-stack-n50-dashboard:latest`.
- Deployed image digest: `sha256:63318a321f1a9005d1d64f6f443620bbc43fa238398927e05c54ef9455463853`.
- Live dashboard container: running and healthy.
- Rolling worker container: rebuilt, deployed, and scheduled every 900 seconds.
- Public routes:
  - `/n50/strategy/monthly`
  - `/n50/strategy/rolling-monthly`
  - `/n50/strategy/rolling-monthly/legacy` (temporary rollback view)

## Responsive and visual evidence

Evidence folder:

`/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/output/playwright/monthly-strategy-consolidation-20260823-final`

It contains desktop, tablet and mobile captures for both dashboards plus `results.json`.

## Data reconciliation

- Monthly table entries are built from existing expiry, absolute-month and first-session canonical APIs; no screenshot values are hard-coded.
- ₹10,000 comparisons use whole-share quantity `floor(10000 / entry_price)`.
- Target counts use observed max-high paths at +1%, +3% and +5%.
- Developing 30-session rows remain labelled `DEVELOPING`; missing paths are not converted to zero.
- Monthly EMA9 is informational only and does not alter the existing entry gate.
