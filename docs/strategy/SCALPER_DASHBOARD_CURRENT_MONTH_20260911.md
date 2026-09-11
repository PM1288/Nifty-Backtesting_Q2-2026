# Scalper Dashboard — current-month stock screener

Date: 11 September 2026

Branch: `feat/strategy-scalper-dashboard`

Release state: built and tested in an isolated candidate; not deployed

## Outcome

The Strategy menu now contains a separate **Scalper Dashboard** at
`/strategy/scalper-dashboard`. It is a read-only filter and evidence table for
the current NSE stock F&O universe. It does not replace the Home progression,
Scalper V1/V2, or any Monthly strategy/backtest.

The table contains these raw price anchors for every resolved stock:

| Scope | Values |
| --- | --- |
| Current | current instrument-state price and its observation time |
| Day | current-day open and close/as-of; previous-day open and close |
| Week | current-week open and close/as-of; previous-week open/close; two-weeks-ago open/close |
| Month | current-month open and close/as-of; previous-month open/close; two-months-ago open/close |

The five visible filter states mirror the current Monthly Open v3 definitions:

1. two-months-ago close below its open;
2. previous-month close above its open;
3. today open above current-week open;
4. today open above previous-week open;
5. today open above previous-day open.

These are current screener states, not newly persisted backtest candidates.
Missing inputs produce `Missing`, never zero or a fabricated pass/fail.

## Data lineage

- Universe: active stock futures/options underlyings in the canonical
  `instrument_universe`, resolved to active NSE equity identities.
- Daily source precedence: `strategy_eval.stock_daily_regime`, then
  `nse.fact_eod_prices`, then `bars_1d`; current-day instrument state has the
  existing highest current-day precedence.
- Company and sector: `instrument_profiles`, with explicit symbol/`OTHER`
  fallback when profile metadata is absent.
- No new collector, subscription, schema or trading permission was added.

The source query originally used functions on joined symbol columns and took
17-30 seconds in the isolated live-backed environment. Exact indexed joins,
including the governed `LTM`/`LTIM` alias, reduced measured requests to
705 ms cold and 150-275 ms on subsequent API/export calls while preserving
the 210-stock cohort.

## Filtering and export

The UI provides stock/company/sector search, sector selection, score filters,
and independent Pass/Fail/Missing filtering for every condition. The table is
horizontally contained on desktop and mobile with a sticky stock identity.

`GET /v1/overview/scalper-progression/export` downloads an Excel-readable
`.xls` SpreadsheetML workbook. Its `Current month` sheet includes all raw
numeric anchors and condition states; the `Scope` sheet includes session,
generation time, universe, basis, row count and strategy reference. The export
always contains the full response cohort, not only currently visible UI rows.

## Verification evidence

- Web typecheck: PASS.
- Web unit suite: PASS, 155/155.
- Web production build: PASS.
- API typecheck/build: PASS.
- API unit suite: PASS, 198/198.
- Authenticated isolated Chromium: PASS, 16/16 checks at 1440x900 and 390x844.
- Real response: 210 rows, five condition states per row and every requested
  anchor key present.
- Table geometry: desktop scroller 1346 CSS px viewport / 3159 CSS px content;
  no accidental page-level horizontal overflow on desktop or mobile.
- Excel download: PASS with `.xls` filename, full anchor headings and declared
  universe scope.
- Browser exceptions: none.
- Candidate screenshots and JSON are under
  `/tmp/scalper-dashboard-regression` and are intentionally not committed.

Run browser acceptance with protected credentials supplied through the
environment:

```bash
PLAYWRIGHT_BASE_URL=http://127.0.0.1:15187 \
PLAYWRIGHT_AUTH_ORIGIN=https://n50.nifty50today.co.in \
PLAYWRIGHT_ADMIN_PASSWORD='from protected environment' \
node tools/playwright/scalper-dashboard-regression.mjs
```

## Preservation and release

Monthly Close/Open calculations and stored runs were not modified. Scalper
V1/V2, Trade Log, SHAP Research, Today, Paper Trading, authentication,
notifications, collectors and no-order protections remain in place. The
isolated candidate container used live authoritative PostgreSQL read access but
did not replace the production container. Deployment requires merge to
`master` and the separate authorised release procedure.
