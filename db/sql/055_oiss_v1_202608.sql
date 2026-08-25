BEGIN;

CREATE SCHEMA IF NOT EXISTS oiss;

CREATE TABLE IF NOT EXISTS oiss.strategy_version (
  strategy_id text NOT NULL,
  strategy_version text NOT NULL,
  formula_version text NOT NULL,
  config_version text NOT NULL,
  config jsonb NOT NULL,
  config_hash text NOT NULL,
  status text NOT NULL CHECK (status IN ('SHADOW','PAPER','DISABLED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(strategy_id,strategy_version,formula_version,config_version)
);

CREATE TABLE IF NOT EXISTS oiss.run (
  run_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_oiis_run_id uuid REFERENCES oiis_live.selection_run(run_id),
  strategy_id text NOT NULL,
  strategy_version text NOT NULL,
  formula_version text NOT NULL,
  config_version text NOT NULL,
  run_date date NOT NULL,
  scan_timestamp timestamptz NOT NULL,
  scan_sequence integer NOT NULL,
  market_session text NOT NULL,
  market_stage text NOT NULL,
  trading_mode text NOT NULL,
  primary_data_source text,
  backup_data_source text,
  data_quality_grade text NOT NULL,
  data_quality_score numeric(10,4),
  overall_confidence numeric(10,4),
  previous_run_id uuid REFERENCES oiss.run(run_id),
  code_commit text,
  build_version text,
  status text NOT NULL CHECK (status IN ('RUNNING','COMPLETED','FAILED','BLOCKED_DATA')),
  sections jsonb NOT NULL DEFAULT '{}'::jsonb,
  runtime_metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  result_hash text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(strategy_id,strategy_version,scan_timestamp,formula_version,config_version),
  UNIQUE(source_oiis_run_id,strategy_id,formula_version,config_version)
);
CREATE INDEX IF NOT EXISTS oiss_run_latest_idx ON oiss.run(run_date DESC,scan_timestamp DESC) WHERE status='COMPLETED';

CREATE TABLE IF NOT EXISTS oiss.sector_score (
  run_id uuid NOT NULL REFERENCES oiss.run(run_id) ON DELETE CASCADE,
  sector text NOT NULL,
  rank integer,
  score numeric(10,4),
  state text NOT NULL,
  relative_strength numeric(10,4), breadth numeric(10,4), money_flow numeric(10,4), participation numeric(10,4), persistence numeric(10,4),
  previous_score numeric(10,4), change numeric(10,4), evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(run_id,sector)
);

CREATE TABLE IF NOT EXISTS oiss.candidate (
  candidate_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES oiss.run(run_id) ON DELETE CASCADE,
  source_oiis_candidate_id uuid REFERENCES oiis_live.daily_candidate(candidate_id),
  strategy_id text NOT NULL, strategy_version text NOT NULL, formula_version text NOT NULL, config_version text NOT NULL,
  as_of timestamptz NOT NULL, symbol text NOT NULL, company_name text, sector text, direction text NOT NULL,
  fno_eligible boolean NOT NULL DEFAULT false, option_eligible boolean NOT NULL DEFAULT false, lot_size integer,
  ofactor_long numeric(10,4), ofactor_short numeric(10,4), ofactor numeric(10,4), xfactor numeric(10,4), tqs numeric(10,4),
  extension_atr numeric(10,4), extension_state text NOT NULL, data_quality_score numeric(10,4), data_quality_grade text NOT NULL,
  canonical_status text NOT NULL, selected boolean NOT NULL DEFAULT false, rank integer,
  why jsonb NOT NULL, missing_confirmation jsonb NOT NULL, upgrade_condition text NOT NULL, invalidation text NOT NULL,
  entry_plan jsonb NOT NULL DEFAULT '{}'::jsonb, option_selection jsonb NOT NULL DEFAULT '{}'::jsonb,
  position_sizing jsonb NOT NULL DEFAULT '{}'::jsonb, horizon_scores jsonb NOT NULL DEFAULT '{}'::jsonb,
  rejection jsonb NOT NULL DEFAULT '{}'::jsonb, feature_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_max_event_time timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(run_id,symbol), CHECK(source_max_event_time <= as_of)
);
CREATE INDEX IF NOT EXISTS oiss_candidate_radar_idx ON oiss.candidate(run_id,selected,tqs DESC NULLS LAST);

CREATE TABLE IF NOT EXISTS oiss.scan_change (
  run_id uuid NOT NULL REFERENCES oiss.run(run_id) ON DELETE CASCADE, candidate_id uuid NOT NULL REFERENCES oiss.candidate(candidate_id) ON DELETE CASCADE,
  symbol text NOT NULL, previous_status text, current_status text NOT NULL, previous_ofactor numeric(10,4), current_ofactor numeric(10,4),
  previous_xfactor numeric(10,4), current_xfactor numeric(10,4), previous_tqs numeric(10,4), current_tqs numeric(10,4),
  change_kind text NOT NULL, changed_components jsonb NOT NULL, reason_changed text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(run_id,symbol)
);

CREATE TABLE IF NOT EXISTS oiss.backtest_outcome (
  candidate_id uuid PRIMARY KEY REFERENCES oiss.candidate(candidate_id) ON DELETE CASCADE,
  run_id uuid NOT NULL REFERENCES oiss.run(run_id) ON DELETE CASCADE, symbol text NOT NULL, direction text NOT NULL,
  entry_price numeric(18,8), outcome_state text NOT NULL, observed_through timestamptz,
  returns jsonb NOT NULL DEFAULT '{}'::jsonb, extrema jsonb NOT NULL DEFAULT '{}'::jsonb,
  target_path jsonb NOT NULL DEFAULT '{}'::jsonb, source_max_event_time timestamptz,
  evaluated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS oiss.paper_claim (
  claim_id uuid PRIMARY KEY DEFAULT gen_random_uuid(), candidate_id uuid NOT NULL REFERENCES oiss.candidate(candidate_id),
  idempotency_key text NOT NULL UNIQUE, status text NOT NULL CHECK(status IN ('SUPPRESSED','CLAIMED','ACCEPTED','FAILED')),
  paper_trade_intent_id uuid, detail jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

COMMIT;
