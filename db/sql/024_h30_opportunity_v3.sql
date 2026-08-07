BEGIN;

CREATE SCHEMA IF NOT EXISTS strategy_eval;

CREATE TABLE IF NOT EXISTS strategy_eval.long_horizon_observation (
  entry_path_id text NOT NULL,
  horizon_policy_id text NOT NULL,
  data_snapshot_hash text NOT NULL,
  run_id uuid NOT NULL,
  strategy_version_id text NOT NULL,
  symbol text NOT NULL,
  entry_date date NOT NULL,
  entry_price numeric NOT NULL CHECK (entry_price > 0),
  sessions_observed integer NOT NULL CHECK (sessions_observed BETWEEN 0 AND 30),
  coverage_status text NOT NULL,
  rankable_flag boolean NOT NULL,
  max_close_price numeric,
  max_close_date date,
  max_close_session_index integer,
  after_tax_max_close_upside_pct numeric,
  mae_before_max_close_pct numeric,
  sessions_to_max_close integer,
  outcome_label text NOT NULL CHECK (outcome_label='HYPOTHETICAL_MAX_CLOSE_OPPORTUNITY_NOT_REALISED_PNL'),
  observation_hash text NOT NULL,
  observation_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (entry_path_id,horizon_policy_id,data_snapshot_hash),
  FOREIGN KEY (entry_path_id) REFERENCES strategy_eval.entry_path_evaluation(entry_path_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS strategy_eval.long_horizon_checkpoint (
  entry_path_id text NOT NULL,
  horizon_policy_id text NOT NULL,
  data_snapshot_hash text NOT NULL,
  session_index integer NOT NULL CHECK (session_index BETWEEN 0 AND 29),
  trade_date date NOT NULL,
  close_price numeric NOT NULL,
  close_return_pct numeric NOT NULL,
  max_close_so_far numeric NOT NULL,
  min_low_so_far numeric NOT NULL,
  underwater_flag boolean NOT NULL,
  checkpoint_hash text NOT NULL,
  checkpoint_json jsonb NOT NULL,
  PRIMARY KEY (entry_path_id,horizon_policy_id,data_snapshot_hash,session_index),
  FOREIGN KEY (entry_path_id,horizon_policy_id,data_snapshot_hash)
    REFERENCES strategy_eval.long_horizon_observation(entry_path_id,horizon_policy_id,data_snapshot_hash) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS strategy_eval.strategy_horizon_summary (
  run_id uuid NOT NULL,
  strategy_version_id text NOT NULL,
  horizon_policy_id text NOT NULL,
  summary_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id,strategy_version_id,horizon_policy_id)
);

CREATE TABLE IF NOT EXISTS strategy_eval.strategy_horizon_ranking (
  run_id uuid NOT NULL,
  strategy_version_id text NOT NULL,
  league text NOT NULL,
  ranking_config_id text NOT NULL,
  status text NOT NULL,
  final_score numeric,
  diagnostic_score numeric,
  blockers_json jsonb NOT NULL,
  ranking_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id,strategy_version_id,league,ranking_config_id)
);

CREATE TABLE IF NOT EXISTS strategy_eval.chart_artifact (
  run_id uuid NOT NULL,
  strategy_version_id text NOT NULL,
  chart_id text NOT NULL,
  format text NOT NULL,
  artifact_path text NOT NULL,
  sha256 text NOT NULL,
  size_bytes bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id,strategy_version_id,chart_id,format)
);

CREATE INDEX IF NOT EXISTS idx_h30_observation_run ON strategy_eval.long_horizon_observation(run_id,symbol,entry_date);
CREATE INDEX IF NOT EXISTS idx_h30_ranking_latest ON strategy_eval.strategy_horizon_ranking(strategy_version_id,created_at DESC);

COMMIT;
