# Implementation Map

## Existing code to inspect and reuse

- `backtesting/services/nse_analytics_worker/app/nifty_backtesting_worker.py` — existing Fast Oversold Rebound, Confirmed Oversold Recovery and MACD Trend Continuation definitions, feature calculations and persistence paths.
- `indicators_strategies/services/nse_analytics_worker/config/indicator_strategy_registry.yml` — current RSI scenarios and educational metadata.
- `nse_app.backtest_strategy` and `nse_app.backtest_strategy_version` — immutable strategy registry.
- `nse_app.backtest_run`, `backtest_signal_candidate`, `backtest_skipped_signal`, `backtest_trade_log`, `backtest_daily_equity`, `backtest_stock_summary`, `backtest_regime_summary`, `backtest_run_validation` and `backtest_compare_summary_mart` — existing result and comparison structures.
- `nse_intraday.security_minute_feature` — existing VWAP, opening-range, volume, beta, residual-return and market-context fields.

## Additive implementation

1. Preserve declarative-strategy v1 and add a backward-compatible v2 parser.
2. Register each requested feature key in the canonical feature registry.
3. Implement feature-to-feature comparisons and crossing operators using current and previous completed bars.
4. Add suite orchestration that freezes one data snapshot and launches isolated strategy portfolios.
5. Calculate a compatibility hash before aggregation.
6. Persist individual runs and comparison summaries through existing canonical tables/marts or additive compatibility structures.
7. Add comparison API and UI routes.
8. Add golden, integration, deterministic, restart, reconciliation and Playwright tests.
9. Produce completion and evidence-index files before acceptance.
