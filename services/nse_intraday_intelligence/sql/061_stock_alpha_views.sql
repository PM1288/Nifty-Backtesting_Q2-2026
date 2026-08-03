
create or replace view nse_intraday.vw_stock_alpha_latest as
select
  trade_date,
  as_of_ts,
  symbol,
  sector_name,
  last_price,
  change_pct_from_prev_close,
  change_pct_from_open,
  residual_return_5m_pct,
  residual_return_15m_pct,
  residual_return_30m_pct,
  residual_return_60m_pct,
  time_above_vwap_pct,
  vwap_hold_quality_score,
  relative_strength_persistence_score,
  range_efficiency_pct,
  minute_volume_ratio,
  cum_volume_vs_profile,
  volume_curve_surprise,
  close_location_quality_pct,
  residual_leadership_score,
  index_beta_follow_score,
  vwap_control_score,
  headline_spike_score,
  catch_up_score,
  dominant_signal,
  direction,
  accent_token,
  tags_json,
  conclusion,
  payload_json,
  explanation_json,
  generated_at
from nse_intraday.stock_intraday_live;

create or replace view nse_intraday.vw_stock_signal_history_stats as
with sec_close as (
  select distinct on (trade_date, symbol)
    trade_date,
    symbol,
    close_px
  from nse_intraday.raw_security_1m
  order by trade_date, symbol, minute_ts desc
),
signal_rows as (
  select
    s.trade_date,
    s.symbol,
    s.dominant_signal,
    s.direction,
    s.change_pct_from_prev_close,
    sc.close_px as day_close_px,
    lead(sc.close_px) over (partition by sc.symbol order by sc.trade_date) as next_close_px
  from nse_intraday.stock_intraday_live s
  left join sec_close sc
    on sc.trade_date = s.trade_date
   and sc.symbol = s.symbol
)
select
  dominant_signal,
  count(*) as sample_count,
  round(avg(change_pct_from_prev_close)::numeric, 6) as avg_intraday_change_pct,
  round(avg(case when day_close_px is not null and next_close_px is not null then 100.0 * (next_close_px / nullif(day_close_px, 0) - 1.0) end)::numeric, 6) as avg_next_day_change_pct,
  round(
    100.0 * avg(
      case
        when day_close_px is not null and next_close_px is not null and dominant_signal in ('residual-leader', 'vwap-control-breakout', 'catch-up-candidate', 'intraday-strength')
          then case when (100.0 * (next_close_px / nullif(day_close_px, 0) - 1.0)) > 0 then 1.0 else 0.0 end
        when day_close_px is not null and next_close_px is not null and dominant_signal in ('residual-laggard', 'intraday-weakness')
          then case when (100.0 * (next_close_px / nullif(day_close_px, 0) - 1.0)) < 0 then 1.0 else 0.0 end
        else null
      end
    )::numeric,
    6
  ) as next_day_followthrough_pct
from signal_rows
group by dominant_signal;
