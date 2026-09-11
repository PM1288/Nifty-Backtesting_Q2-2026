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

Bounded prior-report acquisition uses
`POST /v1/fii-reports/fovolt/backfill`. The archive backfill is limited to 366
calendar days per request, retains per-date failures and never joins target
prices during selection. `GET /v1/futures-volatility/backtest?from=YYYY-MM-DD&to=YYYY-MM-DD`
then performs a read-only matched-versus-nonmatched next-session outcome study
over loaded immutable revisions.

The loader verifies that the report date and every calendar day through the
next trading session exist in `public.trading_calendar`. Missing calendar
coverage produces `CALENDAR_COVERAGE_GAP` and no target session; it never jumps
to the next available distant row.

## Archive-assumed historical evaluation recorded on 11 September 2026

A temporary, non-committed evidence run downloaded 1 June–10 September 2026
directly from the NSE archive and joined it read-only to canonical EQ daily
prices. This is a screen-outcome study, not a trading simulation.

- 73 reports downloaded; 16,065 physical rows; 821 fixed-rule matches.
- 26 June was explicitly unavailable from the archive.
- 20 downloaded reports were excluded because the canonical calendar has a
  coverage gap from 21 June through 19 July or could not resolve a verified
  next session.
- 9,003 complete symbol/session outcomes remained across 43 independent target
  sessions: 410 matches and 8,593 same-report nonmatches.
- Matched mean absolute open-to-close movement was 1.4841%, versus 1.1340% for
  covered nonmatches, a descriptive difference of +0.3502 percentage points.
- Matched mean low-to-high range was 3.0127%, versus 2.3760%, a descriptive
  difference of +0.6367 percentage points.
- Matched signed open-to-close mean was -0.1609%, versus -0.0804%; increased
  volatility did not encode bullish direction.
- At the date-cluster level, matched absolute movement exceeded the same-day
  benchmark on 36 of 43 covered sessions. No statistical significance or
  executable profitability claim is made.

Raw downloaded reports and generated study files remain outside Git at
`/tmp/fovolt-backtest-20260911-jun-sep/`. Their timing mode is
`ARCHIVE_TIMING_ASSUMED`: downloading historical archives today does not prove
they were known before the historical target-session open.

## Verification recorded on 11 September 2026

- Supplied package reference: 34/34 tests passed.
- Production parser against supplied `FOVOLT_10092026.csv`: 221 rows, 18
  positive deltas, four strict matches in order: ATHERENERG, FORCEMOT,
  BLUESTARCO, IDEA.
- Independent live NSE archive check for 10 September 2026 returned the same
  filename, 221 rows, four matches and SHA-256
  `53c843d41f3e2c1cd5adf651117a3a89e321cab75cdc9e66c7ee5c1ffe9758a5`.
- Migration parsed successfully in a transaction that was rolled back.
- Report-service tests: 38/38 passed in an isolated Python 3.12 container.
- Platform API: typecheck and build passed; 207/207 tests passed.
- Web: typecheck and production build passed; 162/162 tests passed.
- Synthetic browser regression passed at 1440x900 and 390x844.
- Canonical repository source gate passed.
- Browser evidence uses a clearly labelled synthetic response and is stored
  outside Git under `tools/playwright/output/futures-volatility/`.

No database migration, source-row load or production deployment was performed.
The archive-assumed study above was executed outside production against a
temporary report set and read-only canonical prices; the production-backed
dashboard endpoint cannot return that evidence until an authorised migration
and immutable source-row load are completed.
