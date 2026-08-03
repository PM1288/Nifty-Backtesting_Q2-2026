create schema if not exists audit;

create table if not exists audit.discord_stream_dispatch_log (
  id text primary key,
  message_kind text not null,
  target text not null,
  session_reference text null,
  dedupe_key text not null,
  content_hash text not null,
  trust_score integer null,
  status text not null,
  suppression_reason text null,
  webhook_name text null,
  payload_json jsonb not null default '{}'::jsonb,
  response_json jsonb null,
  discord_status integer null,
  created_at timestamptz not null default now(),
  sent_at timestamptz null
);

create index if not exists idx_discord_stream_dispatch_log_created_at
  on audit.discord_stream_dispatch_log (created_at desc);

create index if not exists idx_discord_stream_dispatch_log_status_created_at
  on audit.discord_stream_dispatch_log (status, created_at desc);

create index if not exists idx_discord_stream_dispatch_log_dedupe
  on audit.discord_stream_dispatch_log (dedupe_key, created_at desc);
