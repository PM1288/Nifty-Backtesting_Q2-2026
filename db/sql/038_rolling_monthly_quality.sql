BEGIN;

CREATE SCHEMA IF NOT EXISTS rolling_monthly;

CREATE TABLE IF NOT EXISTS rolling_monthly.strategy_version (
  strategy_id text NOT NULL,
  version text NOT NULL,
  side text NOT NULL CHECK (side IN ('LONG','SHORT')),
  base_strategy_id text NOT NULL,
  scanner_segment text NOT NULL,
  configuration jsonb NOT NULL,
  configuration_hash text NOT NULL,
  status text NOT NULL DEFAULT 'RESEARCH',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (strategy_id, version)
);

CREATE TABLE IF NOT EXISTS rolling_monthly.run (
  run_id uuid PRIMARY KEY,
  signal_date date NOT NULL,
  entry_date date,
  factor_version text NOT NULL,
  configuration_hash text NOT NULL,
  universe_size integer NOT NULL DEFAULT 0,
  nifty50_coverage integer NOT NULL DEFAULT 0,
  source_max_date date,
  data_as_of timestamptz,
  status text NOT NULL CHECK (status IN ('RUNNING','COMPLETED','FAILED','INCOMPLETE')),
  quality_status text NOT NULL DEFAULT 'UNKNOWN',
  long_scanner_count integer NOT NULL DEFAULT 0,
  short_scanner_count integer NOT NULL DEFAULT 0,
  high_count integer NOT NULL DEFAULT 0,
  medium_count integer NOT NULL DEFAULT 0,
  low_count integer NOT NULL DEFAULT 0,
  error_excerpt text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (signal_date, factor_version)
);

CREATE TABLE IF NOT EXISTS rolling_monthly.candidate (
  candidate_id uuid PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES rolling_monthly.run(run_id) ON DELETE CASCADE,
  base_strategy_id text NOT NULL,
  derived_strategy_id text NOT NULL,
  quality_factor_id text NOT NULL,
  quality_factor_version text NOT NULL,
  symbol text NOT NULL,
  sector text,
  side text NOT NULL CHECK (side IN ('LONG','SHORT')),
  signal_date date NOT NULL,
  entry_date date,
  signal_close numeric,
  entry_price numeric,
  primary_target_price numeric,
  stop_price numeric,
  universe_size integer NOT NULL,
  same_side_occurrence_count integer NOT NULL,
  quality_band text NOT NULL CHECK (quality_band IN ('HIGH','MEDIUM','LOW','INCOMPLETE')),
  quality_score numeric,
  mandatory_gate_pass boolean NOT NULL DEFAULT false,
  confirmation_count integer NOT NULL DEFAULT 0,
  entry_eligible boolean,
  entry_rejection_reason text,
  deployment_action text NOT NULL,
  rank integer,
  scanner_evidence jsonb NOT NULL,
  component_snapshot jsonb NOT NULL,
  quality_reasons jsonb NOT NULL,
  data_quality jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, symbol, side)
);

CREATE INDEX IF NOT EXISTS rolling_monthly_candidate_run_rank_idx
  ON rolling_monthly.candidate (run_id, side, quality_band, rank);
CREATE INDEX IF NOT EXISTS rolling_monthly_candidate_symbol_date_idx
  ON rolling_monthly.candidate (symbol, signal_date DESC);
CREATE INDEX IF NOT EXISTS rolling_monthly_run_latest_idx
  ON rolling_monthly.run (signal_date DESC, completed_at DESC)
  WHERE status='COMPLETED';

CREATE TABLE IF NOT EXISTS rolling_monthly.reference_metric (
  factor_version text NOT NULL,
  side text NOT NULL,
  quality_band text NOT NULL,
  metric_key text NOT NULL,
  metric_value numeric,
  sample_size integer,
  source_label text NOT NULL,
  source_as_of date NOT NULL,
  limitations jsonb NOT NULL DEFAULT '[]'::jsonb,
  PRIMARY KEY (factor_version, side, quality_band, metric_key)
);

CREATE TABLE IF NOT EXISTS rolling_monthly.service_heartbeat (
  service_name text PRIMARY KEY,
  status text NOT NULL,
  last_seen_at timestamptz NOT NULL,
  last_successful_run_id uuid,
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);

INSERT INTO rolling_monthly.reference_metric
  (factor_version,side,quality_band,metric_key,metric_value,sample_size,source_label,source_as_of,limitations)
VALUES
  ('2.0.0-research','LONG','BASELINE','clean_3pct_5d_pct',32.7069876688,13624,'Supplied five-year research fixture','2026-08-07','["RETROSPECTIVE_CURRENT_FNO_MEMBERSHIP","DAILY_OHLC_PATH_LIMIT"]'),
  ('2.0.0-research','LONG','BASELINE','profit_factor_t5_s2',0.9766940874,13624,'Supplied five-year research fixture','2026-08-07','["GROSS_BEFORE_COSTS"]'),
  ('2.0.0-research','LONG','HIGH','clean_3pct_5d_pct',51.7006802721,147,'Supplied five-year research fixture','2026-08-07','["SMALL_SAMPLE","NOT_PRISTINE_OOS"]'),
  ('2.0.0-research','LONG','HIGH','profit_factor_t5_s2',2.0598533237,147,'Supplied five-year research fixture','2026-08-07','["GROSS_BEFORE_COSTS","SMALL_SAMPLE"]'),
  ('2.0.0-research','LONG','HIGH','median_mfe_5d_pct',3.947368,147,'Supplied five-year research fixture','2026-08-07','["DAILY_OHLC_PATH_LIMIT"]'),
  ('2.0.0-research','LONG','HIGH','median_mae_5d_pct',1.753753,147,'Supplied five-year research fixture','2026-08-07','["DAILY_OHLC_PATH_LIMIT"]'),
  ('2.0.0-research','SHORT','BASELINE','clean_3pct_5d_pct',35.2355743780,9445,'Supplied five-year research fixture','2026-08-07','["CASH_UNDERLYING_PROXY","DAILY_OHLC_PATH_LIMIT"]'),
  ('2.0.0-research','SHORT','BASELINE','profit_factor_t5_s2',1.0997126626,9445,'Supplied five-year research fixture','2026-08-07','["GROSS_BEFORE_COSTS","CASH_UNDERLYING_PROXY"]'),
  ('2.0.0-research','SHORT','HIGH','clean_3pct_5d_pct',57.5949367089,316,'Supplied five-year research fixture','2026-08-07','["NOT_PRISTINE_OOS"]'),
  ('2.0.0-research','SHORT','HIGH','profit_factor_t5_s2',2.5327968642,316,'Supplied five-year research fixture','2026-08-07','["GROSS_BEFORE_COSTS","CASH_UNDERLYING_PROXY"]'),
  ('2.0.0-research','SHORT','HIGH','median_mfe_5d_pct',4.4813325,316,'Supplied five-year research fixture','2026-08-07','["DAILY_OHLC_PATH_LIMIT"]'),
  ('2.0.0-research','SHORT','HIGH','median_mae_5d_pct',1.749791,316,'Supplied five-year research fixture','2026-08-07','["DAILY_OHLC_PATH_LIMIT"]')
ON CONFLICT (factor_version,side,quality_band,metric_key) DO UPDATE SET
  metric_value=excluded.metric_value,sample_size=excluded.sample_size,
  source_label=excluded.source_label,source_as_of=excluded.source_as_of,
  limitations=excluded.limitations;

COMMIT;
