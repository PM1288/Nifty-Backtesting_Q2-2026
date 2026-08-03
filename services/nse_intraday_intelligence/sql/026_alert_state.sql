create table if not exists nse_ops.alert_state_intraday (
  alert_key text primary key,
  status text not null,
  severity text not null,
  message text not null,
  last_observed_at timestamptz not null default now(),
  last_status_change_at timestamptz not null default now(),
  last_alert_at timestamptz,
  last_recovery_at timestamptz,
  last_payload_json jsonb not null default '{}'::jsonb,
  last_message text,
  updated_at timestamptz not null default now()
);

create index if not exists idx_alert_state_intraday_status
  on nse_ops.alert_state_intraday (status, updated_at desc);
