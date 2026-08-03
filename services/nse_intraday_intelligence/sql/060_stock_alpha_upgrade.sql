
create table if not exists nse_intraday.stock_daily_beta_profile (
  trade_date date not null,
  index_code text not null,
  symbol text not null,
  beta_20d numeric(18,6),
  beta_60d numeric(18,6),
  corr_20d numeric(18,6),
  corr_60d numeric(18,6),
  obs_20d integer,
  obs_60d integer,
  generated_at timestamptz not null default now(),
  primary key (trade_date, index_code, symbol)
);

create index if not exists idx_stock_daily_beta_profile_symbol
  on nse_intraday.stock_daily_beta_profile (symbol, trade_date desc);

create table if not exists nse_intraday.stock_minute_volume_profile (
  trade_date date not null,
  symbol text not null,
  minute_no integer not null,
  avg_minute_volume numeric(20,6),
  avg_cum_volume_share_pct numeric(18,6),
  sample_days integer,
  generated_at timestamptz not null default now(),
  primary key (trade_date, symbol, minute_no)
);

create index if not exists idx_stock_minute_volume_profile_symbol
  on nse_intraday.stock_minute_volume_profile (symbol, trade_date desc, minute_no);

alter table nse_intraday.security_minute_feature
  add column if not exists beta_20d numeric(18,6),
  add column if not exists beta_60d numeric(18,6),
  add column if not exists index_return_5m_pct numeric(18,6),
  add column if not exists index_return_15m_pct numeric(18,6),
  add column if not exists index_return_30m_pct numeric(18,6),
  add column if not exists index_return_60m_pct numeric(18,6),
  add column if not exists change_pct_60m numeric(18,6),
  add column if not exists residual_return_5m_pct numeric(18,6),
  add column if not exists residual_return_15m_pct numeric(18,6),
  add column if not exists residual_return_30m_pct numeric(18,6),
  add column if not exists residual_return_60m_pct numeric(18,6),
  add column if not exists minute_return_pct numeric(18,6),
  add column if not exists residual_minute_return_pct numeric(18,6),
  add column if not exists time_above_vwap_pct numeric(18,6),
  add column if not exists vwap_cross_count integer,
  add column if not exists vwap_hold_quality_score numeric(18,6),
  add column if not exists residual_positive_ratio_pct numeric(18,6),
  add column if not exists relative_strength_persistence_score numeric(18,6),
  add column if not exists range_efficiency_pct numeric(18,6),
  add column if not exists minute_volume_ratio numeric(18,6),
  add column if not exists cum_volume_vs_profile numeric(18,6),
  add column if not exists volume_curve_surprise numeric(18,6),
  add column if not exists bar_close_location_pct numeric(18,6),
  add column if not exists close_location_quality_pct numeric(18,6);

alter table nse_intraday.stock_intraday_live
  add column if not exists beta_20d numeric(18,6),
  add column if not exists beta_60d numeric(18,6),
  add column if not exists residual_return_5m_pct numeric(18,6),
  add column if not exists residual_return_15m_pct numeric(18,6),
  add column if not exists residual_return_30m_pct numeric(18,6),
  add column if not exists residual_return_60m_pct numeric(18,6),
  add column if not exists time_above_vwap_pct numeric(18,6),
  add column if not exists vwap_hold_quality_score numeric(18,6),
  add column if not exists relative_strength_persistence_score numeric(18,6),
  add column if not exists range_efficiency_pct numeric(18,6),
  add column if not exists minute_volume_ratio numeric(18,6),
  add column if not exists cum_volume_vs_profile numeric(18,6),
  add column if not exists volume_curve_surprise numeric(18,6),
  add column if not exists close_location_quality_pct numeric(18,6),
  add column if not exists residual_leadership_score numeric(18,6),
  add column if not exists index_beta_follow_score numeric(18,6),
  add column if not exists vwap_control_score numeric(18,6),
  add column if not exists headline_spike_score numeric(18,6),
  add column if not exists catch_up_score numeric(18,6),
  add column if not exists explanation_json jsonb not null default '{}'::jsonb;

create index if not exists idx_stock_intraday_live_residual
  on nse_intraday.stock_intraday_live (trade_date desc, residual_leadership_score desc, vwap_control_score desc);
