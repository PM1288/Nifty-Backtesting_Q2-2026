create table if not exists nse_ops.scalper_entry_signal (
  signal_key text primary key,
  rule_version text not null,
  trade_date date not null,
  interval_minutes integer not null check (interval_minutes > 0),
  setup_end timestamptz not null,
  entry_end timestamptz not null,
  direction text not null check (direction in ('CALL','PUT')),
  underlying_symbol text not null,
  underlying_token text not null,
  option_symbol text not null,
  option_token text not null,
  expiry date not null,
  strike numeric not null,
  underlying_setup_close numeric not null,
  underlying_ema9 numeric not null,
  underlying_body_fraction numeric not null,
  option_setup_close numeric not null,
  option_ema9 numeric not null,
  option_body_fraction numeric not null,
  underlying_entry_open numeric not null,
  option_entry_open numeric not null,
  evidence_json jsonb not null,
  delivery_status text not null default 'PENDING',
  delivery_attempts integer not null default 0,
  delivered_at timestamptz,
  last_http_status integer,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop index if exists nse_ops.ux_scalper_entry_once_per_contract_candle;
create unique index ux_scalper_entry_once_per_contract_candle
  on nse_ops.scalper_entry_signal(rule_version, interval_minutes, option_token, direction, setup_end);
create index if not exists ix_scalper_entry_trade_date
  on nse_ops.scalper_entry_signal(trade_date desc, setup_end desc);

insert into nse_ops.job_definition(job_key,title,cron_expr,enabled,timeout_sec,command_text,description)
values('scalper_entry_evaluate','Paired F&O universe EMA9 entry evaluation','*/1 9-15 * * mon-fri',true,120,
       'python -m nse_intraday_intelligence.manual_jobs scalper-entries',
       'Evaluates complete 1-minute, 5-minute and 15-minute candles for every covered F&O equity/index underlying and its exact active CE/PE pair; persists and delivers each confirmed entry once per timeframe')
on conflict(job_key) do update set title=excluded.title,cron_expr=excluded.cron_expr,enabled=excluded.enabled,
  timeout_sec=excluded.timeout_sec,command_text=excluded.command_text,description=excluded.description,updated_at=now();
