# FOVOLT futures-volatility screener

## Scope

This change adds a separate read-only NSE `F&O - Daily Volatility` report
family and dashboard at `/futures/volatility`. It does not replace
`/options/volatility-signals`, modify its straddle/strangle model, or enable an
order path.

## Data and calculation contract

- Source: physical `FOVOLT_DDMMYYYY.csv` obtained server-side.
- Rule: `FOVOLT_FUT_DAILY_DELTA_GT_0001_V1`.
- Arithmetic: exact decimal current futures daily volatility minus exact
  reported previous futures daily volatility, strictly `> 0.0001`.
- Units: raw delta times 10,000 is volatility basis points.
- Target: the next verified trading session from `public.trading_calendar`.
- Outcome price source: `nse.fact_eod_prices`, `series='EQ'`; missing prices stay
  missing.

The migration is additive: `db/sql/058_futures_volatility_screener.sql`. It
stores immutable report revisions, every physical source field, deterministic
screen runs and every screened row. Do not truncate existing report tables.

## Operations

The FOVOLT pull is independent from participant OI, participant volume and FII
statistics. `FOVOLT_PULL_ENABLED=true` enables the existing scheduled service
owner to attempt it. Its failure is reported in `/health` and does not change
the core bundle's selected date. An authorised manual refresh uses
`POST /v1/fii-reports/fovolt/latest` through the authenticated platform proxy
after the migration is applied.

## Verification recorded on 11 September 2026

- Supplied package reference: 34/34 tests passed.
- Production parser against supplied `FOVOLT_10092026.csv`: 221 rows, 18
  positive deltas, four strict matches in order: ATHERENERG, FORCEMOT,
  BLUESTARCO, IDEA.
- Independent live NSE archive check for 10 September 2026 returned the same
  filename, 221 rows, four matches and SHA-256
  `53c843d41f3e2c1cd5adf651117a3a89e321cab75cdc9e66c7ee5c1ffe9758a5`.
- Migration parsed successfully in a transaction that was rolled back.
- Report-service tests: 35/35 passed in an isolated Python 3.12 container.
- Platform API: typecheck and build passed; 204/204 tests passed.
- Web: typecheck and production build passed; 162/162 tests passed.
- Synthetic browser regression passed at 1440x900 and 390x844.
- Canonical repository source gate passed.
- Browser evidence uses a clearly labelled synthetic response and is stored
  outside Git under `tools/playwright/output/futures-volatility/`.

No database migration, source-row load, production deployment or historical
backtest was performed by this implementation pass. Target-session outcome
claims remain unavailable until an authorised load and canonical price join
are executed.
