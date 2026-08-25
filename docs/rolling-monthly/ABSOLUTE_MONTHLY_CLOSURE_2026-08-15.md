# Absolute Monthly Closure — implementation and validation

Date: 15 August 2026
Strategy version: `absolute_monthly_closure_bullish_long_v1`
Dashboard: `https://n50.nifty50today.co.in/n50/strategy/rolling-monthly?view=absolute`

## Outcome

This is a new LONG-only, absolute calendar-month research variant inside Rolling Monthly. It is
independent from OIIS, Paper Trading and the existing last-Tuesday expiry variant. Existing views,
routes and calculations were not replaced.

The replay covers 36 calendar months from September 2023 through August 2026 over the current,
normalised stock F&O universe (218 symbols; `LTIM` is normalised to `LTM`). It produced 943 visible
opportunities. Five current August paths are incomplete and remain visible but are excluded from
performance summaries; 938 paths are performance-eligible.

## Governed point-in-time rules

For each symbol and calendar month, the engine selects only the first session where all seven checks
pass:

1. M−2 close is below M−2 open.
2. M−1 close is above M−1 open.
3. M−1 close is above M−2 open.
4. Signal close is above the current calendar week's open.
5. Signal close is above the previous calendar week's open.
6. Signal close is above the previous session's open.
7. Signal close is above the signal session's open.

The research entry is the qualifying session close. That is the first time all daily/weekly closing
conditions are known. Signal-session high/low are not used for MFE/MAE because daily OHLC cannot
prove whether those extremes occurred before or after the close. MFE/MAE begins on the next exchange
session. Evaluation ends at the last exchange session in the same calendar month. An unfinished month
is `DEVELOPING`; a missing expected path is `INCOMPLETE`, not a fabricated return.

## Data policy and critical correction

Primary historical OHLC is `strategy_eval.stock_daily_regime` from Yahoo Finance. Its OHLC is
split-adjusted, which keeps pre/post-corporate-action prices on one scale. Official NSE EOD bhavcopy
and SmartAPI REST daily bars fill only newer sessions not present in Yahoo history. The selected source
is stored per entry and path.

The first replay exposed false −90%/−76% paths caused by mixing raw pre-split NSE values with adjusted
fallback values. Those results were rejected. The corrected implementation:

- uses Yahoo split-adjusted OHLC first;
- adds an indexed `(yahoo_symbol, trade_date)` lookup;
- quarantines unresolved daily price-scale discontinuities beyond 1.5× or below 2/3×;
- records the adjustment policy in every candidate's provenance;
- excludes `INCOMPLETE` paths from all aggregate performance and hypothetical P&L.

Current F&O membership is applied retrospectively because point-in-time historical F&O membership is
not available in the repository. Results are therefore a current-universe research study, not a
survivorship-bias-free historical universe test.

## Replay results

All returns below are gross before costs and taxes. Hypothetical rupees use equal ₹100,000 research
notional independently for every opportunity; they are not a capital-constrained portfolio simulation.

| Period | Eligible | Winners | Losers | Average end return | Average max profit | Worst drawdown | Hypothetical net |
|---|---:|---:|---:|---:|---:|---:|---:|
| 2023 partial | 135 | 81 | 54 | +3.01% | +8.25% | −23.40% | +₹406,724.96 |
| 2024 | 267 | 149 | 116 | +2.41% | +8.23% | −26.82% | +₹642,211.21 |
| 2025 | 306 | 162 | 143 | +0.23% | +6.24% | −42.96% | +₹70,802.53 |
| 2026 through 14 Aug | 230 | 105 | 124 | −0.98% | +5.45% | −30.44% | −₹224,287.09 |
| Total | 938 | 497 | 437 | +0.95% | +6.90% | — | +₹895,451.62 |

Four eligible observations ended flat. The large dispersion and negative 2026 result show that the
seven candle conditions identify opportunities but do not, by themselves, constitute an approved
positive-expectancy production strategy.

### August 2026

- 35 qualifying signals are visible.
- 30 paths are complete through 14 August and included in summaries.
- 5 paths are through 13 August only and marked `INCOMPLETE`.
- Eligible to-date average return: −1.15%.
- Eligible equal-notional hypothetical result: −₹34,359.14.

Point-in-time reconciliation example, JUBLFOOD on 3 August:

- M−2: ₹417.60 close < ₹430.00 open.
- M−1: ₹438.25 close > ₹418.20 open and > ₹430.00 M−2 open.
- Signal close ₹470.00 > current-week open ₹439.95, previous-week open ₹420.80,
  previous-day open ₹441.00 and signal-day open ₹439.95.
- To 14 August: ₹504.10, +7.26%; post-entry MFE +10.85%; MAE −1.79%.

## Delivered surfaces

- Additive PostgreSQL tables: `rolling_monthly.absolute_month_run` and
  `rolling_monthly.absolute_month_candidate`.
- Daily daemon refresh plus idempotent `backfill-absolute` and `export-absolute` commands.
- Authenticated API:
  - `GET /v1/rolling-monthly/absolute-months`
  - `GET /v1/rolling-monthly/absolute-months/export`
  - `GET /v1/rolling-monthly/absolute-month-candidates/{candidateId}/chart`
- Dashboard year/month filters, monthly chart, yearly summary, complete evidence table, CSV/Excel
  download, and stock-click daily candlestick chart with month dividers and a blue entry marker.

## Files and artefacts

- Excel: `/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/output/rolling-monthly/absolute-monthly-20260815/ABSOLUTE_MONTHLY_CLOSURE_3Y_ANALYSIS.xlsx`
- CSV: `/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/output/rolling-monthly/absolute-monthly-20260815/ABSOLUTE_MONTHLY_CLOSURE_3Y_TRADES.csv`
- Browser evidence: `/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/output/playwright/rolling-monthly-absolute-20260815/`
- OpenAPI source package: `/home/novius2/NIFTY50/backend-openapi-documentation-2026-08-13/`
- Validated OpenAPI ZIP: `/home/novius2/NIFTY50/backend-openapi-documentation-2026-08-15.zip`

## Validation record

- Rolling Monthly Python suite: 14/14 passed.
- Dashboard API suite: 99/99 passed.
- Web suite: 27/27 passed.
- Web typecheck and production build passed.
- OpenAPI: 18 specifications, 596 operation instances, zero validation errors.
- Disposable migration upgrade was applied and removed successfully before live migration.
- Excel ZIP integrity passed; CSV contains 944 lines (header + 943 opportunities).
- Corporate-action artefacts BAJFINANCE/ADANIPOWER/MAZDOCK no longer appear as false scale losses.
- Existing current/expiry dashboard regression: 57/57 passed; dedicated expiry/candlestick regression: 34/34 passed.
- Live `n50-dashboard` and `rolling-monthly` containers are healthy with restart count zero after deployment.
- SHA-256: workbook `2e7277ef7c836f938ae102df7f2dd393173d5c0d87cd34389960d2e3b7a3bb28`; CSV `9e93aa7eb6cf230c42a6066d43d196e3ff4461c143a26404270818592933d46b`; OpenAPI ZIP `6fcc2db8f37d042c794aecdea3ea89406e3ca8c8670ab10083de042b5e8473f1`.

The initial browser test correctly failed on a `bigint` Yahoo-volume serialization defect. The chart
query now casts volume to a JSON-safe numeric type and uses the indexed symbol lookup; the final
browser evidence is recorded only after the rerun passes.

## Rollback

1. Remove/hide only the `view=absolute` navigation item and new API registrations in a prior image.
2. Stop/revert only `trading-stack-rolling-monthly:2.2.0` if the refresh worker must be disabled.
3. Leave additive run/candidate records and lookup index intact; no destructive rollback is required.
4. Existing candidates, expiry history, OIIS and Paper Trading require no restart or migration rollback.

Live pre-change backup: `/home/novius2/trading-stack/backups/absolute-monthly-20260815T092000Z`.
