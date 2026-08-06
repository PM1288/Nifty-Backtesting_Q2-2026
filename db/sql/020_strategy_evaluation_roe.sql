-- Strategy Evaluation Rules of Engagement v1.0
-- Additive, fail-closed research evaluation schema. No broker-order authority.

CREATE SCHEMA IF NOT EXISTS strategy_eval;

CREATE TABLE IF NOT EXISTS strategy_eval.evaluation_policy (
    policy_version TEXT PRIMARY KEY,
    policy_name TEXT NOT NULL,
    document_reference TEXT NOT NULL,
    effective_from DATE NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('draft', 'active', 'retired')),
    policy_json JSONB NOT NULL,
    source_sha256 TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS strategy_eval.market_event (
    event_id TEXT PRIMARY KEY,
    information_date DATE NOT NULL,
    anchor_session DATE NOT NULL,
    event_timestamp_ist TIMESTAMPTZ,
    timestamp_precision TEXT,
    market_phase TEXT,
    event_name TEXT NOT NULL,
    event_category TEXT,
    event_subcategory TEXT,
    geography TEXT,
    scheduled_status TEXT,
    surprise_class TEXT,
    data_status TEXT,
    day_direction TEXT,
    day_magnitude TEXT,
    intraday_stress_zone TEXT,
    persistence_pattern TEXT,
    attribution_confidence TEXT,
    confidence_score NUMERIC,
    affected_sectors TEXT,
    overlap_confounder TEXT,
    review_status TEXT,
    point_in_time_eligible BOOLEAN NOT NULL DEFAULT FALSE,
    raw_record JSONB NOT NULL,
    source_workbook_sha256 TEXT NOT NULL,
    ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_strategy_eval_event_anchor
    ON strategy_eval.market_event (anchor_session, event_category);

CREATE TABLE IF NOT EXISTS strategy_eval.event_window (
    event_id TEXT NOT NULL REFERENCES strategy_eval.market_event(event_id) ON DELETE CASCADE,
    horizon_label TEXT NOT NULL,
    sessions INTEGER NOT NULL,
    window_start_date DATE,
    window_end_date DATE,
    return_pct NUMERIC,
    direction_class TEXT,
    magnitude_class TEXT,
    continuation_or_reversal TEXT,
    boundary_status TEXT,
    contamination_risk TEXT,
    raw_record JSONB NOT NULL,
    PRIMARY KEY (event_id, horizon_label)
);

CREATE TABLE IF NOT EXISTS strategy_eval.source_register (
    source_id TEXT PRIMARY KEY,
    domain TEXT,
    source_type TEXT,
    quality_rank INTEGER,
    source_url TEXT,
    usage_note TEXT,
    raw_record JSONB NOT NULL,
    source_workbook_sha256 TEXT NOT NULL,
    ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS strategy_eval.market_regime_daily (
    trade_date DATE NOT NULL,
    instrument_type TEXT NOT NULL CHECK (instrument_type IN ('INDEX', 'STOCK')),
    symbol TEXT NOT NULL,
    policy_version TEXT NOT NULL REFERENCES strategy_eval.evaluation_policy(policy_version),
    close_price NUMERIC,
    return_1d_pct NUMERIC,
    return_5d_pct NUMERIC,
    return_21d_pct NUMERIC,
    return_63d_pct NUMERIC,
    trend_1d TEXT NOT NULL,
    trend_5d TEXT NOT NULL,
    trend_21d TEXT NOT NULL,
    trend_63d TEXT NOT NULL,
    primary_trend TEXT NOT NULL,
    persistence_class TEXT NOT NULL,
    realised_vol_20d_pct NUMERIC,
    volatility_regime TEXT NOT NULL,
    india_vix NUMERIC,
    vix_regime TEXT NOT NULL,
    market_zone TEXT NOT NULL,
    data_quality_flag TEXT NOT NULL,
    source_batch_run_id BIGINT,
    calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (trade_date, instrument_type, symbol, policy_version)
);

CREATE INDEX IF NOT EXISTS idx_strategy_eval_regime_lookup
    ON strategy_eval.market_regime_daily (symbol, trade_date DESC, primary_trend, market_zone);

CREATE TABLE IF NOT EXISTS strategy_eval.run_evaluation (
    evaluation_id BIGSERIAL PRIMARY KEY,
    backtest_run_id BIGINT NOT NULL REFERENCES nse_app.backtest_run(backtest_run_id) ON DELETE CASCADE,
    policy_version TEXT NOT NULL REFERENCES strategy_eval.evaluation_policy(policy_version),
    result_type TEXT NOT NULL CHECK (result_type IN (
        'OPPORTUNITY_SCAN', 'SIGNAL_STUDY', 'TRUE_BACKTEST_ISOLATED',
        'TRUE_BACKTEST_PORTFOLIO', 'WALK_FORWARD_VALIDATION', 'PAPER_SHADOW_FORWARD'
    )),
    rankability_status TEXT NOT NULL CHECK (rankability_status IN ('RANKABLE', 'NOT_RANKABLE')),
    rating TEXT NOT NULL CHECK (rating IN ('A', 'B', 'C', 'D', 'E', 'NR')),
    quality_score NUMERIC,
    evidence_multiplier NUMERIC,
    revenue_capacity_score NUMERIC,
    validation_status TEXT NOT NULL CHECK (validation_status IN ('PASS', 'WARN', 'FAIL', 'NOT_ASSESSED')),
    validation_json JSONB NOT NULL,
    good_when_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    avoid_when_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    watch_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    limitation_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    evaluated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    evaluator_version TEXT NOT NULL,
    UNIQUE (backtest_run_id, policy_version)
);

CREATE INDEX IF NOT EXISTS idx_strategy_eval_run_lookup
    ON strategy_eval.run_evaluation (policy_version, rankability_status, result_type, evaluated_at DESC);

CREATE TABLE IF NOT EXISTS strategy_eval.trade_path_summary (
    trade_log_id BIGINT PRIMARY KEY REFERENCES nse_app.backtest_trade_log(trade_log_id) ON DELETE CASCADE,
    evaluation_id BIGINT NOT NULL REFERENCES strategy_eval.run_evaluation(evaluation_id) ON DELETE CASCADE,
    mfe_pct NUMERIC,
    mae_pct NUMERIC,
    minutes_to_mfe INTEGER,
    minutes_to_mae INTEGER,
    minutes_underwater INTEGER,
    clean_success BOOLEAN,
    recovery_band TEXT,
    failure_class TEXT,
    path_complete BOOLEAN NOT NULL DEFAULT FALSE,
    path_json JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS strategy_eval.trade_target_event (
    trade_log_id BIGINT NOT NULL REFERENCES nse_app.backtest_trade_log(trade_log_id) ON DELETE CASCADE,
    target_pct NUMERIC NOT NULL,
    touched_at TIMESTAMPTZ,
    executable_at TIMESTAMPTZ,
    filled_at TIMESTAMPTZ,
    achieved BOOLEAN NOT NULL,
    PRIMARY KEY (trade_log_id, target_pct)
);

CREATE TABLE IF NOT EXISTS strategy_eval.trade_adverse_event (
    trade_log_id BIGINT NOT NULL REFERENCES nse_app.backtest_trade_log(trade_log_id) ON DELETE CASCADE,
    adverse_pct NUMERIC NOT NULL,
    first_breached_at TIMESTAMPTZ,
    breached BOOLEAN NOT NULL,
    PRIMARY KEY (trade_log_id, adverse_pct)
);

CREATE TABLE IF NOT EXISTS strategy_eval.trade_context_snapshot (
    trade_log_id BIGINT PRIMARY KEY REFERENCES nse_app.backtest_trade_log(trade_log_id) ON DELETE CASCADE,
    stock_regime_date DATE,
    stock_primary_trend TEXT,
    stock_market_zone TEXT,
    nifty_primary_trend TEXT,
    nifty_market_zone TEXT,
    india_vix NUMERIC,
    vix_regime TEXT,
    event_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    context_json JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS strategy_eval.period_metric (
    evaluation_id BIGINT NOT NULL REFERENCES strategy_eval.run_evaluation(evaluation_id) ON DELETE CASCADE,
    period_type TEXT NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    metrics_json JSONB NOT NULL,
    PRIMARY KEY (evaluation_id, period_type, period_start, period_end)
);

CREATE TABLE IF NOT EXISTS strategy_eval.slice_metric (
    evaluation_id BIGINT NOT NULL REFERENCES strategy_eval.run_evaluation(evaluation_id) ON DELETE CASCADE,
    slice_type TEXT NOT NULL,
    slice_key TEXT NOT NULL,
    sample_size INTEGER NOT NULL,
    metrics_json JSONB NOT NULL,
    suitability TEXT NOT NULL CHECK (suitability IN ('GOOD', 'AVOID', 'WATCH', 'UNKNOWN')),
    PRIMARY KEY (evaluation_id, slice_type, slice_key)
);

CREATE TABLE IF NOT EXISTS strategy_eval.strategy_score_dimension (
    evaluation_id BIGINT NOT NULL REFERENCES strategy_eval.run_evaluation(evaluation_id) ON DELETE CASCADE,
    dimension_name TEXT NOT NULL,
    weight NUMERIC NOT NULL,
    raw_score NUMERIC,
    adjusted_score NUMERIC,
    evidence_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    PRIMARY KEY (evaluation_id, dimension_name)
);

CREATE TABLE IF NOT EXISTS strategy_eval.strategy_suitability (
    evaluation_id BIGINT NOT NULL REFERENCES strategy_eval.run_evaluation(evaluation_id) ON DELETE CASCADE,
    context_type TEXT NOT NULL,
    context_key TEXT NOT NULL,
    suitability TEXT NOT NULL CHECK (suitability IN ('GOOD', 'AVOID', 'WATCH', 'UNKNOWN')),
    reason TEXT NOT NULL,
    evidence_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    PRIMARY KEY (evaluation_id, context_type, context_key)
);

CREATE TABLE IF NOT EXISTS strategy_eval.no_trade_rule (
    rule_id TEXT PRIMARY KEY,
    policy_version TEXT NOT NULL REFERENCES strategy_eval.evaluation_policy(policy_version),
    rule_type TEXT NOT NULL CHECK (rule_type IN ('HARD_BLOCKER', 'LEARNED')),
    rule_name TEXT NOT NULL,
    predicate_json JSONB NOT NULL,
    rationale TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('active', 'candidate', 'retired')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS strategy_eval.comparison_run (
    comparison_id BIGSERIAL PRIMARY KEY,
    policy_version TEXT NOT NULL REFERENCES strategy_eval.evaluation_policy(policy_version),
    evaluation_ids JSONB NOT NULL,
    compatibility_status TEXT NOT NULL CHECK (compatibility_status IN ('PASS', 'FAIL')),
    compatibility_json JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS strategy_eval.artifact_manifest (
    artifact_id BIGSERIAL PRIMARY KEY,
    evaluation_id BIGINT REFERENCES strategy_eval.run_evaluation(evaluation_id) ON DELETE CASCADE,
    artifact_type TEXT NOT NULL,
    artifact_path TEXT NOT NULL,
    sha256 TEXT NOT NULL,
    size_bytes BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (evaluation_id, artifact_path)
);

CREATE OR REPLACE VIEW strategy_eval.v_latest_strategy_evaluation AS
SELECT DISTINCT ON (s.strategy_id, r.scenario_key)
    s.strategy_id,
    s.display_name,
    v.strategy_version_id,
    r.backtest_run_id,
    r.scenario_key,
    r.scenario_label,
    r.as_of_date,
    e.policy_version,
    e.result_type,
    e.rankability_status,
    e.rating,
    e.quality_score,
    e.revenue_capacity_score,
    e.validation_status,
    e.validation_json,
    e.good_when_json,
    e.avoid_when_json,
    e.watch_json,
    e.limitation_json,
    e.evaluated_at,
    e.evaluation_id
FROM nse_app.backtest_strategy s
JOIN nse_app.backtest_strategy_version v ON v.strategy_id = s.strategy_id
JOIN nse_app.backtest_run r ON r.strategy_version_id = v.strategy_version_id
JOIN strategy_eval.run_evaluation e ON e.backtest_run_id = r.backtest_run_id
ORDER BY s.strategy_id, r.scenario_key, r.as_of_date DESC, e.evaluated_at DESC;

COMMENT ON SCHEMA strategy_eval IS
    'Fail-closed strategy evaluation evidence. Retrospective event labels are not trading-time inputs unless point_in_time_eligible is true.';
