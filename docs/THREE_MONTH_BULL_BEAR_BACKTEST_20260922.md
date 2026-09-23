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
The PDF intentionally does not duplicate the trade ledger. It contains the
formula/summary on one page and one full-page Daily/Weekly/Monthly chart review
per stock. Blue upward markers are Bull qualifications and yellow downward
markers are Bear qualifications. Daily markers retain exact signal dates.
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

## 23 September 2026 chart-evidence refresh

The current downloadable artifact is
`platform/nifty_stratlab/outputs/three_month_reversal_20260923/`.
It retains the same 500 symbols, 15,042 validated transitions, zero invalid
signals and zero opposite-direction same-date signals. Strategy results did
not change; only evidence presentation and exported reference completeness
changed.

- PDF: 501 A4 landscape pages.
- CSV: 15,042 rows with every required Monthly/Weekly/Daily reference column.
- Visual evidence:
  `/home/novius2/NIFTY50/evidence/three-month-report-period-evidence-20260923/`.

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
