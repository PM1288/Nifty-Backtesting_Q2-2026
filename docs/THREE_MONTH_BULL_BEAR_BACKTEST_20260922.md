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
  M-1/M-2/M-3 OR ticks, 1H and 15m evidence.
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

For each fresh signal the CSV records direction-adjusted 1/5/15-session return,
15-session maximum favourable excursion, 15-session maximum drawdown, and the
first session touching +3%. The displayed potential exit is a reporting
scenario only: first +3% touch, otherwise the fifteenth-session close. It is not
presented as a strategy-authored exit.

## Current run summary

| Direction | Basis | Signals | Mean 1D | Mean 5D | Mean 15D | Mean MFE | Mean MDD | +3% reached |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| Bull | same-day open, look-ahead | 7,959 | 2.32% | 2.44% | 2.60% | 9.04% | -4.04% | 86.15% |
| Bull | next-day open, causal | 7,959 | -0.09% | -0.06% | 0.15% | 6.53% | -5.96% | 64.28% |
| Bear | same-day open, look-ahead | 7,083 | 2.03% | 1.93% | 1.83% | 8.32% | -4.56% | 84.60% |
| Bear | next-day open, causal | 7,083 | 0.12% | 0.05% | -0.25% | 6.43% | -6.10% | 66.16% |

The large difference between the look-ahead and causal rows is evidence that
the same-day-open assumption materially inflates results.

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
