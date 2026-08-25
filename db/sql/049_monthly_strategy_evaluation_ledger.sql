BEGIN;

CREATE TABLE IF NOT EXISTS rolling_monthly.evaluation_ledger (
  evaluation_id uuid PRIMARY KEY,
  variant text NOT NULL CHECK (variant IN ('ABSOLUTE_MONTH','EXPIRY')),
  run_id uuid NOT NULL,
  evaluation_month date NOT NULL CHECK (evaluation_month = date_trunc('month', evaluation_month)::date),
  signal_date date,
  symbol text NOT NULL,
  company_name text,
  sector text,
  side text NOT NULL CHECK (side IN ('LONG','SHORT')),
  selection_status text NOT NULL CHECK (selection_status IN ('SELECTED','REJECTED','INCOMPLETE')),
  selected_candidate_id uuid,
  evaluated_condition_count integer NOT NULL DEFAULT 0,
  passed_condition_count integer NOT NULL DEFAULT 0,
  failed_condition_codes text[] NOT NULL DEFAULT ARRAY[]::text[],
  conditions jsonb NOT NULL DEFAULT '[]'::jsonb,
  rejection_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  data_quality jsonb NOT NULL DEFAULT '{}'::jsonb,
  data_as_of timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (variant, run_id, symbol, side)
);

CREATE INDEX IF NOT EXISTS rolling_monthly_evaluation_month_status_idx
  ON rolling_monthly.evaluation_ledger (variant, evaluation_month DESC, selection_status, symbol, side);
CREATE INDEX IF NOT EXISTS rolling_monthly_evaluation_symbol_idx
  ON rolling_monthly.evaluation_ledger (symbol, evaluation_month DESC, variant);

COMMENT ON TABLE rolling_monthly.evaluation_ledger IS
  'Point-in-time condition ledger for every symbol evaluated by the Absolute Month and Expiry strategies. Selected candidates remain in their canonical candidate tables.';

COMMIT;
