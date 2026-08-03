create or replace view nse_ops.vw_latest_dashboard_snapshot as
select *
from nse_ops.dashboard_snapshot_daily
where trade_date = (select max(trade_date) from nse_ops.dashboard_snapshot_daily);

create or replace view nse_ops.vw_latest_dashboard_sections as
select *
from nse_ops.dashboard_section_daily
where trade_date = (select max(trade_date) from nse_ops.dashboard_section_daily);

create or replace view nse_ops.vw_watchlists_current as
select
  w.watchlist_id,
  w.slug,
  w.title,
  w.description,
  w.watchlist_kind,
  w.rule_key,
  w.selection_limit,
  w.ui_rank,
  w.is_active
from nse_ops.watchlist w
where w.is_active = true;

create or replace view nse_ops.vw_recent_job_runs as
select *
from nse_ops.job_run
order by requested_at desc
limit 200;
