create or replace view nse_intraday.vw_latest_market_summary as
select distinct on (trade_date, index_code)
  trade_date,
  index_code,
  as_of_ts,
  index_name,
  last_price,
  prev_close,
  change_pct,
  gap_pct,
  session_range_pct,
  close_location_pct,
  open_range_15_pct,
  breadth_up_pct,
  breadth_above_vwap_pct,
  breadth_above_or_high_pct,
  breadth_below_or_low_pct,
  dispersion_pct,
  weighted_participation_pct,
  top10_concentration_pct,
  participation_label,
  primary_state,
  secondary_states_json,
  confidence_score,
  gap_filled,
  failed_open,
  late_day_reversal,
  high_volatility_chop,
  narrow_leadership,
  broad_participation,
  narrative,
  payload_json,
  generated_at
from nse_intraday.market_session_summary
order by trade_date desc, index_code, as_of_ts desc;

create or replace view nse_intraday.vw_market_state_history_stats as
with state_rows as (
  select
    s.trade_date,
    s.index_code,
    s.primary_state,
    s.change_pct,
    s.gap_pct,
    s.breadth_up_pct,
    s.breadth_above_vwap_pct,
    s.top10_concentration_pct,
    d.close_px as day_close_px,
    lead(d.close_px) over (partition by d.index_code order by d.trade_date) as next_close_px
  from nse_intraday.market_session_summary s
  left join integration.v_index_daily_history d
    on d.trade_date = s.trade_date
   and d.index_code = s.index_code
)
select
  index_code,
  primary_state,
  count(*) as session_count,
  round(avg(change_pct)::numeric, 6) as avg_session_change_pct,
  round(avg(gap_pct)::numeric, 6) as avg_gap_pct,
  round(avg(breadth_up_pct)::numeric, 6) as avg_breadth_up_pct,
  round(avg(breadth_above_vwap_pct)::numeric, 6) as avg_breadth_above_vwap_pct,
  round(avg(top10_concentration_pct)::numeric, 6) as avg_top10_concentration_pct,
  round(avg(case when day_close_px is not null and next_close_px is not null then 100.0 * (next_close_px / nullif(day_close_px, 0) - 1.0) end)::numeric, 6) as avg_next_day_change_pct,
  round(
    100.0 * avg(
      case
        when day_close_px is not null and next_close_px is not null and change_pct is not null and change_pct <> 0
             and sign(100.0 * (next_close_px / nullif(day_close_px, 0) - 1.0)) = sign(change_pct)
          then 1.0
        when day_close_px is not null and next_close_px is not null and change_pct is not null and change_pct <> 0
          then 0.0
        else null
      end
    )::numeric,
    6
  ) as next_day_followthrough_pct
from state_rows
group by index_code, primary_state;

create or replace view nse_intraday.vw_watchlist_intraday_latest as
select
  w.slug,
  w.title,
  s.trade_date,
  s.as_of_ts,
  s.symbol,
  s.rank_no,
  s.direction,
  s.accent_token,
  s.signal_score,
  s.last_price,
  s.change_pct,
  s.volume_ratio_day,
  s.vwap_dev_bps,
  s.sector_name,
  s.tags_json,
  s.notes,
  s.payload_json,
  s.generated_at
from nse_ops.watchlist_snapshot_intraday s
join nse_ops.watchlist w
  on w.watchlist_id = s.watchlist_id;
