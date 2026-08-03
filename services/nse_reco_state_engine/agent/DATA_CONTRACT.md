# Data contract for integration views

This engine reads from the `integration.*` views so it can be integrated without renaming your existing tables.

## 1) `integration.v_security_minute_feature`

Purpose: 1-minute stock-level features for the Nifty100 universe.

**Required columns**

| column | type | meaning |
|---|---|---|
| trade_date | date | trading session date |
| ts | timestamptz | bar timestamp (minute) |
| minute_of_day | int | 0..N; consistent per session (e.g. 0=09:15) |
| symbol | text | stock symbol / trading symbol |
| sector_name | text | sector/industry bucket (used for peer anomalies) |
| close | numeric | minute close |
| vwap | numeric | rolling VWAP at that minute |
| volume | numeric | minute volume |
| index_close | numeric | matching index close (same minute) |
| beta | numeric | stock beta vs index (rolling baseline) |
| residual_ret_5m_pct | numeric | residual return (5m) in percent |
| residual_ret_15m_pct | numeric | residual return (15m) in percent |
| residual_ret_30m_pct | numeric | residual return (30m) in percent |
| residual_ret_60m_pct | numeric | residual return (60m) in percent |
| time_above_vwap_pct | numeric | percent of minutes above VWAP so far |
| vwap_deviation_pct | numeric | (close - vwap) / vwap * 100 |
| volume_surprise_z | numeric | z-score vs minute-of-day volume profile |
| range_efficiency | numeric | 0..1; higher=trending, lower=noisy |
| close_location | numeric | 0..1; higher=closing near highs |

Optional columns (used if present):
- `vwap_cross_count` (int)
- `ret_1m_pct` (numeric)
- `volume_ratio` (numeric; current minute volume / expected minute volume)

## 2) `integration.v_market_minute_feature`

Purpose: market-level intraday features for state classification.

Required columns:

| column | type | meaning |
|---|---|---|
| trade_date | date | session |
| ts | timestamptz | minute timestamp |
| minute_of_day | int | minute index |
| index_code | text | e.g. "NIFTY 50" |
| index_close | numeric | minute close |
| index_ret_1m_pct | numeric | minute return in percent |
| breadth_up_pct | numeric | % of Nifty100 stocks up at that minute |
| breadth_above_vwap_pct | numeric | % above VWAP |
| dispersion_pctile | numeric | 0..100 vs recent history |
| realized_vol_pctile | numeric | 0..100 vs recent history |

Optional columns:
- `opening_gap_pct` (numeric)
- `first15_range_expansion_pct` (numeric)
- `correlation_mean` (numeric)

## 3) `integration.v_universe_membership`

Required columns:
- `trade_date` date
- `symbol` text
- `is_active` boolean

## 4) `integration.v_index_daily_history`

Required columns:
- `trade_date` date
- `index_code` text
- `close` numeric
- `high` numeric
- `low` numeric

## 5) `integration.v_events_daily` (optional)

Required columns:
- `trade_date` date
- `symbol` text
- `event_count` int
- `event_tags` text (comma-separated)

## Contract verification

Run:

```sql
select * from nse_ops.contract_check();
```
