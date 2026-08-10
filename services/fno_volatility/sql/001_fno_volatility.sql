CREATE SCHEMA IF NOT EXISTS fno_volatility;

CREATE TABLE IF NOT EXISTS fno_volatility.schema_migration (
  version TEXT PRIMARY KEY,
  checksum TEXT NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fno_volatility.strategy_version (
  strategy_id TEXT NOT NULL,
  version TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PAPER','RESEARCH','RETIRED')),
  config JSONB NOT NULL,
  config_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (strategy_id, version)
);

CREATE TABLE IF NOT EXISTS fno_volatility.signal_run (
  run_id UUID PRIMARY KEY,
  strategy_id TEXT NOT NULL,
  strategy_version TEXT NOT NULL,
  trade_date DATE NOT NULL,
  run_slot TEXT NOT NULL,
  decision_as_of TIMESTAMPTZ NOT NULL,
  execution_timestamp TIMESTAMPTZ NOT NULL,
  stage TEXT NOT NULL CHECK (stage IN ('PREMARKET','LIVE')),
  status TEXT NOT NULL CHECK (status IN ('RUNNING','COMPLETED','FAILED','BLOCKED_DATA')),
  requested_underlyings INT NOT NULL DEFAULT 0,
  evaluated_underlyings INT NOT NULL DEFAULT 0,
  shortlisted_underlyings INT NOT NULL DEFAULT 0,
  actionable_signals INT NOT NULL DEFAULT 0,
  source_eod_date DATE,
  source_minute_ts TIMESTAMPTZ,
  source_quote_ts TIMESTAMPTZ,
  data_quality JSONB NOT NULL DEFAULT '{}'::jsonb,
  result_hash TEXT,
  error_detail TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  UNIQUE (strategy_id, strategy_version, trade_date, run_slot, stage),
  FOREIGN KEY (strategy_id, strategy_version)
    REFERENCES fno_volatility.strategy_version(strategy_id, version)
);

CREATE TABLE IF NOT EXISTS fno_volatility.universe_snapshot (
  run_id UUID NOT NULL REFERENCES fno_volatility.signal_run(run_id),
  underlying TEXT NOT NULL,
  cash_symbol_token TEXT,
  nearest_future_token TEXT,
  nearest_future_expiry DATE,
  nearest_option_expiry DATE,
  active_option_contracts INT NOT NULL DEFAULT 0,
  active_call_contracts INT NOT NULL DEFAULT 0,
  active_put_contracts INT NOT NULL DEFAULT 0,
  data_status TEXT NOT NULL,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (run_id, underlying)
);

CREATE TABLE IF NOT EXISTS fno_volatility.movement_prediction (
  run_id UUID NOT NULL REFERENCES fno_volatility.signal_run(run_id),
  underlying TEXT NOT NULL,
  source_trade_date DATE NOT NULL,
  movement_rank INT,
  move_score_pre NUMERIC,
  move_score_live NUMERIC,
  predicted_abs_move_p50 NUMERIC,
  predicted_abs_move_p75 NUMERIC,
  predicted_abs_move_p90 NUMERIC,
  probability_top_quintile NUMERIC,
  probability_up NUMERIC,
  direction_entropy NUMERIC,
  opening_gap_pct NUMERIC,
  opening_range_pct NUMERIC,
  opening_volume_pace NUMERIC,
  features JSONB NOT NULL,
  feature_availability JSONB NOT NULL,
  shortlisted BOOLEAN NOT NULL DEFAULT false,
  model_kind TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, underlying)
);

CREATE TABLE IF NOT EXISTS fno_volatility.option_candidate (
  candidate_id UUID PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES fno_volatility.signal_run(run_id),
  underlying TEXT NOT NULL,
  structure_type TEXT NOT NULL CHECK (structure_type IN ('ATM_STRADDLE','NARROW_STRANGLE','MEDIUM_STRANGLE')),
  expiry DATE NOT NULL,
  call_token TEXT NOT NULL,
  call_symbol TEXT NOT NULL,
  call_strike NUMERIC NOT NULL,
  put_token TEXT NOT NULL,
  put_symbol TEXT NOT NULL,
  put_strike NUMERIC NOT NULL,
  lot_size INT NOT NULL,
  spot_price NUMERIC,
  futures_price NUMERIC,
  call_bid NUMERIC,
  call_ask NUMERIC,
  put_bid NUMERIC,
  put_ask NUMERIC,
  combined_entry_ask NUMERIC,
  combined_mark_bid NUMERIC,
  combined_spread_pct NUMERIC,
  implied_move_pct NUMERIC,
  call_iv NUMERIC,
  put_iv NUMERIC,
  predicted_iv_change NUMERIC,
  forecast_implied_ratio NUMERIC,
  expected_return_pct NUMERIC,
  probability_profit NUMERIC,
  pnl_p10 NUMERIC,
  pnl_p50 NUMERIC,
  pnl_p90 NUMERIC,
  expected_shortfall_95 NUMERIC,
  greek_edge_pct NUMERIC,
  quote_as_of TIMESTAMPTZ,
  quote_source_as_of TIMESTAMPTZ,
  quote_age_seconds INT,
  data_status TEXT NOT NULL,
  rejection_reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  scenario_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (run_id, underlying, structure_type, expiry, call_token, put_token)
);

CREATE TABLE IF NOT EXISTS fno_volatility.trade_signal (
  signal_id UUID PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES fno_volatility.signal_run(run_id),
  candidate_id UUID REFERENCES fno_volatility.option_candidate(candidate_id),
  underlying TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('BUY_STRADDLE','BUY_STRANGLE','NO_TRADE')),
  confidence TEXT NOT NULL CHECK (confidence IN ('LOW','MEDIUM','HIGH','NOT_ESTIMABLE')),
  rank INT,
  reason_codes JSONB NOT NULL,
  paper_submit_status TEXT NOT NULL DEFAULT 'NOT_SUBMITTED',
  paper_trade_intent_id UUID,
  paper_trade_group_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (run_id, underlying)
);

CREATE TABLE IF NOT EXISTS fno_volatility.service_heartbeat (
  service_name TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_success_at TIMESTAMPTZ,
  last_error_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fno_signal_run_date_idx
  ON fno_volatility.signal_run (trade_date DESC, stage, completed_at DESC);
CREATE INDEX IF NOT EXISTS fno_prediction_rank_idx
  ON fno_volatility.movement_prediction (run_id, shortlisted DESC, movement_rank);
CREATE INDEX IF NOT EXISTS fno_candidate_rank_idx
  ON fno_volatility.option_candidate (run_id, expected_return_pct DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS fno_trade_signal_idx
  ON fno_volatility.trade_signal (run_id, decision, rank);

CREATE OR REPLACE VIEW fno_volatility.v_latest_run AS
SELECT DISTINCT ON (stage) *
FROM fno_volatility.signal_run
WHERE status IN ('COMPLETED','BLOCKED_DATA')
ORDER BY stage, trade_date DESC, completed_at DESC NULLS LAST;

CREATE OR REPLACE VIEW fno_volatility.v_latest_signals AS
SELECT s.*, c.structure_type, c.expiry, c.call_symbol, c.put_symbol,
       c.call_strike, c.put_strike, c.futures_price, c.combined_entry_ask,
       c.combined_spread_pct, c.implied_move_pct, c.forecast_implied_ratio,
       c.expected_return_pct, c.probability_profit,
       c.quote_source_as_of, c.quote_age_seconds, c.data_status,
       p.move_score_pre, p.move_score_live, p.predicted_abs_move_p50,
       p.predicted_abs_move_p75, p.predicted_abs_move_p90,
       p.direction_entropy AS movement_direction_entropy
FROM fno_volatility.trade_signal s
LEFT JOIN fno_volatility.option_candidate c ON c.candidate_id=s.candidate_id
JOIN fno_volatility.movement_prediction p ON p.run_id=s.run_id AND p.underlying=s.underlying;
