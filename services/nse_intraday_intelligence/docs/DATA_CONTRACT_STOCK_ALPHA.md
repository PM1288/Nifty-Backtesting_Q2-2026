# Data contract additions — stock alpha upgrade

## Baseline source contract
- `nse_intraday.stock_daily_beta_profile` may be derived from archived minute history exposed through:
  - `integration.v_source_security_1m`
  - `integration.v_source_index_1m`
- `nse_intraday.stock_minute_volume_profile` may be derived from archived minute history exposed through:
  - `integration.v_source_security_1m`
- The current-session refresh chain may materialize only the active trade date into `nse_intraday.raw_security_1m` and `nse_intraday.raw_index_1m`.
- Full historical copies into `nse_intraday.raw_*` are not required in this stack for beta and minute-volume baseline correctness.

## New tables

### `nse_intraday.stock_daily_beta_profile`
Per-trade-date rolling beta baselines keyed by:
- `trade_date`
- `index_code`
- `symbol`

### `nse_intraday.stock_minute_volume_profile`
Per-trade-date minute-of-day volume baseline keyed by:
- `trade_date`
- `symbol`
- `minute_no`

In this stack the baseline rows can be rebuilt from compatibility-view-backed archive data, not only from rows physically stored in `nse_intraday.raw_security_1m`.

## Added columns in `nse_intraday.security_minute_feature`
- `beta_20d`
- `beta_60d`
- `index_return_5m_pct`
- `index_return_15m_pct`
- `index_return_30m_pct`
- `index_return_60m_pct`
- `change_pct_60m`
- `residual_return_5m_pct`
- `residual_return_15m_pct`
- `residual_return_30m_pct`
- `residual_return_60m_pct`
- `minute_return_pct`
- `residual_minute_return_pct`
- `time_above_vwap_pct`
- `vwap_cross_count`
- `vwap_hold_quality_score`
- `residual_positive_ratio_pct`
- `relative_strength_persistence_score`
- `range_efficiency_pct`
- `minute_volume_ratio`
- `cum_volume_vs_profile`
- `volume_curve_surprise`
- `bar_close_location_pct`
- `close_location_quality_pct`

## Added columns in `nse_intraday.stock_intraday_live`
- `beta_20d`
- `beta_60d`
- `residual_return_5m_pct`
- `residual_return_15m_pct`
- `residual_return_30m_pct`
- `residual_return_60m_pct`
- `time_above_vwap_pct`
- `vwap_hold_quality_score`
- `relative_strength_persistence_score`
- `range_efficiency_pct`
- `minute_volume_ratio`
- `cum_volume_vs_profile`
- `volume_curve_surprise`
- `close_location_quality_pct`
- `residual_leadership_score`
- `index_beta_follow_score`
- `vwap_control_score`
- `headline_spike_score`
- `catch_up_score`
- `explanation_json`

## New view
### `nse_intraday.vw_stock_signal_history_stats`
Signal-level historical context for:
- sample count
- average intraday change
- average next-day change
- next-day follow-through rate
