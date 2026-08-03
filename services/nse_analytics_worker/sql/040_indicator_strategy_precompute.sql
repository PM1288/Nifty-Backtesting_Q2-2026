CREATE TABLE IF NOT EXISTS nse_app.batch_run_audit (
    batch_run_id BIGSERIAL PRIMARY KEY,
    job_run_id BIGINT REFERENCES nse_app.job_runs(job_run_id) ON DELETE SET NULL,
    batch_name TEXT NOT NULL,
    batch_scope TEXT NOT NULL DEFAULT 'daily_eod',
    data_as_of_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'running',
    validation_status TEXT NOT NULL DEFAULT 'pending',
    published_flag BOOLEAN NOT NULL DEFAULT FALSE,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    published_at TIMESTAMPTZ,
    superseded_at TIMESTAMPTZ,
    stale_after TIMESTAMPTZ,
    universe_membership_mode TEXT,
    config_version TEXT,
    row_counts JSONB NOT NULL DEFAULT '{}'::jsonb,
    validation_metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
    assumptions_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    error_message TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_batch_run_audit_published
    ON nse_app.batch_run_audit (batch_name)
    WHERE published_flag;

CREATE INDEX IF NOT EXISTS idx_batch_run_audit_batch_date
    ON nse_app.batch_run_audit (batch_name, data_as_of_date DESC, generated_at DESC);

CREATE TABLE IF NOT EXISTS nse_app.strategy_scenario_catalog (
    scenario_id TEXT PRIMARY KEY,
    indicator_slug TEXT NOT NULL,
    scenario_key TEXT NOT NULL,
    scenario_label TEXT NOT NULL,
    short_description TEXT,
    universe TEXT NOT NULL,
    universe_membership_mode TEXT NOT NULL,
    benchmark_symbol TEXT,
    benchmark_label TEXT,
    lookback_years INTEGER NOT NULL,
    entry_rule TEXT NOT NULL,
    exit_rule TEXT NOT NULL,
    capital_model TEXT NOT NULL,
    starting_capital NUMERIC,
    ticket_size_rule TEXT NOT NULL,
    max_open_positions INTEGER,
    priority_rule TEXT NOT NULL,
    priority_rule_note TEXT,
    transaction_cost_bps NUMERIC NOT NULL DEFAULT 0,
    slippage_bps NUMERIC NOT NULL DEFAULT 0,
    execution_assumption JSONB NOT NULL DEFAULT '{}'::jsonb,
    scenario_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    include_on_indicator_page BOOLEAN NOT NULL DEFAULT FALSE,
    active_flag BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_strategy_scenario_catalog_indicator
    ON nse_app.strategy_scenario_catalog (indicator_slug, active_flag, include_on_indicator_page, scenario_key);

CREATE TABLE IF NOT EXISTS nse_app.indicator_daily_values (
    batch_run_id BIGINT NOT NULL REFERENCES nse_app.batch_run_audit(batch_run_id) ON DELETE CASCADE,
    indicator_slug TEXT NOT NULL,
    universe TEXT NOT NULL,
    trade_date DATE NOT NULL,
    symbol TEXT NOT NULL,
    security_name TEXT,
    sector TEXT,
    open_price NUMERIC,
    high_price NUMERIC,
    low_price NUMERIC,
    close_price NUMERIC,
    total_traded_qty BIGINT,
    indicator_value NUMERIC,
    signal_rank_value NUMERIC,
    band_key TEXT,
    band_label TEXT,
    data_quality_flag TEXT NOT NULL DEFAULT 'ok',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (batch_run_id, indicator_slug, universe, trade_date, symbol)
);

CREATE INDEX IF NOT EXISTS idx_indicator_daily_values_lookup
    ON nse_app.indicator_daily_values (indicator_slug, universe, trade_date DESC, symbol);

CREATE TABLE IF NOT EXISTS nse_app.indicator_summary_snapshot (
    batch_run_id BIGINT NOT NULL REFERENCES nse_app.batch_run_audit(batch_run_id) ON DELETE CASCADE,
    indicator_slug TEXT NOT NULL,
    universe TEXT NOT NULL,
    snapshot_date DATE NOT NULL,
    data_as_of_date DATE NOT NULL,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_stale BOOLEAN NOT NULL DEFAULT FALSE,
    payload_json JSONB NOT NULL,
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    PRIMARY KEY (batch_run_id, indicator_slug, universe, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_indicator_summary_snapshot_lookup
    ON nse_app.indicator_summary_snapshot (indicator_slug, universe, snapshot_date DESC, generated_at DESC);

CREATE TABLE IF NOT EXISTS nse_app.strategy_trade_log (
    trade_log_id BIGSERIAL PRIMARY KEY,
    batch_run_id BIGINT NOT NULL REFERENCES nse_app.batch_run_audit(batch_run_id) ON DELETE CASCADE,
    scenario_id TEXT NOT NULL REFERENCES nse_app.strategy_scenario_catalog(scenario_id) ON DELETE RESTRICT,
    indicator_slug TEXT NOT NULL,
    universe TEXT NOT NULL,
    symbol TEXT NOT NULL,
    security_name TEXT,
    sector TEXT,
    signal_trade_date DATE NOT NULL,
    signal_value NUMERIC,
    priority_value NUMERIC,
    entry_date DATE NOT NULL,
    entry_price NUMERIC NOT NULL,
    entry_shares NUMERIC,
    gross_entry_value NUMERIC,
    ticket_size NUMERIC,
    target_price NUMERIC,
    exit_signal_date DATE,
    exit_date DATE,
    exit_reason TEXT,
    exit_price NUMERIC,
    gross_exit_value NUMERIC,
    total_fees NUMERIC,
    net_pnl NUMERIC,
    net_return_pct NUMERIC,
    holding_days INTEGER,
    trade_status TEXT NOT NULL,
    execution_notes JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_strategy_trade_log_batch_scenario
    ON nse_app.strategy_trade_log (batch_run_id, scenario_id, trade_status, symbol, entry_date DESC);

CREATE TABLE IF NOT EXISTS nse_app.strategy_daily_equity (
    batch_run_id BIGINT NOT NULL REFERENCES nse_app.batch_run_audit(batch_run_id) ON DELETE CASCADE,
    scenario_id TEXT NOT NULL REFERENCES nse_app.strategy_scenario_catalog(scenario_id) ON DELETE RESTRICT,
    trade_date DATE NOT NULL,
    active_positions INTEGER NOT NULL DEFAULT 0,
    deployed_capital NUMERIC,
    available_cash NUMERIC,
    market_value NUMERIC,
    total_equity NUMERIC,
    equity_index NUMERIC,
    daily_return_pct NUMERIC,
    drawdown_pct NUMERIC,
    benchmark_close NUMERIC,
    benchmark_return_pct NUMERIC,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (batch_run_id, scenario_id, trade_date)
);

CREATE INDEX IF NOT EXISTS idx_strategy_daily_equity_lookup
    ON nse_app.strategy_daily_equity (scenario_id, trade_date DESC);

CREATE TABLE IF NOT EXISTS nse_app.strategy_summary_snapshot (
    batch_run_id BIGINT NOT NULL REFERENCES nse_app.batch_run_audit(batch_run_id) ON DELETE CASCADE,
    scenario_id TEXT NOT NULL REFERENCES nse_app.strategy_scenario_catalog(scenario_id) ON DELETE RESTRICT,
    indicator_slug TEXT NOT NULL,
    universe TEXT NOT NULL,
    snapshot_date DATE NOT NULL,
    data_as_of_date DATE NOT NULL,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_stale BOOLEAN NOT NULL DEFAULT FALSE,
    payload_json JSONB NOT NULL,
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    PRIMARY KEY (batch_run_id, scenario_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_strategy_summary_snapshot_lookup
    ON nse_app.strategy_summary_snapshot (scenario_id, snapshot_date DESC, generated_at DESC);

CREATE TABLE IF NOT EXISTS nse_app.strategy_stock_summary (
    batch_run_id BIGINT NOT NULL REFERENCES nse_app.batch_run_audit(batch_run_id) ON DELETE CASCADE,
    scenario_id TEXT NOT NULL REFERENCES nse_app.strategy_scenario_catalog(scenario_id) ON DELETE RESTRICT,
    symbol TEXT NOT NULL,
    security_name TEXT,
    sector TEXT,
    trade_count INTEGER NOT NULL DEFAULT 0,
    closed_trade_count INTEGER NOT NULL DEFAULT 0,
    open_trade_count INTEGER NOT NULL DEFAULT 0,
    win_rate_pct NUMERIC,
    avg_return_pct NUMERIC,
    median_return_pct NUMERIC,
    total_net_pnl NUMERIC,
    avg_holding_days NUMERIC,
    last_entry_date DATE,
    last_exit_date DATE,
    current_status TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (batch_run_id, scenario_id, symbol)
);

CREATE INDEX IF NOT EXISTS idx_strategy_stock_summary_lookup
    ON nse_app.strategy_stock_summary (scenario_id, symbol);

CREATE TABLE IF NOT EXISTS nse_app.strategy_open_positions (
    batch_run_id BIGINT NOT NULL REFERENCES nse_app.batch_run_audit(batch_run_id) ON DELETE CASCADE,
    scenario_id TEXT NOT NULL REFERENCES nse_app.strategy_scenario_catalog(scenario_id) ON DELETE RESTRICT,
    as_of_date DATE NOT NULL,
    symbol TEXT NOT NULL,
    security_name TEXT,
    sector TEXT,
    signal_trade_date DATE NOT NULL,
    entry_date DATE NOT NULL,
    entry_price NUMERIC NOT NULL,
    current_price NUMERIC,
    current_indicator_value NUMERIC,
    target_price NUMERIC,
    days_open INTEGER,
    entry_shares NUMERIC,
    allocated_capital NUMERIC,
    market_value NUMERIC,
    unrealized_pnl NUMERIC,
    unrealized_return_pct NUMERIC,
    priority_value NUMERIC,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (batch_run_id, scenario_id, symbol, entry_date)
);

CREATE INDEX IF NOT EXISTS idx_strategy_open_positions_lookup
    ON nse_app.strategy_open_positions (scenario_id, as_of_date DESC, symbol);
