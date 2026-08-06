BEGIN;

CREATE SCHEMA IF NOT EXISTS strategy_eval;

CREATE TABLE IF NOT EXISTS strategy_eval.entry_path_evaluation (
    entry_path_id TEXT PRIMARY KEY,
    run_id UUID NOT NULL,
    strategy_version_id TEXT NOT NULL,
    symbol TEXT NOT NULL,
    entry_fill_ts TIMESTAMPTZ NOT NULL,
    entry_price NUMERIC NOT NULL,
    quantity INTEGER NOT NULL,
    evaluation_policy_id TEXT NOT NULL,
    path_evidence_hash TEXT NOT NULL,
    coverage_status TEXT NOT NULL,
    evaluated_through_stage TEXT NOT NULL,
    best_intraday_target_id TEXT,
    best_d5_target_id TEXT,
    deepest_adverse_level_id TEXT,
    mfe_d5_pct NUMERIC,
    mae_d5_pct NUMERIC,
    data_snapshot_hash TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (run_id, symbol, entry_fill_ts, evaluation_policy_id)
);

CREATE TABLE IF NOT EXISTS strategy_eval.ladder_event (
    entry_path_id TEXT NOT NULL REFERENCES strategy_eval.entry_path_evaluation(entry_path_id) ON DELETE CASCADE,
    evaluation_policy_id TEXT NOT NULL,
    level_id TEXT NOT NULL,
    level_kind TEXT NOT NULL CHECK (level_kind IN ('REWARD','ADVERSE')),
    window_id TEXT NOT NULL,
    level_pct NUMERIC NOT NULL,
    raw_price NUMERIC NOT NULL,
    tick_price NUMERIC,
    hit_flag BOOLEAN NOT NULL,
    first_touch_ts TIMESTAMPTZ,
    first_touch_stage TEXT,
    first_touch_kind TEXT,
    opportunity_price NUMERIC,
    same_bar_order_ambiguous BOOLEAN NOT NULL DEFAULT FALSE,
    sequence TEXT,
    hit_on_d0 BOOLEAN NOT NULL DEFAULT FALSE,
    hit_after_d0 BOOLEAN NOT NULL DEFAULT FALSE,
    evidence_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    PRIMARY KEY (entry_path_id, level_id, evaluation_policy_id)
);

CREATE TABLE IF NOT EXISTS strategy_eval.path_checkpoint (
    entry_path_id TEXT NOT NULL REFERENCES strategy_eval.entry_path_evaluation(entry_path_id) ON DELETE CASCADE,
    evaluation_policy_id TEXT NOT NULL,
    stage TEXT NOT NULL,
    checkpoint_ts TIMESTAMPTZ NOT NULL,
    close_price NUMERIC NOT NULL,
    return_pct NUMERIC NOT NULL,
    mfe_pct NUMERIC NOT NULL,
    mae_pct NUMERIC NOT NULL,
    highest_reward_level TEXT,
    worst_adverse_level TEXT,
    capital_locked_flag BOOLEAN NOT NULL,
    PRIMARY KEY (entry_path_id, stage, evaluation_policy_id)
);

CREATE TABLE IF NOT EXISTS strategy_eval.execution_scenario_result (
    entry_path_id TEXT NOT NULL REFERENCES strategy_eval.entry_path_evaluation(entry_path_id) ON DELETE CASCADE,
    execution_scenario_id TEXT NOT NULL,
    run_id UUID NOT NULL,
    path_evidence_hash TEXT NOT NULL,
    status TEXT NOT NULL,
    exit_ts TIMESTAMPTZ,
    exit_price NUMERIC,
    exit_reason TEXT,
    realised_gross_pnl NUMERIC NOT NULL DEFAULT 0,
    costs NUMERIC NOT NULL DEFAULT 0,
    tax_reserve NUMERIC NOT NULL DEFAULT 0,
    after_tax_pnl NUMERIC NOT NULL DEFAULT 0,
    capital_released BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (entry_path_id, execution_scenario_id, run_id)
);

CREATE INDEX IF NOT EXISTS idx_ladder_event_policy_level_hit
    ON strategy_eval.ladder_event (evaluation_policy_id, level_kind, level_id, hit_flag);
CREATE INDEX IF NOT EXISTS idx_entry_path_run_symbol
    ON strategy_eval.entry_path_evaluation (run_id, symbol);
CREATE INDEX IF NOT EXISTS idx_path_checkpoint_stage
    ON strategy_eval.path_checkpoint (stage, checkpoint_ts);

COMMIT;
