CREATE SCHEMA IF NOT EXISTS nse_app;

CREATE TABLE IF NOT EXISTS nse_app.job_runs (
    job_run_id BIGSERIAL PRIMARY KEY,
    job_name TEXT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'running',
    notes TEXT,
    metrics JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS nse_app.job_steps (
    job_step_id BIGSERIAL PRIMARY KEY,
    job_run_id BIGINT NOT NULL REFERENCES nse_app.job_runs(job_run_id) ON DELETE CASCADE,
    step_name TEXT NOT NULL,
    step_order INTEGER NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'running',
    message TEXT,
    metrics JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS nse_app.quality_check_results (
    quality_check_result_id BIGSERIAL PRIMARY KEY,
    job_run_id BIGINT REFERENCES nse_app.job_runs(job_run_id) ON DELETE SET NULL,
    check_name TEXT NOT NULL,
    severity TEXT NOT NULL,
    status TEXT NOT NULL,
    observed_value NUMERIC,
    operator TEXT NOT NULL,
    threshold NUMERIC NOT NULL,
    checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    details JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS nse_app.security_daily_features (
    trade_date DATE NOT NULL,
    symbol TEXT NOT NULL,
    series TEXT NOT NULL,
    fininstrm_id BIGINT,
    isin TEXT,
    security_name TEXT,
    close_price NUMERIC,
    prev_close NUMERIC,
    open_price NUMERIC,
    high_price NUMERIC,
    low_price NUMERIC,
    total_traded_qty BIGINT,
    turnover_lacs NUMERIC,
    no_of_trades BIGINT,
    deliverable_qty BIGINT,
    deliverable_pct NUMERIC,
    current_day_daily_volatility NUMERIC,
    annualised_volatility NUMERIC,
    adjusted_52_week_high NUMERIC,
    adjusted_52_week_low NUMERIC,
    surveillance_non_default_flag_count INTEGER,
    bulk_buy_qty BIGINT,
    bulk_sell_qty BIGINT,
    block_buy_qty BIGINT,
    block_sell_qty BIGINT,
    short_sell_qty BIGINT,
    margin_financed_qty BIGINT,
    margin_financed_amt_lakhs NUMERIC,
    avg_applicable_margin_rate NUMERIC,
    has_announcement BOOLEAN NOT NULL DEFAULT FALSE,
    has_board_meeting BOOLEAN NOT NULL DEFAULT FALSE,
    has_corporate_action BOOLEAN NOT NULL DEFAULT FALSE,
    daily_return NUMERIC,
    gap_return NUMERIC,
    intraday_return NUMERIC,
    day_range_pct NUMERIC,
    close_location_value NUMERIC,
    distance_to_52w_high NUMERIC,
    distance_from_52w_low NUMERIC,
    ret_3d NUMERIC,
    ret_5d NUMERIC,
    ret_10d NUMERIC,
    avg_qty_20 NUMERIC,
    avg_deliverable_pct_20 NUMERIC,
    avg_daily_return_60 NUMERIC,
    stdev_daily_return_60 NUMERIC,
    volume_rel_20 NUMERIC,
    delivery_rel_20 NUMERIC,
    return_z_60 NUMERIC,
    prior_close_max_20 NUMERIC,
    prior_close_min_20 NUMERIC,
    breakout_20d_flag BOOLEAN NOT NULL DEFAULT FALSE,
    breakdown_20d_flag BOOLEAN NOT NULL DEFAULT FALSE,
    high_volume_flag BOOLEAN NOT NULL DEFAULT FALSE,
    high_delivery_flag BOOLEAN NOT NULL DEFAULT FALSE,
    fwd_return_1d NUMERIC,
    fwd_return_3d NUMERIC,
    fwd_return_5d NUMERIC,
    fwd_return_10d NUMERIC,
    composite_trend_score NUMERIC,
    composite_reversal_score NUMERIC,
    composite_anomaly_score NUMERIC,
    composite_risk_score NUMERIC,
    loaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (trade_date, symbol, series)
);

CREATE INDEX IF NOT EXISTS idx_security_daily_features_symbol_date
    ON nse_app.security_daily_features (symbol, series, trade_date DESC);

CREATE INDEX IF NOT EXISTS idx_security_daily_features_date
    ON nse_app.security_daily_features (trade_date DESC);

CREATE TABLE IF NOT EXISTS nse_app.stock_analysis_signals_daily (
    trade_date DATE NOT NULL,
    symbol TEXT NOT NULL,
    series TEXT NOT NULL,
    analysis_type TEXT NOT NULL,
    signal_name TEXT NOT NULL,
    signal_direction TEXT NOT NULL,
    signal_strength NUMERIC,
    rationale TEXT,
    daily_return NUMERIC,
    volume_rel_20 NUMERIC,
    delivery_rel_20 NUMERIC,
    short_sell_qty BIGINT,
    bulk_net_qty BIGINT,
    block_net_qty BIGINT,
    avg_applicable_margin_rate NUMERIC,
    surveillance_non_default_flag_count INTEGER,
    fwd_return_1d NUMERIC,
    fwd_return_3d NUMERIC,
    fwd_return_5d NUMERIC,
    fwd_return_10d NUMERIC,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (trade_date, symbol, series, analysis_type, signal_name)
);

CREATE INDEX IF NOT EXISTS idx_stock_analysis_signals_date_type
    ON nse_app.stock_analysis_signals_daily (trade_date DESC, analysis_type, signal_name);

CREATE TABLE IF NOT EXISTS nse_app.market_summary_daily (
    trade_date DATE PRIMARY KEY,
    securities_count INTEGER,
    advancers INTEGER,
    decliners INTEGER,
    unchanged INTEGER,
    positive_ratio NUMERIC,
    avg_daily_return NUMERIC,
    median_daily_return NUMERIC,
    total_turnover_lacs NUMERIC,
    avg_volume_rel_20 NUMERIC,
    avg_delivery_rel_20 NUMERIC,
    breakout_count INTEGER,
    breakdown_count INTEGER,
    accumulation_count INTEGER,
    distribution_count INTEGER,
    event_count INTEGER,
    anomaly_count INTEGER,
    risk_count INTEGER,
    near_52w_high_count INTEGER,
    near_52w_low_count INTEGER,
    surveillance_flagged_count INTEGER,
    nifty_close NUMERIC,
    nifty_return NUMERIC,
    market_regime TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS nse_app.signal_performance_summary (
    as_of_date DATE NOT NULL,
    analysis_type TEXT NOT NULL,
    signal_name TEXT NOT NULL,
    signal_direction TEXT NOT NULL,
    sample_size INTEGER,
    hit_rate_1d NUMERIC,
    hit_rate_3d NUMERIC,
    hit_rate_5d NUMERIC,
    hit_rate_10d NUMERIC,
    avg_fwd_return_1d NUMERIC,
    avg_fwd_return_3d NUMERIC,
    avg_fwd_return_5d NUMERIC,
    avg_fwd_return_10d NUMERIC,
    median_fwd_return_5d NUMERIC,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (as_of_date, analysis_type, signal_name, signal_direction)
);
