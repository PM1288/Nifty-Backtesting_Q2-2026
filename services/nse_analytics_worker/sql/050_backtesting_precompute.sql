CREATE TABLE IF NOT EXISTS nse_app.backtest_strategy (
    strategy_id TEXT PRIMARY KEY,
    strategy_slug TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS nse_app.backtest_strategy_version (
    strategy_version_id TEXT PRIMARY KEY,
    strategy_id TEXT NOT NULL REFERENCES nse_app.backtest_strategy(strategy_id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    config_json JSONB NOT NULL,
    assumptions_json JSONB NOT NULL,
    fee_profile_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by TEXT,
    is_active_version BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_backtest_strategy_version_active
    ON nse_app.backtest_strategy_version (strategy_id, version_number);

CREATE TABLE IF NOT EXISTS nse_app.backtest_run (
    backtest_run_id BIGSERIAL PRIMARY KEY,
    batch_run_id BIGINT NOT NULL REFERENCES nse_app.batch_run_audit(batch_run_id) ON DELETE CASCADE,
    strategy_version_id TEXT NOT NULL REFERENCES nse_app.backtest_strategy_version(strategy_version_id) ON DELETE CASCADE,
    scenario_key TEXT NOT NULL,
    scenario_label TEXT NOT NULL,
    universe_mode TEXT NOT NULL,
    capital_mode TEXT NOT NULL,
    stock_symbol TEXT,
    as_of_date DATE NOT NULL,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status TEXT NOT NULL DEFAULT 'published',
    rows_processed INTEGER NOT NULL DEFAULT 0,
    warnings_count INTEGER NOT NULL DEFAULT 0,
    errors_count INTEGER NOT NULL DEFAULT 0,
    summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    UNIQUE (batch_run_id, strategy_version_id, scenario_key)
);

CREATE INDEX IF NOT EXISTS idx_backtest_run_lookup
    ON nse_app.backtest_run (strategy_version_id, universe_mode, capital_mode, stock_symbol, as_of_date DESC);

CREATE TABLE IF NOT EXISTS nse_app.backtest_run_validation (
    id BIGSERIAL PRIMARY KEY,
    batch_run_id BIGINT NOT NULL REFERENCES nse_app.batch_run_audit(batch_run_id) ON DELETE CASCADE,
    strategy_version_id TEXT NOT NULL REFERENCES nse_app.backtest_strategy_version(strategy_version_id) ON DELETE CASCADE,
    scenario_key TEXT,
    validation_name TEXT NOT NULL,
    status TEXT NOT NULL,
    details_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_backtest_run_validation_lookup
    ON nse_app.backtest_run_validation (batch_run_id, strategy_version_id, scenario_key, created_at DESC);

CREATE TABLE IF NOT EXISTS nse_app.backtest_symbol_daily (
    batch_run_id BIGINT NOT NULL REFERENCES nse_app.batch_run_audit(batch_run_id) ON DELETE CASCADE,
    strategy_version_id TEXT NOT NULL REFERENCES nse_app.backtest_strategy_version(strategy_version_id) ON DELETE CASCADE,
    trade_date DATE NOT NULL,
    symbol TEXT NOT NULL,
    security_name TEXT,
    sector TEXT,
    open_price NUMERIC,
    high_price NUMERIC,
    low_price NUMERIC,
    close_price NUMERIC,
    prev_close NUMERIC,
    close_vs_prev_close_pct NUMERIC,
    rsi_14 NUMERIC,
    willr_14 NUMERIC,
    regime_label TEXT,
    data_quality_flag TEXT NOT NULL DEFAULT 'ok',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (batch_run_id, strategy_version_id, trade_date, symbol)
);

CREATE INDEX IF NOT EXISTS idx_backtest_symbol_daily_lookup
    ON nse_app.backtest_symbol_daily (strategy_version_id, symbol, trade_date DESC);

CREATE TABLE IF NOT EXISTS nse_app.backtest_daily_equity (
    batch_run_id BIGINT NOT NULL REFERENCES nse_app.batch_run_audit(batch_run_id) ON DELETE CASCADE,
    strategy_version_id TEXT NOT NULL REFERENCES nse_app.backtest_strategy_version(strategy_version_id) ON DELETE CASCADE,
    scenario_key TEXT NOT NULL,
    trade_date DATE NOT NULL,
    active_positions INTEGER NOT NULL DEFAULT 0,
    deployed_capital NUMERIC,
    available_cash NUMERIC,
    market_value NUMERIC,
    total_equity NUMERIC,
    benchmark_value NUMERIC,
    daily_return_pct NUMERIC,
    drawdown_pct NUMERIC,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (batch_run_id, strategy_version_id, scenario_key, trade_date)
);

CREATE INDEX IF NOT EXISTS idx_backtest_daily_equity_lookup
    ON nse_app.backtest_daily_equity (strategy_version_id, scenario_key, trade_date DESC);

CREATE TABLE IF NOT EXISTS nse_app.backtest_trade_log (
    trade_log_id BIGSERIAL PRIMARY KEY,
    batch_run_id BIGINT NOT NULL REFERENCES nse_app.batch_run_audit(batch_run_id) ON DELETE CASCADE,
    strategy_version_id TEXT NOT NULL REFERENCES nse_app.backtest_strategy_version(strategy_version_id) ON DELETE CASCADE,
    scenario_key TEXT NOT NULL,
    symbol TEXT NOT NULL,
    security_name TEXT,
    sector TEXT,
    signal_date DATE NOT NULL,
    entry_date DATE NOT NULL,
    exit_date DATE,
    exit_reason TEXT,
    regime_on_entry TEXT,
    signal_rsi NUMERIC,
    signal_willr NUMERIC,
    close_vs_prev_close_pct NUMERIC,
    entry_price NUMERIC NOT NULL,
    exit_price NUMERIC,
    quantity NUMERIC NOT NULL,
    gross_entry_value NUMERIC NOT NULL,
    gross_exit_value NUMERIC,
    total_charges NUMERIC NOT NULL DEFAULT 0,
    net_pnl NUMERIC,
    profit_tax_rate NUMERIC NOT NULL DEFAULT 0.35,
    profit_tax_amount NUMERIC NOT NULL DEFAULT 0,
    after_tax_net_pnl NUMERIC,
    return_pct NUMERIC,
    holding_days INTEGER,
    trade_status TEXT NOT NULL,
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_backtest_trade_log_lookup
    ON nse_app.backtest_trade_log (strategy_version_id, scenario_key, symbol, entry_date DESC);

ALTER TABLE nse_app.backtest_trade_log ADD COLUMN IF NOT EXISTS profit_tax_rate NUMERIC NOT NULL DEFAULT 0.35;
ALTER TABLE nse_app.backtest_trade_log ADD COLUMN IF NOT EXISTS profit_tax_amount NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE nse_app.backtest_trade_log ADD COLUMN IF NOT EXISTS after_tax_net_pnl NUMERIC;

CREATE TABLE IF NOT EXISTS nse_app.backtest_open_position (
    batch_run_id BIGINT NOT NULL REFERENCES nse_app.batch_run_audit(batch_run_id) ON DELETE CASCADE,
    strategy_version_id TEXT NOT NULL REFERENCES nse_app.backtest_strategy_version(strategy_version_id) ON DELETE CASCADE,
    scenario_key TEXT NOT NULL,
    as_of_date DATE NOT NULL,
    symbol TEXT NOT NULL,
    security_name TEXT,
    sector TEXT,
    signal_date DATE NOT NULL,
    entry_date DATE NOT NULL,
    regime_on_entry TEXT,
    signal_rsi NUMERIC,
    signal_willr NUMERIC,
    close_vs_prev_close_pct NUMERIC,
    entry_price NUMERIC NOT NULL,
    current_price NUMERIC,
    quantity NUMERIC NOT NULL,
    allocated_capital NUMERIC NOT NULL,
    market_value NUMERIC,
    unrealized_pnl NUMERIC,
    unrealized_return_pct NUMERIC,
    target_price NUMERIC,
    days_open INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (batch_run_id, strategy_version_id, scenario_key, symbol, entry_date)
);

CREATE INDEX IF NOT EXISTS idx_backtest_open_position_lookup
    ON nse_app.backtest_open_position (strategy_version_id, scenario_key, as_of_date DESC, symbol);

CREATE TABLE IF NOT EXISTS nse_app.backtest_stock_summary (
    batch_run_id BIGINT NOT NULL REFERENCES nse_app.batch_run_audit(batch_run_id) ON DELETE CASCADE,
    strategy_version_id TEXT NOT NULL REFERENCES nse_app.backtest_strategy_version(strategy_version_id) ON DELETE CASCADE,
    scenario_key TEXT NOT NULL,
    symbol TEXT NOT NULL,
    security_name TEXT,
    sector TEXT,
    signal_count INTEGER NOT NULL DEFAULT 0,
    accepted_trades INTEGER NOT NULL DEFAULT 0,
    skipped_trades INTEGER NOT NULL DEFAULT 0,
    win_rate_pct NUMERIC,
    avg_return_pct NUMERIC,
    median_return_pct NUMERIC,
    max_gain_pct NUMERIC,
    max_loss_pct NUMERIC,
    avg_hold_days NUMERIC,
    max_hold_days INTEGER,
    total_invested NUMERIC,
    current_value NUMERIC,
    realized_pnl NUMERIC,
    unrealized_pnl NUMERIC,
    charges NUMERIC,
    last_signal_date DATE,
    open_position_flag BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (batch_run_id, strategy_version_id, scenario_key, symbol)
);

CREATE INDEX IF NOT EXISTS idx_backtest_stock_summary_lookup
    ON nse_app.backtest_stock_summary (strategy_version_id, scenario_key, symbol);

CREATE TABLE IF NOT EXISTS nse_app.backtest_regime_summary (
    batch_run_id BIGINT NOT NULL REFERENCES nse_app.batch_run_audit(batch_run_id) ON DELETE CASCADE,
    strategy_version_id TEXT NOT NULL REFERENCES nse_app.backtest_strategy_version(strategy_version_id) ON DELETE CASCADE,
    scenario_key TEXT NOT NULL,
    regime_label TEXT NOT NULL,
    trade_count INTEGER NOT NULL DEFAULT 0,
    win_rate_pct NUMERIC,
    avg_return_pct NUMERIC,
    median_return_pct NUMERIC,
    max_drawdown_contribution_pct NUMERIC,
    avg_hold_days NUMERIC,
    total_charges NUMERIC,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (batch_run_id, strategy_version_id, scenario_key, regime_label)
);

CREATE INDEX IF NOT EXISTS idx_backtest_regime_summary_lookup
    ON nse_app.backtest_regime_summary (strategy_version_id, scenario_key, regime_label);

CREATE TABLE IF NOT EXISTS nse_app.backtest_skipped_signal (
    skipped_signal_id BIGSERIAL PRIMARY KEY,
    batch_run_id BIGINT NOT NULL REFERENCES nse_app.batch_run_audit(batch_run_id) ON DELETE CASCADE,
    strategy_version_id TEXT NOT NULL REFERENCES nse_app.backtest_strategy_version(strategy_version_id) ON DELETE CASCADE,
    scenario_key TEXT NOT NULL,
    signal_date DATE NOT NULL,
    entry_date DATE,
    symbol TEXT NOT NULL,
    reason TEXT NOT NULL,
    regime_label TEXT,
    signal_rsi NUMERIC,
    signal_willr NUMERIC,
    close_vs_prev_close_pct NUMERIC,
    details_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_backtest_skipped_signal_lookup
    ON nse_app.backtest_skipped_signal (strategy_version_id, scenario_key, signal_date DESC, symbol);

ALTER TABLE nse_app.backtest_run
    ADD COLUMN IF NOT EXISTS summary_json JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE nse_app.backtest_run
    ADD COLUMN IF NOT EXISTS scenario_key TEXT;

ALTER TABLE nse_app.backtest_run
    ADD COLUMN IF NOT EXISTS scenario_label TEXT;

ALTER TABLE nse_app.backtest_run
    ADD COLUMN IF NOT EXISTS stock_symbol TEXT;

ALTER TABLE nse_app.backtest_run
    ADD COLUMN IF NOT EXISTS strategy_version_hash TEXT;

ALTER TABLE nse_app.backtest_run
    ADD COLUMN IF NOT EXISTS feature_data_asof DATE;

ALTER TABLE nse_app.backtest_run
    ADD COLUMN IF NOT EXISTS universe_hash TEXT;

ALTER TABLE nse_app.backtest_run
    ADD COLUMN IF NOT EXISTS run_scope_hash TEXT;

CREATE TABLE IF NOT EXISTS nse_app.backtest_feature_daily (
    batch_run_id BIGINT NOT NULL REFERENCES nse_app.batch_run_audit(batch_run_id) ON DELETE CASCADE,
    trade_date DATE NOT NULL,
    symbol TEXT NOT NULL,
    security_name TEXT,
    sector TEXT,
    instrument_scope TEXT NOT NULL DEFAULT 'stock_only',
    tradable_flag BOOLEAN NOT NULL DEFAULT TRUE,
    open_price NUMERIC,
    high_price NUMERIC,
    low_price NUMERIC,
    close_price NUMERIC,
    prev_close NUMERIC,
    close_vs_prev_close_pct NUMERIC,
    rsi_14 NUMERIC,
    willr_14 NUMERIC,
    sma20 NUMERIC,
    sma50 NUMERIC,
    macd_line NUMERIC,
    macd_signal NUMERIC,
    macd_hist NUMERIC,
    regime_label TEXT,
    data_quality_flag TEXT NOT NULL DEFAULT 'ok',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (batch_run_id, trade_date, symbol)
);

CREATE INDEX IF NOT EXISTS idx_backtest_feature_daily_lookup
    ON nse_app.backtest_feature_daily (symbol, trade_date DESC);

CREATE TABLE IF NOT EXISTS nse_app.backtest_signal_candidate (
    signal_candidate_id BIGSERIAL PRIMARY KEY,
    batch_run_id BIGINT NOT NULL REFERENCES nse_app.batch_run_audit(batch_run_id) ON DELETE CASCADE,
    strategy_version_id TEXT NOT NULL REFERENCES nse_app.backtest_strategy_version(strategy_version_id) ON DELETE CASCADE,
    symbol TEXT NOT NULL,
    signal_date DATE NOT NULL,
    entry_date DATE,
    entry_eligible_flag BOOLEAN NOT NULL DEFAULT TRUE,
    regime_on_signal TEXT,
    signal_rank_inputs_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    entry_reason_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    feature_snapshot_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (batch_run_id, strategy_version_id, symbol, signal_date)
);

CREATE INDEX IF NOT EXISTS idx_backtest_signal_candidate_lookup
    ON nse_app.backtest_signal_candidate (strategy_version_id, signal_date DESC, symbol);

CREATE TABLE IF NOT EXISTS nse_app.backtest_trade_template (
    trade_template_id TEXT PRIMARY KEY,
    batch_run_id BIGINT NOT NULL REFERENCES nse_app.batch_run_audit(batch_run_id) ON DELETE CASCADE,
    strategy_version_id TEXT NOT NULL REFERENCES nse_app.backtest_strategy_version(strategy_version_id) ON DELETE CASCADE,
    symbol TEXT NOT NULL,
    signal_date DATE NOT NULL,
    entry_date DATE NOT NULL,
    entry_price NUMERIC,
    target_price NUMERIC,
    stop_price NUMERIC,
    theoretical_exit_date DATE,
    theoretical_exit_price NUMERIC,
    exit_reason TEXT,
    exit_timing TEXT,
    hold_days INTEGER,
    gross_return_pct NUMERIC,
    regime_on_entry TEXT,
    open_trade_flag_at_asof BOOLEAN NOT NULL DEFAULT FALSE,
    mark_to_market_price NUMERIC,
    mark_to_market_return_pct NUMERIC,
    rank_inputs_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    details_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_backtest_trade_template_lookup
    ON nse_app.backtest_trade_template (strategy_version_id, entry_date DESC, symbol);

CREATE TABLE IF NOT EXISTS nse_app.backtest_benchmark_fd (
    batch_run_id BIGINT NOT NULL REFERENCES nse_app.batch_run_audit(batch_run_id) ON DELETE CASCADE,
    capital_mode TEXT NOT NULL,
    trade_date DATE NOT NULL,
    start_value NUMERIC NOT NULL,
    benchmark_value NUMERIC NOT NULL,
    annual_rate_pct NUMERIC NOT NULL,
    benchmark_mode TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (batch_run_id, capital_mode, trade_date)
);

CREATE INDEX IF NOT EXISTS idx_backtest_benchmark_fd_lookup
    ON nse_app.backtest_benchmark_fd (capital_mode, trade_date DESC);

CREATE TABLE IF NOT EXISTS nse_app.backtest_strategy_summary_mart (
    batch_run_id BIGINT NOT NULL REFERENCES nse_app.batch_run_audit(batch_run_id) ON DELETE CASCADE,
    strategy_version_id TEXT NOT NULL REFERENCES nse_app.backtest_strategy_version(strategy_version_id) ON DELETE CASCADE,
    scenario_key TEXT NOT NULL,
    strategy_id TEXT NOT NULL,
    display_name TEXT NOT NULL,
    archetype TEXT NOT NULL,
    universe_mode TEXT NOT NULL,
    capital_mode TEXT NOT NULL,
    stock_symbol TEXT,
    as_of_date DATE NOT NULL,
    summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (batch_run_id, strategy_version_id, scenario_key)
);

CREATE INDEX IF NOT EXISTS idx_backtest_strategy_summary_mart_lookup
    ON nse_app.backtest_strategy_summary_mart (strategy_id, capital_mode, universe_mode, as_of_date DESC);

CREATE TABLE IF NOT EXISTS nse_app.backtest_stock_summary_mart (
    batch_run_id BIGINT NOT NULL REFERENCES nse_app.batch_run_audit(batch_run_id) ON DELETE CASCADE,
    strategy_version_id TEXT NOT NULL REFERENCES nse_app.backtest_strategy_version(strategy_version_id) ON DELETE CASCADE,
    scenario_key TEXT NOT NULL,
    symbol TEXT NOT NULL,
    summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (batch_run_id, strategy_version_id, scenario_key, symbol)
);

CREATE INDEX IF NOT EXISTS idx_backtest_stock_summary_mart_lookup
    ON nse_app.backtest_stock_summary_mart (strategy_version_id, scenario_key, symbol);

CREATE TABLE IF NOT EXISTS nse_app.backtest_regime_summary_mart (
    batch_run_id BIGINT NOT NULL REFERENCES nse_app.batch_run_audit(batch_run_id) ON DELETE CASCADE,
    strategy_version_id TEXT NOT NULL REFERENCES nse_app.backtest_strategy_version(strategy_version_id) ON DELETE CASCADE,
    scenario_key TEXT NOT NULL,
    regime_label TEXT NOT NULL,
    summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (batch_run_id, strategy_version_id, scenario_key, regime_label)
);

CREATE INDEX IF NOT EXISTS idx_backtest_regime_summary_mart_lookup
    ON nse_app.backtest_regime_summary_mart (strategy_version_id, scenario_key, regime_label);

CREATE TABLE IF NOT EXISTS nse_app.backtest_compare_summary_mart (
    batch_run_id BIGINT NOT NULL REFERENCES nse_app.batch_run_audit(batch_run_id) ON DELETE CASCADE,
    strategy_version_id TEXT NOT NULL REFERENCES nse_app.backtest_strategy_version(strategy_version_id) ON DELETE CASCADE,
    scenario_key TEXT NOT NULL,
    strategy_id TEXT NOT NULL,
    display_name TEXT NOT NULL,
    archetype TEXT NOT NULL,
    universe_mode TEXT NOT NULL,
    capital_mode TEXT NOT NULL,
    as_of_date DATE NOT NULL,
    compare_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (batch_run_id, strategy_version_id, scenario_key)
);

CREATE INDEX IF NOT EXISTS idx_backtest_compare_summary_mart_lookup
    ON nse_app.backtest_compare_summary_mart (capital_mode, universe_mode, as_of_date DESC);

CREATE TABLE IF NOT EXISTS nse_app.backtest_daily_summary_mart (
    batch_run_id BIGINT NOT NULL REFERENCES nse_app.batch_run_audit(batch_run_id) ON DELETE CASCADE,
    strategy_version_id TEXT NOT NULL REFERENCES nse_app.backtest_strategy_version(strategy_version_id) ON DELETE CASCADE,
    scenario_key TEXT NOT NULL,
    as_of_date DATE NOT NULL,
    payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (batch_run_id, strategy_version_id, scenario_key, as_of_date)
);

CREATE INDEX IF NOT EXISTS idx_backtest_daily_summary_mart_lookup
    ON nse_app.backtest_daily_summary_mart (strategy_version_id, scenario_key, as_of_date DESC);
