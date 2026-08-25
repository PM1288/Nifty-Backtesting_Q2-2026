BEGIN;

CREATE TABLE IF NOT EXISTS rolling_monthly.rolling_window_evaluation (
  evaluation_id text PRIMARY KEY,
  strategy_version text NOT NULL,
  symbol text NOT NULL,
  signal_date date NOT NULL,
  selection_status text NOT NULL CHECK (selection_status IN ('SELECTED','REJECTED','INCOMPLETE','QUALIFIED_CONTINUATION')),
  selected_candidate_id text,
  evaluated_condition_count integer NOT NULL DEFAULT 0,
  passed_condition_count integer NOT NULL DEFAULT 0,
  failed_condition_codes text[] NOT NULL DEFAULT ARRAY[]::text[],
  conditions jsonb NOT NULL DEFAULT '[]'::jsonb,
  rejection_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  factor_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  data_quality jsonb NOT NULL DEFAULT '{}'::jsonb,
  refreshed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(strategy_version,symbol,signal_date)
);

CREATE INDEX IF NOT EXISTS ix_rolling_window_evaluation_status
  ON rolling_monthly.rolling_window_evaluation(strategy_version,signal_date DESC,selection_status,symbol);

COMMENT ON TABLE rolling_monthly.rolling_window_evaluation IS
  'Latest all-stock 5/30/60 evaluation ledger, including rejected and incomplete symbols with condition evidence.';

COMMIT;
