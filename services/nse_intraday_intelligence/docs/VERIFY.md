# Verification checklist — stock alpha upgrade

## Architecture check
- Historical beta and minute-volume baselines are allowed to come from the compatibility-view layer:
  - `integration.v_source_security_1m`
  - `integration.v_source_index_1m`
- In this stack, `nse_intraday.raw_security_1m` and `nse_intraday.raw_index_1m` only need the current session materialized for the refresh chain.
- Do not require a long historical copy into `nse_intraday.raw_*` just to validate stock-alpha baselines.

## Schema checks
```sql
select column_name
from information_schema.columns
where table_schema = 'nse_intraday'
  and table_name = 'security_minute_feature'
  and column_name in (
    'beta_20d', 'residual_return_15m_pct', 'vwap_hold_quality_score',
    'relative_strength_persistence_score', 'range_efficiency_pct',
    'volume_curve_surprise', 'close_location_quality_pct'
  )
order by column_name;
```

```sql
select column_name
from information_schema.columns
where table_schema = 'nse_intraday'
  and table_name = 'stock_intraday_live'
  and column_name in (
    'residual_leadership_score', 'index_beta_follow_score',
    'vwap_control_score', 'headline_spike_score', 'catch_up_score'
  )
order by column_name;
```

## Baseline coverage
```sql
select
  trade_date,
  count(*) as beta_rows,
  count(*) filter (where beta_20d is not null) as beta_20d_non_null,
  count(*) filter (where beta_60d is not null) as beta_60d_non_null
from nse_intraday.stock_daily_beta_profile
group by trade_date
order by trade_date desc
limit 5;
```

```sql
select trade_date, count(distinct symbol) as profile_symbols
from nse_intraday.stock_minute_volume_profile
group by trade_date
order by trade_date desc
limit 5;
```

```sql
select
  check_key,
  observed_value,
  passed
from nse_ops.quality_check_result
where check_key in (
  'stock_alpha_beta_coverage',
  'stock_alpha_volume_profile_coverage',
  'stock_alpha_feature_rows'
)
order by created_at desc, check_key
limit 20;
```

## Live stock checks
```sql
select symbol, dominant_signal, residual_return_15m_pct, vwap_hold_quality_score, volume_curve_surprise
from nse_intraday.stock_intraday_live
where trade_date = (select max(trade_date) from nse_intraday.stock_intraday_live)
order by residual_leadership_score desc
limit 20;
```

## API checks
- `GET /api/v1/intraday/summary`
- `GET /api/v1/intraday/sections/stock-quality`
- `GET /api/v1/intraday/stocks/RELIANCE`
- `GET /api/v1/intraday/watchlists/residual-leaders`
- `GET /api/v1/intraday/watchlists/vwap-control-breakouts`

## Quality expectations
- once compatibility-view history is present, beta and volume baselines should populate even if `nse_intraday.raw_*` only contains the current session
- on this stack, `2026-03-06` validates with:
  - `stock_alpha_beta_coverage = 99`
  - `stock_alpha_volume_profile_coverage = 99`
  - `stock_alpha_feature_rows = 37169`
- `/api/v1/intraday/sections/stock-quality` should expose real non-null beta values for multiple symbols
- `/api/v1/intraday/stocks/RELIANCE` should expose real non-fallback values for:
  - `beta_20d`
  - `beta_60d`
  - `minute_volume_ratio`
  - `cum_volume_vs_profile`
  - `volume_curve_surprise`
- valid watchlist slugs may return empty `rows` on a given trade date; that is an actual-data outcome, not a pipeline failure
- `headline-spike` names should usually show worse persistence / VWAP metrics than `residual-leader` names
