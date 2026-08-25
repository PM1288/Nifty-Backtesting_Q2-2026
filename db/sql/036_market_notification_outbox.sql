BEGIN;

CREATE SCHEMA IF NOT EXISTS market_notifications;

CREATE TABLE IF NOT EXISTS market_notifications.notification_event (
  event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key text NOT NULL UNIQUE,
  event_type text NOT NULL CHECK (event_type IN ('MARKET_OPEN','MARKET_MOVERS','MARKET_CLOSE','OIIS_LEADERS')),
  trading_date date NOT NULL,
  scheduled_for timestamptz NOT NULL,
  source_run_id uuid REFERENCES oiis_live.selection_run(run_id),
  candidate_signature text,
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','PROCESSING','RETRY','DELIVERED','SUPPRESSED','DEAD')),
  suppression_reason text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  available_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS market_notification_claim_idx
  ON market_notifications.notification_event(status, available_at, created_at)
  WHERE status IN ('PENDING','RETRY');
CREATE INDEX IF NOT EXISTS market_notification_trade_date_idx
  ON market_notifications.notification_event(trading_date, event_type, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS market_notification_source_run_idx
  ON market_notifications.notification_event(source_run_id)
  WHERE source_run_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS market_notifications.delivery_attempt (
  attempt_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES market_notifications.notification_event(event_id),
  attempt_number integer NOT NULL CHECK (attempt_number > 0),
  requested_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  http_status integer,
  outcome text NOT NULL CHECK (outcome IN ('STARTED','DELIVERED','RETRY','DEAD')),
  response_excerpt text,
  error_detail text,
  UNIQUE(event_id, attempt_number)
);

CREATE TABLE IF NOT EXISTS market_notifications.notification_state (
  state_key text PRIMARY KEY,
  state_value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS market_notifications.service_heartbeat (
  service_name text PRIMARY KEY,
  status text NOT NULL CHECK (status IN ('OK','DEGRADED','ERROR')),
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_success_at timestamptz,
  last_error_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON SCHEMA market_notifications IS
  'Independent market and OIIS WhatsApp notification ledger; no paper-trading state or webhook ownership.';
COMMENT ON COLUMN market_notifications.notification_event.candidate_signature IS
  'Sorted LONG/SHORT symbol identity used to suppress unchanged OIIS leader sets; score and rank-only changes do not notify.';

COMMIT;
