CREATE SCHEMA IF NOT EXISTS nse_ops;

CREATE TABLE IF NOT EXISTS nse_ops.home_mw5_qualification_outbox (
  event_key TEXT PRIMARY KEY,
  trade_date DATE NOT NULL,
  snapshot_time TIMESTAMPTZ NOT NULL,
  five_minute_bar_started_at TIMESTAMPTZ NOT NULL,
  symbol TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('BULL','BEAR')),
  route TEXT NOT NULL CHECK (route IN ('M-1','M-2')),
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','PROCESSING','RETRY','DELIVERED','DEAD','SUPPRESSED_STALE')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  lease_expires_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  last_http_status INTEGER,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (trade_date,symbol,direction,five_minute_bar_started_at)
);

CREATE INDEX IF NOT EXISTS home_mw5_qualification_pending_idx
  ON nse_ops.home_mw5_qualification_outbox(status,available_at,snapshot_time)
  WHERE status IN ('PENDING','RETRY','PROCESSING');

COMMENT ON TABLE nse_ops.home_mw5_qualification_outbox IS
  'Idempotent Home MWHD 5-minute qualification notifications; screener events only, never orders or fills.';
