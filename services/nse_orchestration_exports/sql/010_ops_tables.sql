create table if not exists nse_ops.job_definition (
  job_key text primary key,
  title text not null,
  cron_expr text,
  enabled boolean not null default true,
  timeout_sec integer not null default 3600,
  command_text text,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists nse_ops.job_run (
  run_id uuid primary key,
  job_key text not null references nse_ops.job_definition(job_key),
  trigger_type text not null,
  host_name text,
  status text not null,
  command_text text,
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  duration_ms bigint,
  exit_code integer,
  stdout_tail text,
  stderr_tail text,
  meta_json jsonb not null default '{}'::jsonb
);

create index if not exists idx_job_run_job_key_requested_at
  on nse_ops.job_run (job_key, requested_at desc);

create table if not exists nse_ops.job_step_log (
  run_id uuid not null references nse_ops.job_run(run_id) on delete cascade,
  step_no integer not null,
  step_key text not null,
  status text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  message text,
  detail_json jsonb not null default '{}'::jsonb,
  primary key (run_id, step_no)
);

create table if not exists nse_ops.quality_check_result (
  quality_id bigserial primary key,
  run_id uuid references nse_ops.job_run(run_id) on delete set null,
  check_key text not null,
  severity text not null,
  passed boolean not null,
  observed_value text,
  threshold_value text,
  detail text,
  created_at timestamptz not null default now()
);

create index if not exists idx_quality_check_created_at
  on nse_ops.quality_check_result (created_at desc);

create table if not exists nse_ops.export_manifest (
  export_id uuid primary key,
  export_scope text not null,
  export_key text not null,
  trade_date date,
  export_format text not null,
  storage_path text not null,
  content_type text not null,
  row_count integer,
  byte_size bigint,
  checksum_sha256 text,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  meta_json jsonb not null default '{}'::jsonb
);

create index if not exists idx_export_manifest_created_at
  on nse_ops.export_manifest (created_at desc);

create table if not exists nse_ops.dashboard_snapshot_daily (
  trade_date date primary key,
  generated_at timestamptz not null default now(),
  is_stale boolean not null default false,
  hero_json jsonb not null,
  top_gainers_json jsonb not null default '[]'::jsonb,
  top_losers_json jsonb not null default '[]'::jsonb,
  sector_groups_json jsonb not null default '[]'::jsonb,
  ticker_tape_json jsonb not null default '[]'::jsonb,
  summary_cards_json jsonb not null default '[]'::jsonb,
  footer_disclaimer text not null,
  accent_token text not null default 'white',
  meta_json jsonb not null default '{}'::jsonb
);

create table if not exists nse_ops.dashboard_section_daily (
  trade_date date not null,
  section_slug text not null,
  title text not null,
  direction text not null default 'neutral',
  accent_token text not null default 'white',
  generated_at timestamptz not null default now(),
  summary_metrics_json jsonb not null default '{}'::jsonb,
  highlights_json jsonb not null default '[]'::jsonb,
  narrative text,
  rows_json jsonb not null default '[]'::jsonb,
  historical_context_json jsonb not null default '{}'::jsonb,
  meta_json jsonb not null default '{}'::jsonb,
  primary key (trade_date, section_slug)
);

create table if not exists nse_ops.watchlist (
  watchlist_id bigserial primary key,
  slug text unique not null,
  title text not null,
  description text,
  watchlist_kind text not null default 'system',
  rule_key text,
  selection_limit integer not null default 20,
  is_active boolean not null default true,
  ui_rank integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists nse_ops.watchlist_item (
  watchlist_id bigint not null references nse_ops.watchlist(watchlist_id) on delete cascade,
  symbol text not null,
  source text not null default 'manual',
  weight numeric(14,4),
  added_at timestamptz not null default now(),
  removed_at timestamptz,
  primary key (watchlist_id, symbol, added_at)
);

create index if not exists idx_watchlist_item_current
  on nse_ops.watchlist_item (watchlist_id, symbol)
  where removed_at is null;

create table if not exists nse_ops.watchlist_snapshot_daily (
  trade_date date not null,
  watchlist_id bigint not null references nse_ops.watchlist(watchlist_id) on delete cascade,
  symbol text not null,
  rank_no integer,
  direction text not null default 'neutral',
  accent_token text not null default 'white',
  signal_score numeric(14,6),
  close_price numeric(18,6),
  change_pct numeric(18,6),
  volume bigint,
  delivery_pct numeric(18,6),
  sector_name text,
  tags_json jsonb not null default '[]'::jsonb,
  notes text,
  payload_json jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null default now(),
  primary key (trade_date, watchlist_id, symbol)
);

create index if not exists idx_watchlist_snapshot_date
  on nse_ops.watchlist_snapshot_daily (trade_date desc, watchlist_id, rank_no);
