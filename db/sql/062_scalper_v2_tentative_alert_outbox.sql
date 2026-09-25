BEGIN;

CREATE SCHEMA IF NOT EXISTS nse_ops;

CREATE TABLE IF NOT EXISTS nse_ops.scalper_v2_tentative_alert_outbox (
  event_key text PRIMARY KEY CHECK (event_key ~ '^[0-9a-f]{64}$'),
  trade_date date NOT NULL,
  snapshot_time timestamptz NOT NULL,
  underlying_symbol text NOT NULL,
  expiry date NOT NULL,
  direction text NOT NULL CHECK (direction IN ('CALL','PUT')),
  ce_symbol text NOT NULL,
  pe_symbol text NOT NULL,
  payload jsonb NOT NULL,
  created_by text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','PROCESSING','RETRY','DELIVERED','SUPPRESSED_STALE','DEAD')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  available_at timestamptz NOT NULL DEFAULT now(),
  lease_expires_at timestamptz,
  delivered_at timestamptz,
  last_http_status integer,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS scalper_v2_tentative_alert_queue_idx
  ON nse_ops.scalper_v2_tentative_alert_outbox(status, available_at, snapshot_time)
  WHERE status IN ('PENDING','RETRY','PROCESSING');
CREATE INDEX IF NOT EXISTS scalper_v2_tentative_alert_day_idx
  ON nse_ops.scalper_v2_tentative_alert_outbox(trade_date, created_at DESC);

COMMENT ON TABLE nse_ops.scalper_v2_tentative_alert_outbox IS
  'Idempotent WhatsApp outbox for exact, completed-bar Scalper V2 tentative EMA alignment references; never represents an order or fill.';

COMMIT;
