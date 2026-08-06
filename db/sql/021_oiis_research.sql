BEGIN;

CREATE SCHEMA IF NOT EXISTS oiis;

CREATE TABLE IF NOT EXISTS oiis.formula_version (
    formula_version TEXT PRIMARY KEY,
    strategy_id TEXT NOT NULL,
    status TEXT NOT NULL,
    config_json JSONB NOT NULL,
    config_sha256 TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS oiis.replay_run (
    replay_run_id UUID PRIMARY KEY,
    strategy_id TEXT NOT NULL,
    formula_version TEXT NOT NULL REFERENCES oiis.formula_version(formula_version),
    universe_name TEXT NOT NULL,
    membership_mode TEXT NOT NULL,
    requested_start DATE NOT NULL,
    requested_end DATE NOT NULL,
    actual_start DATE,
    actual_end DATE,
    symbol_filter TEXT,
    symbol_count INTEGER NOT NULL DEFAULT 0,
    decision_count INTEGER NOT NULL DEFAULT 0,
    enterable_count INTEGER NOT NULL DEFAULT 0,
    trade_count INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL CHECK (status IN ('RUNNING','SUCCEEDED','FAILED')),
    run_hash TEXT NOT NULL,
    limitations_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    metrics_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    error_message TEXT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ
);

ALTER TABLE oiis.replay_run
    ADD COLUMN IF NOT EXISTS result_type TEXT NOT NULL DEFAULT 'TRUE_BACKTEST_ISOLATED',
    ADD COLUMN IF NOT EXISTS rankability_status TEXT NOT NULL DEFAULT 'NOT_RANKABLE',
    ADD COLUMN IF NOT EXISTS rating TEXT NOT NULL DEFAULT 'NR',
    ADD COLUMN IF NOT EXISTS governance_json JSONB NOT NULL DEFAULT '{"reason":"point_in_time_universe_and_out_of_sample_evidence_incomplete"}'::jsonb;

CREATE TABLE IF NOT EXISTS oiis.decision_snapshot (
    decision_id BIGSERIAL PRIMARY KEY,
    replay_run_id UUID NOT NULL REFERENCES oiis.replay_run(replay_run_id) ON DELETE CASCADE,
    symbol TEXT NOT NULL,
    sector TEXT,
    trade_date DATE NOT NULL,
    data_quality_score NUMERIC NOT NULL,
    data_permission TEXT NOT NULL,
    ofactor_long NUMERIC NOT NULL,
    ofactor_short NUMERIC NOT NULL,
    directional_edge NUMERIC NOT NULL,
    selected_direction TEXT NOT NULL,
    setup_id TEXT,
    setup_state TEXT NOT NULL,
    xfactor_score NUMERIC NOT NULL,
    decision_code TEXT NOT NULL,
    hard_gates_json JSONB NOT NULL,
    evidence_json JSONB NOT NULL,
    stock_primary_trend TEXT,
    stock_market_zone TEXT,
    nifty_primary_trend TEXT,
    nifty_market_zone TEXT,
    bank_nifty_primary_trend TEXT,
    bank_nifty_market_zone TEXT,
    vix_regime TEXT,
    decision_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (replay_run_id, symbol, trade_date)
);

CREATE INDEX IF NOT EXISTS idx_oiis_decision_run_code
    ON oiis.decision_snapshot (replay_run_id, decision_code, trade_date, symbol);
CREATE INDEX IF NOT EXISTS idx_oiis_decision_regime
    ON oiis.decision_snapshot (nifty_primary_trend, stock_primary_trend, vix_regime, decision_code);

CREATE TABLE IF NOT EXISTS oiis.trade_outcome (
    outcome_id BIGSERIAL PRIMARY KEY,
    decision_id BIGINT NOT NULL REFERENCES oiis.decision_snapshot(decision_id) ON DELETE CASCADE,
    entry_date DATE NOT NULL,
    exit_date DATE NOT NULL,
    entry_price NUMERIC NOT NULL,
    exit_price NUMERIC NOT NULL,
    stop_price NUMERIC NOT NULL,
    target_price NUMERIC NOT NULL,
    quantity INTEGER NOT NULL,
    exit_reason TEXT NOT NULL,
    gross_pnl NUMERIC NOT NULL,
    costs NUMERIC NOT NULL,
    tax_reserve NUMERIC NOT NULL,
    after_tax_net_pnl NUMERIC NOT NULL,
    return_pct NUMERIC NOT NULL,
    holding_sessions INTEGER NOT NULL,
    mfe_pct NUMERIC,
    mae_pct NUMERIC,
    outcome_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    UNIQUE (decision_id)
);

CREATE TABLE IF NOT EXISTS oiis.performance_bucket (
    replay_run_id UUID NOT NULL REFERENCES oiis.replay_run(replay_run_id) ON DELETE CASCADE,
    bucket_type TEXT NOT NULL,
    bucket_key TEXT NOT NULL,
    decision_count INTEGER NOT NULL,
    trade_count INTEGER NOT NULL,
    win_rate_pct NUMERIC,
    avg_return_pct NUMERIC,
    median_return_pct NUMERIC,
    after_tax_net_pnl NUMERIC,
    metrics_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    PRIMARY KEY (replay_run_id, bucket_type, bucket_key)
);

CREATE TABLE IF NOT EXISTS oiis.artifact_manifest (
    artifact_id BIGSERIAL PRIMARY KEY,
    replay_run_id UUID NOT NULL REFERENCES oiis.replay_run(replay_run_id) ON DELETE CASCADE,
    artifact_type TEXT NOT NULL,
    artifact_path TEXT NOT NULL,
    sha256 TEXT NOT NULL,
    size_bytes BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (replay_run_id, artifact_path)
);

COMMIT;
