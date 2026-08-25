BEGIN;

CREATE SCHEMA IF NOT EXISTS market_status;

CREATE TABLE IF NOT EXISTS market_status.exchange_session_calendar (
  trade_date date PRIMARY KEY,
  is_trading_day boolean NOT NULL,
  regular_open_time time,
  open_send_time time DEFAULT '09:16:05',
  open_retry_deadline time DEFAULT '09:18:00',
  movers_send_time time DEFAULT '09:20:05',
  movers_retry_deadline time DEFAULT '09:22:00',
  regular_close_trigger_time time DEFAULT '15:30:00',
  finalisation_not_before_time time DEFAULT '15:42:00',
  finalisation_cutoff_time time DEFAULT '15:50:00',
  delayed_cutoff_time time DEFAULT '18:00:00',
  special_session boolean NOT NULL DEFAULT false,
  session_label text,
  source text NOT NULL,
  source_version text NOT NULL DEFAULT 'v1',
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (open_send_time <= open_retry_deadline),
  CHECK (movers_send_time <= movers_retry_deadline),
  CHECK (regular_close_trigger_time <= finalisation_not_before_time),
  CHECK (finalisation_not_before_time <= finalisation_cutoff_time),
  CHECK (finalisation_cutoff_time <= delayed_cutoff_time)
);

INSERT INTO market_status.exchange_session_calendar
  (trade_date,is_trading_day,regular_open_time,regular_close_trigger_time,source,session_label)
SELECT trade_date,is_trading_day,
  (market_open_ts AT TIME ZONE 'Asia/Kolkata')::time,
  LEAST((market_close_ts AT TIME ZONE 'Asia/Kolkata')::time,'15:30:00'::time),
  'public.trading_calendar','REGULAR'
FROM public.trading_calendar
ON CONFLICT(trade_date) DO NOTHING;

CREATE TABLE IF NOT EXISTS market_status.effective_universe_member (
  index_symbol text NOT NULL,
  symbol text NOT NULL,
  display_name text,
  exchange text NOT NULL DEFAULT 'NSE',
  symbol_token text NOT NULL,
  effective_from date NOT NULL,
  effective_to date,
  source text NOT NULL,
  source_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(index_symbol,symbol,effective_from),
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);
CREATE INDEX IF NOT EXISTS market_status_universe_effective_idx
  ON market_status.effective_universe_member(index_symbol,effective_from,effective_to);

CREATE TABLE IF NOT EXISTS market_status.job_run (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name text NOT NULL CHECK (job_name IN ('MARKET_OPEN','MARKET_MOVERS','MARKET_CLOSE','OIIS_CANDIDATES')),
  trade_date date NOT NULL,
  slot text NOT NULL,
  source_run_id uuid REFERENCES oiis_live.selection_run(run_id),
  scheduled_for timestamptz NOT NULL,
  started_at timestamptz,
  completed_at timestamptz,
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','RUNNING','COMPLETED','SUPPRESSED','FAILED_DATA_QUALITY','FAILED')),
  suppression_reason text,
  source_data_as_of timestamptz,
  error_code text,
  error_excerpt text,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS market_status_scheduled_job_uidx
  ON market_status.job_run(job_name,trade_date,slot) WHERE source_run_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS market_status_oiis_job_uidx
  ON market_status.job_run(source_run_id) WHERE source_run_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS market_status_job_claim_idx
  ON market_status.job_run(status,scheduled_for,created_at) WHERE status='PENDING';

CREATE TABLE IF NOT EXISTS market_status.notification_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL UNIQUE,
  event_type text NOT NULL CHECK (event_type IN (
    'market.open.snapshot.v1','market.movers.snapshot.v1',
    'market.oiis.candidates.changed.v1','market.close.snapshot.v1')),
  dedupe_key text NOT NULL UNIQUE,
  trade_date date NOT NULL,
  destination_key text NOT NULL,
  source_run_id uuid REFERENCES oiis_live.selection_run(run_id),
  semantic_fingerprint text,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','SENDING','RETRY','SENT','DEAD_LETTER')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_attempt_at timestamptz,
  sent_at timestamptz,
  response_status integer,
  response_excerpt text,
  last_error text,
  correlation_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS market_status_outbox_claim_idx
  ON market_status.notification_outbox(status,next_attempt_at,created_at)
  WHERE status IN ('PENDING','RETRY');

CREATE TABLE IF NOT EXISTS market_status.notification_delivery_attempt (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outbox_id uuid NOT NULL REFERENCES market_status.notification_outbox(id),
  attempt_number integer NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  outcome text NOT NULL CHECK (outcome IN ('SENDING','SENT','RETRY','DEAD_LETTER')),
  http_status integer,
  response_excerpt text,
  error_excerpt text,
  UNIQUE(outbox_id,attempt_number)
);

CREATE TABLE IF NOT EXISTS market_status.notification_state (
  event_family text NOT NULL,
  destination_key text NOT NULL,
  trade_date date NOT NULL,
  last_successful_membership jsonb,
  last_successful_fingerprint text,
  last_successful_event_id uuid,
  last_successful_source_run_id uuid,
  last_successful_at timestamptz,
  last_enqueued_fingerprint text,
  last_enqueued_event_id uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(event_family,destination_key,trade_date)
);

CREATE TABLE IF NOT EXISTS market_status.worker_state (
  state_key text PRIMARY KEY,
  state_value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS market_status.service_heartbeat (
  service_name text PRIMARY KEY,
  status text NOT NULL CHECK (status IN ('OK','DISABLED','DEGRADED','ERROR')),
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_success_at timestamptz,
  last_error_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON SCHEMA market_status IS
  'Isolated V1 market intelligence jobs and delivery. No paper-trading route, event, table or outbox ownership.';

COMMIT;
