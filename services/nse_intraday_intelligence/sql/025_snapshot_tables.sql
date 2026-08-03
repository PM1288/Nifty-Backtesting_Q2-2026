create schema if not exists nse_ops;

create table if not exists nse_ops.dashboard_snapshot_intraday (
  trade_date date not null,
  index_code text not null,
  as_of_ts timestamptz not null,
  is_stale boolean not null default false,
  hero_json jsonb not null,
  state_json jsonb not null default '{}'::jsonb,
  summary_table_json jsonb not null default '[]'::jsonb,
  breadth_json jsonb not null default '{}'::jsonb,
  leaders_json jsonb not null default '{}'::jsonb,
  ticker_tape_json jsonb not null default '[]'::jsonb,
  footer_disclaimer text not null,
  accent_token text not null default 'white',
  meta_json jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null default now(),
  primary key (trade_date, index_code)
);

create table if not exists nse_ops.dashboard_section_intraday (
  trade_date date not null,
  index_code text not null,
  section_slug text not null,
  as_of_ts timestamptz not null,
  title text not null,
  direction text not null default 'neutral',
  accent_token text not null default 'white',
  summary_metrics_json jsonb not null default '{}'::jsonb,
  highlights_json jsonb not null default '[]'::jsonb,
  narrative text,
  rows_json jsonb not null default '[]'::jsonb,
  charts_json jsonb not null default '[]'::jsonb,
  historical_context_json jsonb not null default '{}'::jsonb,
  meta_json jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null default now(),
  primary key (trade_date, index_code, section_slug)
);

create table if not exists nse_ops.watchlist_snapshot_intraday (
  trade_date date not null,
  as_of_ts timestamptz not null,
  watchlist_id bigint not null,
  symbol text not null,
  rank_no integer,
  direction text not null default 'neutral',
  accent_token text not null default 'white',
  signal_score numeric(18,6),
  last_price numeric(18,6),
  change_pct numeric(18,6),
  volume_ratio_day numeric(18,6),
  vwap_dev_bps numeric(18,6),
  sector_name text,
  tags_json jsonb not null default '[]'::jsonb,
  notes text,
  payload_json jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null default now(),
  primary key (trade_date, watchlist_id, symbol)
);

create index if not exists idx_watchlist_snapshot_intraday_date
  on nse_ops.watchlist_snapshot_intraday (trade_date desc, watchlist_id, rank_no);
