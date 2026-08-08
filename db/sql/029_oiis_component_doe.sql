CREATE SCHEMA IF NOT EXISTS strategy_eval;
CREATE TABLE IF NOT EXISTS strategy_eval.oiis_doe_run (
 doe_run_id UUID PRIMARY KEY, experiment_id TEXT NOT NULL, symbol_filter TEXT,
 requested_start DATE NOT NULL, requested_end DATE NOT NULL, trial_count INTEGER NOT NULL,
 component_event_count BIGINT NOT NULL, trade_count BIGINT NOT NULL, status TEXT NOT NULL,
 output_path TEXT NOT NULL, config_json JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS strategy_eval.oiis_doe_trial (
 doe_run_id UUID REFERENCES strategy_eval.oiis_doe_run(doe_run_id) ON DELETE CASCADE,
 trial_id TEXT NOT NULL, phase TEXT NOT NULL, trial_kind TEXT NOT NULL, treatment_factor TEXT,
 decision_count BIGINT NOT NULL, ofactor_qualified_count BIGINT NOT NULL, enterable_count BIGINT NOT NULL,
 trade_count BIGINT NOT NULL, total_net_liquidation_pnl NUMERIC, median_mfe_pct NUMERIC,
 median_mae_pct NUMERIC, clean_target_rate_pct NUMERIC, config_json JSONB NOT NULL,
 PRIMARY KEY(doe_run_id,trial_id)
);
CREATE TABLE IF NOT EXISTS strategy_eval.oiis_doe_component_event (
 doe_run_id UUID REFERENCES strategy_eval.oiis_doe_run(doe_run_id) ON DELETE CASCADE,
 trial_id TEXT NOT NULL, symbol TEXT NOT NULL, trade_date DATE NOT NULL, direction TEXT NOT NULL,
 factor_layer TEXT NOT NULL, component_name TEXT NOT NULL, component_score NUMERIC,
 component_weight NUMERIC, weighted_contribution NUMERIC, ofactor_score NUMERIC,
 xfactor_score NUMERIC, decision_code TEXT, stock_regime TEXT, nifty_regime TEXT,
 PRIMARY KEY(doe_run_id,trial_id,symbol,trade_date,direction,factor_layer,component_name)
);
CREATE INDEX IF NOT EXISTS ix_oiis_doe_component_lookup ON strategy_eval.oiis_doe_component_event(component_name,stock_regime,nifty_regime);
