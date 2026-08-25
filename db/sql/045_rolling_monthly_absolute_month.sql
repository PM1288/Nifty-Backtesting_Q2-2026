BEGIN;

CREATE TABLE IF NOT EXISTS rolling_monthly.absolute_month_run (
  run_id uuid PRIMARY KEY,
  evaluation_month date NOT NULL,
  strategy_version text NOT NULL,
  status text NOT NULL CHECK (status IN ('RUNNING','COMPLETED','FAILED','INCOMPLETE')),
  maturity_state text NOT NULL CHECK (maturity_state IN ('DEVELOPING','MATURED','INCOMPLETE')),
  universe_size integer NOT NULL,
  evaluated_symbol_count integer NOT NULL DEFAULT 0,
  qualified_count integer NOT NULL DEFAULT 0,
  incomplete_symbol_count integer NOT NULL DEFAULT 0,
  source_start_date date,
  source_end_date date,
  data_as_of timestamptz NOT NULL DEFAULT now(),
  methodology jsonb NOT NULL DEFAULT '{}'::jsonb,
  quality_metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_excerpt text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (evaluation_month, strategy_version),
  CHECK (evaluation_month = date_trunc('month', evaluation_month)::date)
);

CREATE TABLE IF NOT EXISTS rolling_monthly.absolute_month_candidate (
  candidate_id uuid PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES rolling_monthly.absolute_month_run(run_id) ON DELETE CASCADE,
  strategy_version text NOT NULL,
  evaluation_month date NOT NULL,
  symbol text NOT NULL,
  company_name text,
  sector text,
  signal_date date NOT NULL,
  entry_date date NOT NULL,
  entry_price numeric NOT NULL CHECK (entry_price > 0),
  evaluation_end_date date NOT NULL,
  evaluation_status text NOT NULL CHECK (evaluation_status IN ('DEVELOPING','MATURED','INCOMPLETE')),
  observed_post_entry_sessions integer NOT NULL DEFAULT 0,
  month_two_open numeric NOT NULL,
  month_two_close numeric NOT NULL,
  month_one_open numeric NOT NULL,
  month_one_close numeric NOT NULL,
  current_week_open numeric NOT NULL,
  current_week_close_asof numeric NOT NULL,
  previous_week_open numeric NOT NULL,
  previous_week_close numeric NOT NULL,
  previous_day_open numeric NOT NULL,
  previous_day_close numeric NOT NULL,
  signal_day_open numeric NOT NULL,
  signal_day_close numeric NOT NULL,
  conditions jsonb NOT NULL,
  path_end_price numeric NOT NULL,
  end_return_pct numeric NOT NULL,
  max_profit_price numeric NOT NULL,
  max_profit_pct numeric NOT NULL,
  max_profit_date date,
  max_drawdown_price numeric NOT NULL,
  max_drawdown_pct numeric NOT NULL,
  max_drawdown_date date,
  profit_per_share numeric NOT NULL,
  max_profit_per_share numeric NOT NULL,
  max_drawdown_per_share numeric NOT NULL,
  source_provenance jsonb NOT NULL,
  data_quality jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, symbol),
  UNIQUE (evaluation_month, strategy_version, symbol)
);

CREATE INDEX IF NOT EXISTS absolute_month_candidate_month_idx
  ON rolling_monthly.absolute_month_candidate (evaluation_month DESC, symbol);
CREATE INDEX IF NOT EXISTS absolute_month_candidate_symbol_idx
  ON rolling_monthly.absolute_month_candidate (symbol, signal_date DESC);
CREATE INDEX IF NOT EXISTS absolute_month_run_latest_idx
  ON rolling_monthly.absolute_month_run (evaluation_month DESC, data_as_of DESC)
  WHERE status='COMPLETED';

COMMIT;
