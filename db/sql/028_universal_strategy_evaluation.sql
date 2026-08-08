CREATE SCHEMA IF NOT EXISTS strategy_eval;
CREATE TABLE IF NOT EXISTS strategy_eval.universal_evaluation_run (
 evaluation_run_id UUID PRIMARY KEY, strategy_name TEXT NOT NULL, strategy_version TEXT NOT NULL,
 strategy_archetype TEXT NOT NULL, evaluation_mode TEXT NOT NULL, policy_id TEXT NOT NULL,
 input_path TEXT NOT NULL, output_path TEXT NOT NULL, requested_start DATE, requested_end DATE,
 actual_start DATE, actual_end DATE, trade_count BIGINT NOT NULL, validation_state TEXT NOT NULL,
 overall_score NUMERIC, config_json JSONB NOT NULL, summary_json JSONB NOT NULL,
 input_sha256 TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS strategy_eval.universal_validation_gate (
 evaluation_run_id UUID REFERENCES strategy_eval.universal_evaluation_run(evaluation_run_id) ON DELETE CASCADE,
 gate_name TEXT NOT NULL, status TEXT NOT NULL, evidence TEXT NOT NULL, PRIMARY KEY(evaluation_run_id,gate_name)
);
CREATE TABLE IF NOT EXISTS strategy_eval.universal_risk_register (
 evaluation_run_id UUID REFERENCES strategy_eval.universal_evaluation_run(evaluation_run_id) ON DELETE CASCADE,
 risk_id TEXT NOT NULL, description TEXT NOT NULL, severity TEXT NOT NULL, probability TEXT NOT NULL,
 affected_metric TEXT, mitigation TEXT, residual_risk TEXT, invalidates_conclusion TEXT NOT NULL,
 PRIMARY KEY(evaluation_run_id,risk_id)
);
CREATE TABLE IF NOT EXISTS strategy_eval.universal_artifact_manifest (
 evaluation_run_id UUID REFERENCES strategy_eval.universal_evaluation_run(evaluation_run_id) ON DELETE CASCADE,
 artifact_name TEXT NOT NULL, artifact_path TEXT NOT NULL, sha256 TEXT NOT NULL, size_bytes BIGINT NOT NULL,
 PRIMARY KEY(evaluation_run_id,artifact_name)
);
