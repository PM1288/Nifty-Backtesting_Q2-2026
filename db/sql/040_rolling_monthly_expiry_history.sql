BEGIN;

CREATE TABLE IF NOT EXISTS rolling_monthly.expiry_run (
  expiry_month date PRIMARY KEY CHECK (expiry_month = date_trunc('month', expiry_month)::date),
  scheduled_expiry_date date NOT NULL,
  signal_date date,
  entry_date date,
  run_id uuid REFERENCES rolling_monthly.run(run_id) ON DELETE SET NULL,
  status text NOT NULL CHECK (status IN ('COMPLETED','INCOMPLETE','FAILED')),
  data_as_of timestamptz NOT NULL DEFAULT now(),
  error_excerpt text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rolling_monthly_expiry_run_signal_idx
  ON rolling_monthly.expiry_run(signal_date DESC);

COMMIT;
