BEGIN;

CREATE TABLE IF NOT EXISTS rolling_monthly.absolute_first_session_run (
  run_id uuid PRIMARY KEY,
  evaluation_month date NOT NULL,
  strategy_version text NOT NULL,
  status text NOT NULL CHECK (status IN ('RUNNING','COMPLETED','FAILED','INCOMPLETE')),
  maturity_state text NOT NULL CHECK (maturity_state IN ('DEVELOPING','MATURED','INCOMPLETE')),
  universe_size integer NOT NULL,
  evaluated_symbol_count integer NOT NULL DEFAULT 0,
  eligible_setup_count integer NOT NULL DEFAULT 0,
  scenario_count integer NOT NULL DEFAULT 0,
  entered_scenario_count integer NOT NULL DEFAULT 0,
  incomplete_symbol_count integer NOT NULL DEFAULT 0,
  source_start_date date,
  source_end_date date,
  data_as_of timestamptz NOT NULL DEFAULT now(),
  methodology jsonb NOT NULL DEFAULT '{}'::jsonb,
  quality_metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_excerpt text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (evaluation_month,strategy_version),
  CHECK (evaluation_month=date_trunc('month',evaluation_month)::date)
);

CREATE TABLE IF NOT EXISTS rolling_monthly.absolute_first_session_candidate (
  candidate_id uuid PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES rolling_monthly.absolute_first_session_run(run_id) ON DELETE CASCADE,
  strategy_version text NOT NULL,
  evaluation_month date NOT NULL,
  symbol text NOT NULL,
  company_name text,
  sector text,
  gap_threshold_pct numeric NOT NULL CHECK (gap_threshold_pct>0),
  first_session_date date NOT NULL,
  previous_session_date date NOT NULL,
  previous_close numeric NOT NULL CHECK (previous_close>0),
  first_session_open numeric NOT NULL CHECK (first_session_open>0),
  opening_gap_pct numeric NOT NULL,
  entry_mode text NOT NULL CHECK (entry_mode IN ('FIRST_SESSION_OPEN','WAIT_FOR_GAP_FILL')),
  entry_status text NOT NULL CHECK (entry_status IN ('ENTERED','NOT_ENTERED_GAP_UNFILLED')),
  entry_date date,
  entry_price numeric CHECK (entry_price>0),
  evaluation_end_date date NOT NULL,
  evaluation_status text NOT NULL CHECK (evaluation_status IN ('DEVELOPING','MATURED','INCOMPLETE')),
  observed_sessions integer NOT NULL DEFAULT 0,
  month_two_open numeric NOT NULL,
  month_two_close numeric NOT NULL,
  month_one_open numeric NOT NULL,
  month_one_close numeric NOT NULL,
  completed_week_open numeric NOT NULL,
  completed_week_close numeric NOT NULL,
  prior_week_open numeric NOT NULL,
  prior_week_close numeric NOT NULL,
  conditions jsonb NOT NULL,
  path_end_price numeric,
  end_return_pct numeric,
  max_profit_price numeric,
  max_profit_pct numeric,
  max_profit_date date,
  max_drawdown_price numeric,
  max_drawdown_pct numeric,
  max_drawdown_date date,
  profit_per_share numeric,
  max_profit_per_share numeric,
  max_drawdown_per_share numeric,
  quantity_10000 integer NOT NULL DEFAULT 0 CHECK (quantity_10000>=0),
  invested_10000 numeric NOT NULL DEFAULT 0,
  end_pnl_10000 numeric,
  max_profit_10000 numeric,
  max_drawdown_10000 numeric,
  source_provenance jsonb NOT NULL,
  data_quality jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (evaluation_month,strategy_version,symbol,gap_threshold_pct),
  CHECK ((entry_status='ENTERED' AND entry_date IS NOT NULL AND entry_price IS NOT NULL)
      OR (entry_status='NOT_ENTERED_GAP_UNFILLED' AND entry_date IS NULL AND entry_price IS NULL))
);

CREATE INDEX IF NOT EXISTS absolute_first_session_candidate_month_idx
  ON rolling_monthly.absolute_first_session_candidate (evaluation_month DESC,gap_threshold_pct,symbol);
CREATE INDEX IF NOT EXISTS absolute_first_session_candidate_symbol_idx
  ON rolling_monthly.absolute_first_session_candidate (symbol,evaluation_month DESC);
CREATE INDEX IF NOT EXISTS absolute_first_session_run_latest_idx
  ON rolling_monthly.absolute_first_session_run (evaluation_month DESC,data_as_of DESC)
  WHERE status='COMPLETED';

COMMIT;
