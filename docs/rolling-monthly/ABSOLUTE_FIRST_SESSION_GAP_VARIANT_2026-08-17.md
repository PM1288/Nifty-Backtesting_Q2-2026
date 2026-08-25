# Absolute Monthly First-Session Gap Variant

**Implemented:** 17 August 2026
**Strategy version:** `absolute_monthly_first_session_gap_fill_long_v1`
**Dashboard:** `/n50/strategy/rolling-monthly?view=absolute-first-session&threshold=0.20`

## Outcome

This is a new, isolated Absolute Monthly variant. It does not replace or change
`absolute_monthly_closure_bullish_long_v1`, and it is not connected to OIIS, Paper Trading,
expiry strategies or broker execution.

The variant evaluates eligibility before the first trading session opens, enters at that session's
open when there is no significant gap-up, and otherwise waits only within the same calendar month
for the opening gap to fill. A gap that does not fill produces a visible
`NOT_ENTERED_GAP_UNFILLED` research row, not a fabricated trade.

## Critical interpretation of the requested rule

The request contained two incompatible statements: "if there is no gap ... entries will not
happen" and "blind buy on first [session] ... if there is no gap up." The implementation follows
the latter, repeated trading instruction:

1. Freeze eligibility before the first session opens.
2. If the first-session gap-up is below the selected significant-gap threshold, buy at the first
   session open. A flat open, a small positive gap and a gap-down all follow this branch.
3. If the gap-up is at or above the selected threshold, wait for a touch of the previous session's
   close. Enter at that fill price on the first fill day within the month.
4. If the significant gap remains unfilled through the last available session of the same month,
   do not enter.

Both requested interpretations of "significant" are retained as governed comparison scenarios:
`0.20%` and `0.30%`. The threshold is explicit in the URL, API, tables, exports and database rows.

## Point-in-time eligibility rules

Only information available before the first trading session of month **M** is used:

| ID | Required condition |
|---|---|
| M01 | Month M-2 close is below month M-2 open (red candle) |
| M02 | Month M-1 close is above month M-1 open (green candle) |
| M03 | Month M-1 close is above month M-2 open |
| W01 | Last completed weekly close is above that week's open |
| W02 | Last completed weekly close is above the preceding completed week's open |

No first-session close, current-week close or future bar is used to determine eligibility. This
avoids look-ahead leakage. The UI shows all validator values and pass states for audit.

## Entry and path accounting

Definitions for an entered scenario:

```text
end_per_share       = last_available_month_close - entry_price
max_per_share       = maximum_post_entry_high - entry_price
drawdown_per_share  = minimum_post_entry_low - entry_price
end_return_pct      = end_per_share / entry_price * 100
max_return_pct      = max_per_share / entry_price * 100
drawdown_pct        = drawdown_per_share / entry_price * 100

quantity            = floor(10000 / entry_price)
invested             = quantity * entry_price
end_pnl_10000        = quantity * end_per_share
max_pnl_10000        = quantity * max_per_share
drawdown_pnl_10000   = quantity * drawdown_per_share
```

The ₹10,000 scenario uses whole shares and reports actual deployed capital, rather than silently
assuming fractional shares. The closed-month mark is the official last available session close.
The running month is explicitly marked to date.

For an entry at the first-session open, the first session's high and low are eligible extrema. For
a later gap-fill entry, that day's earlier intraday order is unknowable from daily OHLC. Therefore
the fill-day high/low are excluded from MFE/MAE, while its closing mark is retained. This is a
conservative daily-data chronology rule; finer data can supersede it in a later version.

The sums of maximum profit and maximum drawdown are **path-envelope sums**: each trade's individual
best or worst observation can occur at a different time. They are not simultaneously executable
portfolio P&L and are labelled accordingly in the dashboard.

## Three-year replay result

The replay covers 36 calendar months through 17 August 2026 over 218 normalized current stock-F&O
symbols. Each qualifying setup is evaluated under both gap thresholds.

| Metric | 0.20% gap threshold | 0.30% gap threshold |
|---|---:|---:|
| Qualifying scenarios | 566 | 566 |
| Entered | 524 | 526 |
| Significant gaps unfilled | 42 | 40 |
| Positive month-end results | 296 | 298 |
| Average entered end return | 1.96% | 1.97% |
| One-share end P&L sum | ₹9,591.06 | ₹10,566.59 |
| One-share maximum envelope | ₹97,472.00 | ₹99,019.24 |
| One-share drawdown envelope | −₹84,213.90 | −₹84,418.66 |
| Whole-share deployed capital | ₹4,565,825.04 | ₹4,585,728.80 |
| ₹10k-each end P&L | ₹91,660.42 | ₹92,444.02 |
| ₹10k-each maximum envelope | ₹402,462.32 | ₹405,278.54 |
| ₹10k-each drawdown envelope | −₹284,782.25 | −₹285,362.51 |

For August 2026, each threshold has 30 eligible scenarios: 23 entered and seven significant gaps
remain unfilled. The entered cohort's to-date average is −0.75%, and the ₹10,000-per-entered-stock
to-date P&L is −₹1,634.43. These are developing results, not final month outcomes.

### Data limitations

- Yahoo split-adjusted daily OHLC is primary; normalized NSE EOD/SmartAPI data provides the newer
  fallback sessions through the repository's existing adapter.
- Current stock-F&O membership is applied retrospectively, so historical aggregate results have
  current-universe survivorship bias.
- Daily OHLC cannot establish the ordering of an intraday high/low around a later gap-fill touch;
  the conservative chronology rule above prevents overstating that path.
- Results exclude fees, taxes and slippage and are research scenarios, not executable returns.

## Dashboard and downloads

The new `Absolute first session` tab contains:

- threshold, year and month filters;
- one-share final, maximum and drawdown totals;
- ₹10,000-per-stock invested capital, final P&L, maximum opportunity and drawdown;
- monthly and yearly summaries;
- a complete validator/outcome table;
- CSV and Excel downloads; and
- a clickable candlestick chart with an amber first-session line and blue entry annotation.

Local deliverables:

- `output/rolling-monthly/absolute-first-session-20260817/ABSOLUTE_MONTHLY_FIRST_SESSION_GAP_3Y_ANALYSIS.xlsx`
- `output/rolling-monthly/absolute-first-session-20260817/ABSOLUTE_MONTHLY_FIRST_SESSION_GAP_3Y_TRADES.csv`
- `output/rolling-monthly/absolute-first-session-20260817/ABSOLUTE_MONTHLY_FIRST_SESSION_GAP_3Y_DELIVERY.zip`

The workbook contains `Scenarios`, `Monthly Summary`, `Yearly Summary` and `Methodology` sheets.
The ZIP passed `unzip -tq`.

## Architecture changes

### Service

- `services/rolling_monthly/src/rolling_monthly/absolute_first_session.py`
- new backfill/export commands in `rolling_monthly.main`
- daemon refresh and durable persistence in `rolling_monthly.service`

### Additive database migration

- `db/sql/047_rolling_monthly_first_session_gap.sql`
- `rolling_monthly.absolute_first_session_run`
- `rolling_monthly.absolute_first_session_candidate`

The migration was applied twice to a disposable PostgreSQL database to verify idempotency, then
applied to production after backup. No existing table or row was replaced.

### API

- `GET /v1/rolling-monthly/absolute-first-session`
- `GET /v1/rolling-monthly/absolute-first-session/export`
- `GET /v1/rolling-monthly/absolute-first-session/{candidateId}/chart`

OpenAPI was regenerated and validated: 17 services, 18 specifications, 602 operations and zero
validation errors. Updated archive:
`/home/novius2/NIFTY50/backend-openapi-documentation-2026-08-17.zip`.

## Validation evidence

| Check | Result |
|---|---|
| Rolling Monthly Python suite | 20 passed |
| API suite | 101 passed |
| API and web type checks | Passed |
| Production dashboard build | Passed |
| New live Playwright regression | 24/24 passed |
| Existing Absolute Monthly non-regression | 28/28 passed |
| Disposable migration repeat | Passed |
| Workbook and ZIP integrity | Passed |
| Live containers | Healthy, restart count 0 |

Browser evidence:

- `output/playwright/rolling-monthly-first-session-20260817/`
- `output/playwright/rolling-monthly-absolute-nonregression-20260817/`

## Deployment and rollback

Production database backup:

`/home/novius2/trading-stack/backups/absolute-first-session-20260817/rolling_monthly_before_047.dump`

Rollback is isolated:

1. Recreate the previous `n50-dashboard` and `rolling-monthly` images.
2. Remove only the new UI route handling and new service command.
3. The additive tables can remain dormant without affecting existing variants. If schema removal is
   explicitly approved, export them first and drop only the two `absolute_first_session_*` tables.
4. Existing Absolute Monthly, expiry/history, OIIS and Paper Trading data remain untouched.

No live broker order or paper-trade order was placed by this implementation.
