# Backtesting UI completion record

Completed and deployed on 3 August 2026.

## What was implemented

- A light analytical backtesting canvas inside the existing dark application shell.
- A sticky identity strip showing run, tested timestamp, data-through date, universe, capital, benchmark, and research state.
- A decision brief that explains the apparent contradiction in the latest run: closed trades made money while open-position mark-to-market losses pulled the ending portfolio below starting capital.
- Good, Bad, and Watch evidence cards separating supportive evidence, adverse evidence, and interpretation limits.
- Clear money labels for starting capital, ending portfolio, total portfolio return, after-tax realized P&L, open-position P&L, 35% profit-tax reserve, charges, benchmark excess, and drawdown.
- Light-theme ECharts with readable axes, labels, benchmark lines, and strategy colors.
- Compatibility-gated strategy comparison and an objective selector for return, drawdown, or closed-trade win rate. The UI no longer implies that one strategy is universally best.
- A corrected total-return chart that no longer mixes rupees and percentages on one axis.
- Correct 10L, 16L, 20L, and 50L capital-sensitivity category alignment.
- Strategy-detail journey: rules, signals, closed book, open book, and portfolio outcome.
- Strategy configuration factors shown beside the scenario assumptions.
- Light, zebra-striped comparison and trade tables.
- Responsive layouts verified at 1440px desktop and 430px mobile without page-level horizontal overflow.

## Review live

- Overview: <https://n50.nifty50today.co.in/n50/backtesting>
- Compare: <https://n50.nifty50today.co.in/n50/backtesting/compare>
- Individual journey: <https://n50.nifty50today.co.in/n50/backtesting/strategies/rsi30_willr80_closegtprev_tp125>

## Evidence

- `screenshots/overview-desktop.png`
- `screenshots/compare-desktop.png`
- `screenshots/strategy-journey-desktop.png`
- `screenshots/overview-mobile.png`
- `BACKTEST_UI_TEST_RESULTS.json`
