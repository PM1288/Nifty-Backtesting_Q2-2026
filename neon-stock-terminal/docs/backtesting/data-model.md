# Data Model

## Registry layer

Versioned strategy metadata lives in:

- `nse_app.backtest_strategy`
- `nse_app.backtest_strategy_version`

Important fields:

- `strategy_id`
- `strategy_slug`
- `strategy_version_id`
- `version_number`
- `config_json`
- `assumptions_json`
- `fee_profile_id`
- `is_active_version`

## Batch anchor

Every published Backtesting snapshot hangs off `nse_app.batch_run_audit` where:

- `batch_name = 'backtesting_precompute'`
- `published_flag = TRUE`

The API only reads the latest published batch id and never performs heavy recomputation on request.

Read-side API payloads are cached separately in `nse_app.dashboard_snapshots`, but those cached payloads are still built from published Backtesting batch rows only.

## Layered precompute model

### Layer 0: feature layer

Canonical market facts:

- `nse_app.backtest_feature_daily`

This stores one row per `(batch_run_id, trade_date, symbol)` with:

- OHLC
- `prev_close`
- `close_vs_prev_close_pct`
- `rsi_14`
- `willr_14`
- `sma20`
- `sma50`
- `macd_line`
- `macd_signal`
- `macd_hist`
- `regime_label`
- `tradable_flag`
- `data_quality_flag`

### Layer 1: signal candidate layer

Auditable entry detection:

- `nse_app.backtest_signal_candidate`

Important fields:

- `strategy_version_id`
- `symbol`
- `signal_date`
- `entry_date`
- `entry_eligible_flag`
- `regime_on_signal`
- `signal_rank_inputs_json`
- `entry_reason_json`
- `feature_snapshot_json`

### Layer 2: trade template layer

Unconstrained theoretical trade paths:

- `nse_app.backtest_trade_template`

Important fields:

- `trade_template_id`
- `strategy_version_id`
- `symbol`
- `signal_date`
- `entry_date`
- `entry_price`
- `target_price`
- `stop_price`
- `theoretical_exit_date`
- `theoretical_exit_price`
- `exit_reason`
- `exit_timing`
- `hold_days`
- `gross_return_pct`
- `regime_on_entry`
- `open_trade_flag_at_asof`
- `mark_to_market_price`
- `mark_to_market_return_pct`
- `rank_inputs_json`
- `details_json`

Note:

- `trade_template_id` is batch-scoped in the worker implementation so repeated publishes can safely materialize the same logical signal in later batches without primary-key collisions.

### Layer 3: portfolio replay layer

Scenario-specific portfolio outputs:

- `nse_app.backtest_run`
- `nse_app.backtest_run_validation`
- `nse_app.backtest_daily_equity`
- `nse_app.backtest_trade_log`
- `nse_app.backtest_open_position`
- `nse_app.backtest_skipped_signal`
- `nse_app.backtest_benchmark_fd`

Important replay metadata fields on `backtest_run`:

- `scenario_key`
- `scenario_label`
- `universe_mode`
- `capital_mode`
- `stock_symbol`
- `summary_json`
- `strategy_version_hash`
- `feature_data_asof`
- `universe_hash`
- `run_scope_hash`

### Layer 4: UI marts

Pre-shaped snapshot reads for the web app:

- `nse_app.backtest_strategy_summary_mart`
- `nse_app.backtest_stock_summary_mart`
- `nse_app.backtest_regime_summary_mart`
- `nse_app.backtest_compare_summary_mart`
- `nse_app.backtest_daily_summary_mart`

These keep the UI fast and reduce frontend transform work.

## Compatibility layer

The following older summary tables remain populated for detailed pages and continuity:

- `nse_app.backtest_symbol_daily`
- `nse_app.backtest_stock_summary`
- `nse_app.backtest_regime_summary`

## Relationships

- one `backtest_strategy` has many `backtest_strategy_version`
- one `backtest_strategy_version` has many candidates, templates, runs, and marts
- one published `batch_run_audit` record owns all layer rows for that publish
- one compare row maps to one strategy-version scenario in `nifty_100`

## API contracts

Current read-only routes:

- `GET /v1/backtesting/overview`
- `GET /v1/backtesting/strategies`
- `GET /v1/backtesting/strategies/:strategyId`
- `GET /v1/backtesting/daily-summary`
- `GET /v1/backtesting/compare`
- `GET /v1/backtesting/runs`

Current frontend reads:

- strategy detail pages read published scenario payloads
- compare/regime/stock pages read compare + mart payloads
- no page should trigger raw backtest execution
- if no published batch exists, routes should surface an unavailable state instead of silently substituting seeded data unless development fallback is explicitly enabled
