# Monthly Open strategy

Date: 10 September 2026

Strategy version: `absolute_monthly_open_bullish_long_v1`

Dashboard: `/n50/strategy/monthly?entryMethod=MONTHLY_OPEN`

## Outcome

Monthly Open is an additive, LONG-only research backtest beside the unchanged
`absolute_monthly_closure_bullish_long_v1`, now labelled **Monthly Close** in
the unified Monthly Strategy page. It does not replace the gap-aware First
Session method, the expiry method, OIIS, Paper Trading, or any broker action.

## Rule contract

The open model retains the existing red-to-green monthly reversal context but
makes every cross-period decision comparison from opening values known at the
signal-session open:

1. M-2 close < M-2 open (red-candle definition).
2. M-1 close > M-1 open (green-candle definition).
3. M-1 open > M-2 open.
4. Signal-session open > current-week open.
5. Signal-session open > previous-week open.
6. Signal-session open > previous-session open.
7. Signal-session open > previous-session close.

The first two conditions necessarily retain both open and close because a
candle's colour cannot be defined from its open alone. No signal-session close
is used to select a Monthly Open candidate. The research entry is the exact
signal-session open. Same-session high and low are eligible after that open;
the outcome remains the final available close in the same calendar month.

Monthly Open computes its informational EMA9 from the calendar-month **open**
series. Monthly Close continues to compute its informational EMA9 from closes.
Neither EMA is a hidden entry gate.

## Data and point-in-time policy

- Yahoo split-adjusted daily OHLC remains primary.
- NSE EOD and SmartAPI daily bars remain newer-session fallbacks.
- Expected NSE sessions and missing paths retain the existing fail-closed rules.
- Current stock-F&O membership is applied retrospectively, so results have
  survivorship bias until point-in-time membership is available.
- Results are gross before costs, taxes, slippage, liquidity, and capital overlap.

## 36-month replay captured on 10 September 2026

Source end: 10 September 2026. Current recognized stock-F&O universe: 268.

| Metric | Monthly Open |
| --- | ---: |
| Selected candidates | 92 |
| Evaluable paths | 92 |
| Positive / negative | 61 / 31 |
| Average end return | +4.0029% |
| Average maximum profit | +9.8919% |
| Worst observed drawdown | -30.7793% |
| Equal ₹100,000 per opportunity gross sum | +₹368,268.02 |

September 2026 is developing and currently contains NIACL (1 September) and
GRASIM (4 September). Developing rows are visible and must not be represented
as final month outcomes.

For comparison only, the independently persisted Monthly Close population at
the same database snapshot contained 1,127 evaluable candidates with +0.8003%
average end return. Different candidate counts are expected because the new
model uses strict open-to-prior-open/close confirmation and is not a relabelled
copy of close-selected trades.

## Implementation surfaces

- Python calculation and persistence: `services/rolling_monthly/src/rolling_monthly/absolute_month.py`, `service.py`, `main.py`.
- Daily/current-month daemon refresh plus `backfill-absolute-open` for replay.
- CLI CSV/XLSX generation via `export-absolute-open`.
- Authenticated API: `GET /v1/rolling-monthly/absolute-months?basis=open`.
- Authenticated export: `GET /v1/rolling-monthly/absolute-months/export?basis=open&format=csv|xls`.
- Unified dashboard filter: `Monthly Open`; legacy link `view=absolute-open` redirects to it.

## Verification and rollback

The calculation fixtures prove that a signal can qualify when its signal-day
close is bearish, provided every open gate passes. Existing Monthly Close tests
remain unchanged and passing.

Rollback is application-only: deploy the preceding dashboard/worker images and
remove the Monthly Open navigation option. Rows are isolated by strategy
version in the existing additive monthly run/candidate tables and may remain
dormant; Monthly Close rows are never overwritten.

## Released evidence

- Canonical commits: `3f3578672b1936948c8f6d02b3f9681bc656e800`
  (strategy/API/dashboard/backtest) and `99a0554` (direct Monthly Close and
  Monthly Open local tabs plus the deployed regression).
- `master` and `feature/monthly-open-strategy` are pushed to the canonical
  GitHub repository.
- Runtime images: dashboard
  `sha256:405fab542954ecf6c2782a106384c2d3edd942b94a5dd7434f928e42f1d084e9`;
  rolling worker
  `sha256:0146e31635db22fb4a336857aae7733fd397a49276c712cd865c94960ba942d7`.
  Both containers were healthy with zero restarts after release.
- Authenticated deployed browser checks: 28/28 at 1440x900 and 390x844. They
  verify both direct strategy tabs, the four-method selector, 92 persisted
  Monthly Open candidates, open-basis evidence, zero failed API responses and
  no document-level horizontal overflow. Runtime-only evidence:
  `/tmp/monthly-open-99a0554/`.
- Python strategy tests: 25/25. Web tests: 121/121. API tests: 193/193, including
  9/9 focused rolling-monthly tests. Web/API typechecks and production builds
  passed. The canonical repository gate passed.
- Export smoke test produced 92 rows in
  `ABSOLUTE_MONTHLY_OPEN_3Y_TRADES.csv` and a 44,919-byte
  `ABSOLUTE_MONTHLY_OPEN_3Y_ANALYSIS.xlsx` inside the worker's temporary export
  directory.
- Full service lint still reports three pre-existing `E702` findings in
  `rolling_window.py`; focused lint for the modified Python files passed.

Rollback images are
`trading-stack-n50-dashboard:pre-monthly-open-3f35786` and
`trading-stack-rolling-monthly:pre-monthly-open-3f35786`. The latter was rebuilt
from canonical pre-feature commit `c556858`; do not delete the additive Open
rows merely to roll back the application surface.
