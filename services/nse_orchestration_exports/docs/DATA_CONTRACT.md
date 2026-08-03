# Data contract for integration

This package assumes the analytics layer already produces the following tables and fields.
If your application uses different names, create compatibility views or adapt the SQL in `src/nse_orchestration_exports/pipeline.py`.

## 1) `nse_app.market_summary_daily`
Required columns:

- `trade_date date not null`
- `index_name text not null`
- `last_value numeric`
- `delta_value numeric`
- `change_pct numeric`
- `as_of_ts timestamptz`
- `advance_count integer`
- `decline_count integer`
- `unchanged_count integer`
- `up_volume_share numeric`
- `down_volume_share numeric`
- `market_regime text`

## 2) `nse_app.security_daily_features`
Required columns:

- `trade_date date not null`
- `symbol text not null`
- `security_name text`
- `sector_name text`
- `close_price numeric`
- `prev_close numeric`
- `open_price numeric`
- `high_price numeric`
- `low_price numeric`
- `change_value numeric`
- `change_pct numeric`
- `volume bigint`
- `turnover numeric`
- `delivery_pct numeric`
- `volume_zscore numeric`
- `delivery_zscore numeric`
- `breakout_20d boolean`
- `near_52w_high boolean`
- `near_52w_low boolean`
- `anomaly_score numeric`
- `in_nifty50 boolean`
- `in_nifty100 boolean`
- `is_tradable boolean`

## 3) `nse_app.stock_analysis_signals_daily`
Required columns:

- `trade_date date not null`
- `symbol text not null`
- `analysis_slug text not null`
- `analysis_title text`
- `section_slug text not null`
- `direction text` -- up / down / neutral
- `signal_score numeric`
- `confidence numeric`
- `signal_label text`
- `summary_text text`
- `detail_text text`
- `is_actionable boolean`
- `severity text`
- `supporting_metrics_json jsonb`

## 4) `nse_app.signal_performance_summary`
Required columns:

- `as_of_date date not null`
- `analysis_slug text not null`
- `horizon_days integer not null`
- `sample_size integer`
- `hit_rate numeric`
- `avg_forward_return numeric`
- `median_forward_return numeric`
- `information_ratio numeric`

## Compatibility recommendation

If your existing schema differs, prefer **compatibility views** over patching business logic everywhere.

Example:

```sql
create or replace view nse_app.security_daily_features as
select
  trade_date,
  symbol,
  name as security_name,
  sector as sector_name,
  close as close_price,
  lag_close as prev_close,
  open as open_price,
  high as high_price,
  low as low_price,
  close - lag_close as change_value,
  pct_change as change_pct,
  volume,
  turnover,
  delivery_pct,
  volume_z as volume_zscore,
  delivery_z as delivery_zscore,
  breakout_20d,
  near_52w_high,
  near_52w_low,
  anomaly_score,
  in_nifty50,
  in_nifty100,
  true as is_tradable
from some_existing_table;
```
