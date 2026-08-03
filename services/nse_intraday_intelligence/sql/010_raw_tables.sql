create table if not exists nse_intraday.raw_security_1m (
  trade_date date not null,
  minute_ts timestamptz not null,
  symbol text not null,
  open_px numeric(18,6) not null,
  high_px numeric(18,6) not null,
  low_px numeric(18,6) not null,
  close_px numeric(18,6) not null,
  volume bigint not null default 0,
  turnover numeric(20,2),
  vwap numeric(18,6),
  trades integer,
  source_pk text,
  source_system text,
  ingested_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (trade_date, minute_ts, symbol)
) partition by range (trade_date);

create index if not exists idx_raw_security_1m_symbol_minute
  on nse_intraday.raw_security_1m (symbol, minute_ts desc);

create table if not exists nse_intraday.raw_index_1m (
  trade_date date not null,
  minute_ts timestamptz not null,
  index_code text not null,
  index_name text not null,
  open_px numeric(18,6) not null,
  high_px numeric(18,6) not null,
  low_px numeric(18,6) not null,
  close_px numeric(18,6) not null,
  volume bigint,
  turnover numeric(20,2),
  vwap numeric(18,6),
  trades integer,
  source_pk text,
  source_system text,
  ingested_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (trade_date, minute_ts, index_code)
) partition by range (trade_date);

create index if not exists idx_raw_index_1m_code_minute
  on nse_intraday.raw_index_1m (index_code, minute_ts desc);

create table if not exists nse_intraday.universe_membership (
  universe_name text not null default 'NIFTY100',
  symbol text not null,
  weight numeric(18,8),
  sector_name text,
  effective_from date not null,
  effective_to date,
  source_system text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (universe_name, symbol, effective_from)
);

create index if not exists idx_universe_membership_symbol_dates
  on nse_intraday.universe_membership (symbol, effective_from desc, effective_to);
