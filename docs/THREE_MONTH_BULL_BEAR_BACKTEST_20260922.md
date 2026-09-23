# 3Month Bull/Bear selector and daily backtest

Date: 22 September 2026  
Canonical source: `/home/novius2/trading-stack`

## Live strategy contract

Bull requires all six higher-timeframe comparisons:

1. current month close/current price > current month open;
2. current month close/current price > previous month open;
3. current week close/current price > current week open;
4. current week close/current price > previous week open;
5. current day close/current price > previous trading-day open;
6. current day close/current price > current day open.

It additionally requires any one of M-1, M-2 or M-3 close < its own open.
After that preselection, both current 1H comparisons and both current 15m
comparisons are mandatory. Completed mode uses only complete, gap-free candles;
forming mode is explicitly labelled.

Bear is the exact inverse: every mandatory comparison uses `<`, while the
three-month OR group passes when any M-1/M-2/M-3 close is greater than its own
open. Missing evidence stays unavailable and downstream intraday gates remain
skipped until higher-timeframe preselection passes.

The existing bullish top-level API fields remain backward compatible. Additive
`bull` and `bear` evaluations carry exact arithmetic for both directions.

## UI

- Home exposes a dense Bull/Bear board with Month, Week, Day, grouped
  M-3/M-2/M-1 OR ticks, 1H and 15m evidence. The historical OR group is one
  scored condition, so the live screen score is out of 11: ten mandatory
  comparisons plus one historical reversal group. Passing two or three prior
  months never awards more than one point.
- Clicking a symbol opens exact arithmetic; qualification requires all ten
  mandatory gates plus the grouped OR condition.
- The 3Month page has a Bull/Bear selector and downloads the selected
  direction's exact evidence.
- The home trading shortlist treats qualified Bull as LONG and qualified Bear
  as SHORT without creating an order.
- `/backtesting/reports` is a top-level Backtest Reports destination with direct
  PDF and CSV downloads.

## Historical report method

Generator:
`tools/reports/three_month_reversal_backtest.mjs`

Output directory (ignored runtime evidence):
`platform/nifty_stratlab/outputs/three_month_reversal_20260922/`

Source coverage used in this run:

- `strategy_eval.stock_daily_regime`;
- 500 retained symbols;
- 14 months loaded for warm-up;
- evaluation window 7 August 2025 through 7 August 2026;
- 15,042 fresh false-to-true qualification transitions.

The daily report evaluates the six higher-timeframe gates and the three-month
OR group. It does not claim historical 1H/15m confirmation because the retained
minute store does not span the requested year.

The user-requested entry at the signal day's open is included as a
**retrospective look-ahead scenario**: today's close is required to know that
the daily conditions pass, so that entry was not knowable at the open. The
report's causal comparison enters at the next retained trading-day open.

For each fresh signal the CSV records direction-adjusted 1/5/15-session return
and the 15-session path drawdown, together with exact gate/reference evidence.
The PDF contains the formula/overall summary on one page, one full-page
Daily/Weekly/Monthly chart review per stock, and one or more immediately
following trade-evidence pages for that stock. Blue upward markers are Bull
qualifications and yellow downward markers are Bear qualifications. Daily
markers retain exact signal dates.
Weekly and Monthly markers aggregate those dated events into their containing
period; `×N` is the count of dated events and does not classify the whole
candle. Purple is EMA9 and green/red are candle direction.

The Daily chart additionally shows dashed month boundaries, dotted week
boundaries, and separate Monthly/Weekly open and retrospective final-close
segments. Retrospective closes are explicitly labelled so they are not treated
as values known at period open. The CSV now carries current Month/Week/Day
OHLC references, previous Month/Week/Day references, and M-2/M-3 open/close
values for every emitted qualification.

Bull and Bear are mutually exclusive for the same stock and date. The current
monthly candle is nevertheless re-evaluated at every daily close, as required
by the live strategy. It may cross its month-open references and qualify Bull
on one date and Bear on a later date within the same still-forming month. The
old report collapsed those distinct daily events onto one monthly candle,
which looked like a contradictory candle classification. That presentation has
been removed. The generated validation now fails if an opposite-direction
same-date pair is ever emitted.

## Current run summary

| Direction | Basis | Signals | Avg 1D | Avg 5D | Avg 15D | Max 15D | Min 15D | Worst drawdown |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| Bull | same-day open, look-ahead | 7,959 | 2.32% | 2.44% | 2.60% | 65.42% | -62.54% | -62.94% |
| Bull | next-day open, causal | 7,959 | -0.09% | -0.06% | 0.15% | 50.28% | -63.30% | -63.69% |
| Bear | same-day open, look-ahead | 7,083 | 2.03% | 1.93% | 1.83% | 71.56% | -36.09% | -40.06% |
| Bear | next-day open, causal | 7,083 | 0.12% | 0.05% | -0.25% | 67.93% | -40.82% | -41.08% |

The large difference between the look-ahead and causal rows is evidence that
the same-day-open assumption materially inflates results.

## 23 September 2026 chart and stock-evidence refresh

The current downloadable artifact is
`platform/nifty_stratlab/outputs/three_month_reversal_20260923/`.
It retains the same 500 symbols, 15,042 validated transitions, zero invalid
signals and zero opposite-direction same-date signals. Strategy results did
not change; only evidence presentation and exported reference completeness
changed.

- PDF: 1,813 A4 landscape pages: one overall summary, 500 stock chart pages and
  1,312 stock trade-evidence pages.
- CSV: 15,042 rows with every required Monthly/Weekly/Daily reference column.
- Visual evidence:
  `/home/novius2/NIFTY50/evidence/three-month-report-period-evidence-20260923/`.
- Web validation: typecheck, 280/280 tests and production build passed.
- API validation: typecheck, 269/269 tests and build passed.
- Authenticated production regression: 13/13 checks passed, including report
  identity, file availability, strategy validation, period-overlay disclosure,
  stock-table disclosure and zero browser page errors.
- Deployed source: `3b94900`; production image:
  `trading-stack-n50-dashboard:three-month-stock-pages-20260923-3b94900`.
- Rollback image:
  `trading-stack-n50-dashboard:before-three-month-stock-pages-20260923`.

## Stock-wise summaries and trade evidence

The report now places one or more paginated trade-evidence pages immediately
after every stock chart page. The stock summary is repeated on those pages and
the table exposes:

- exact signal date and Bull/Bear direction;
- signal-day open, clearly labelled look-ahead;
- next-day causal entry and 1D/5D/15D/drawdown outcomes;
- all six Monthly/Weekly/Daily mandatory equations and pass states;
- M-1, M-2 and M-3 open/close equations and individual pass states;
- the combined ANY-1 historical reversal result.

The CSV remains the complete machine-readable ledger. Missing results stay
unavailable rather than becoming zero.

The current PDF uses 14 trade rows per evidence page so no final row is clipped
at A4 landscape size. Its `summary.json` records the page contract:

```text
overall              1
stock charts       500
stock evidence   1,312
total pages       1,813
```

The generated PDF is 73,077,959 bytes and the CSV is 8,113,744 bytes. The
stock-table visual sample is:
`/home/novius2/NIFTY50/evidence/three-month-report-period-evidence-20260923/page-003-stock-trades.png`.

## 3Month Strategy page

The same historical evidence is available directly on `/strategy/three-month`
below the independent live screener:

- the four-row overall Bull/Bear, look-ahead/causal summary remains visible;
- a scrollable stock-wise matrix shows Bull and Bear counts, average 1D/5D/15D,
  maximum/minimum 15D and worst 15D drawdown for all 500 stocks;
- selecting a stock fetches only that stock's historical rows and exposes the
  signal date, signal-day look-ahead open, next-day causal entry and causal
  outcomes;
- every selected-stock row shows exact Month/Week/Day equations, M−1/M−2/M−3
  open-close values, their individual pass states and the ANY-1 OR result.

The read-only endpoint
`/v1/backtesting/reports/three-month/evidence` caches the mounted CSV after its
first parse. The summary response does not send all 15,042 trade rows to the
browser; `?symbol=...` returns details on demand. This is presentation of the
existing report calculation, not a second strategy implementation.

## Rerun

```bash
cd /home/novius2/trading-stack
node tools/reports/three_month_reversal_backtest.mjs
```

The PostgreSQL container and retained research table must be available. The
script is read-only and writes only under the ignored StratLab output root.

## Limitations

- Current/cohort membership can introduce survivorship bias.
- This run uses daily data and excludes historical intraday confirmation.
- Fees, slippage, liquidity, capital overlap and position sizing are excluded.
- Corporate-action quality follows the retained source.
- Missing forward horizons remain blank, never zero.

## Validation and release

### Current stock-wise release (`3b94900`)

- Web: typecheck, 280/280 tests and production build passed.
- API: typecheck, 269/269 tests and production build passed.
- Canonical repository gate and `git diff --check` passed.
- The regenerated PDF has 1,813 pages, exactly matching the page contract in
  `summary.json`; all 15,042 signal rows are represented across the stock-wise
  evidence tables and CSV.
- Generated validation reports zero invalid signals and zero opposite-direction
  signals for the same stock/date.
- Authenticated production Chromium passed 13/13 focused checks with no page
  errors. Evidence is under
  `/home/novius2/NIFTY50/evidence/three-month-stock-trade-pages-20260923/`.
- Production is healthy with zero container restarts on image
  `trading-stack-n50-dashboard:three-month-stock-pages-20260923-3b94900`.
- Rollback image:
  `trading-stack-n50-dashboard:before-three-month-stock-pages-20260923`.

### Prior chart-only release history

- Web: typecheck and production build passed; 271/271 tests passed.
- API: typecheck and production build passed; 264/264 tests passed.
- Canonical repository gate and `git diff --check` passed.
- Regenerated PDF: 501 pages, 10,832,853 bytes. The combined formula/summary
  page and a stock evidence page were visually inspected. The complete CSV is
  6,045,431 bytes. All 15,042 emitted signals passed all six historical
  mandatory gates and at least one M-1/M-2/M-3 OR gate; invalid signal count is
  zero. Opposite-direction signals for the same stock/date are also zero. There
  are 1,002 stock-months with dated intramonth direction changes; these remain
  separate Daily events and are no longer collapsed onto a Monthly candle.
- Authenticated production Chromium passed 10/10 focused checks with no page
  errors. It verified the deployed report identity, six mandatory historical
  gates, zero invalid signals, the reduced summary contract, PDF/CSV files,
  visible summary columns, removed metrics and the Bull/Bear marker legend.
  Evidence is under
  `/home/novius2/NIFTY50/evidence/three-month-report-redesign-20260922/`.
- Code commits `3380192` and `01b72fe` are pushed to `master`; the reusable authenticated
  regression is `tools/playwright/three-month-report-regression.mjs`.
- Only `n50-dashboard` was recreated. It is healthy on image
  `sha256:9ce3ef95ffa08bd183e9d8eebd329645b29777cbafe56486e9b6ea3d369f4cdf`
  with zero restarts.
- Rollback image:
  `trading-stack-n50-dashboard:before-three-month-direction-clarity-20260922`.
