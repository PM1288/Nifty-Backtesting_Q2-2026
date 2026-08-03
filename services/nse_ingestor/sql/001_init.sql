CREATE SCHEMA IF NOT EXISTS nse;

CREATE TABLE IF NOT EXISTS nse.ingest_runs (
    run_id BIGSERIAL PRIMARY KEY,
    run_mode TEXT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'running',
    backfill_start DATE,
    backfill_end DATE,
    notes TEXT,
    metrics JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS nse.ingest_run_reports (
    run_report_id BIGSERIAL PRIMARY KEY,
    run_id BIGINT NOT NULL REFERENCES nse.ingest_runs(run_id) ON DELETE CASCADE,
    report_name TEXT NOT NULL,
    source_date DATE,
    file_name TEXT NOT NULL,
    file_sha256 TEXT,
    bytes_downloaded BIGINT,
    rows_loaded INTEGER,
    status TEXT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    message TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS nse.file_registry (
    report_name TEXT NOT NULL,
    source_date DATE NOT NULL,
    file_name TEXT NOT NULL,
    file_sha256 TEXT,
    bytes BIGINT,
    load_status TEXT NOT NULL,
    loaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    rows_loaded INTEGER,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    PRIMARY KEY (report_name, source_date, file_name)
);

CREATE TABLE IF NOT EXISTS nse.dim_security_master_snapshot (
    snapshot_date DATE NOT NULL,
    fininstrm_id BIGINT NOT NULL,
    symbol TEXT NOT NULL,
    series TEXT,
    security_name TEXT,
    isin TEXT,
    lot_size BIGINT,
    tick_size NUMERIC,
    price_range TEXT,
    listing_date DATE,
    removal_date DATE,
    instrument_type TEXT,
    instrm_name TEXT,
    market_segment TEXT,
    trad_to_trad_ind TEXT,
    settlement_type TEXT,
    trading_period TEXT,
    face_value NUMERIC,
    security_status TEXT,
    normal_market_eligibility TEXT,
    raw JSONB NOT NULL DEFAULT '{}'::jsonb,
    loaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (snapshot_date, fininstrm_id)
);

CREATE INDEX IF NOT EXISTS idx_dim_security_snapshot_symbol
    ON nse.dim_security_master_snapshot (symbol, series, snapshot_date DESC);

CREATE TABLE IF NOT EXISTS nse.fact_eod_prices (
    trade_date DATE NOT NULL,
    symbol TEXT NOT NULL,
    series TEXT NOT NULL,
    prev_close NUMERIC,
    open_price NUMERIC,
    high_price NUMERIC,
    low_price NUMERIC,
    last_price NUMERIC,
    close_price NUMERIC,
    avg_price NUMERIC,
    total_traded_qty BIGINT,
    turnover_lacs NUMERIC,
    no_of_trades BIGINT,
    deliverable_qty BIGINT,
    deliverable_pct NUMERIC,
    fininstrm_id BIGINT,
    isin TEXT,
    source_file TEXT,
    loaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (trade_date, symbol, series)
);

CREATE INDEX IF NOT EXISTS idx_fact_eod_prices_symbol_date
    ON nse.fact_eod_prices (symbol, trade_date DESC);

CREATE TABLE IF NOT EXISTS nse.fact_bhavcopy_udiff (
    trade_date DATE NOT NULL,
    biz_date DATE,
    segment TEXT,
    source TEXT,
    fininstrm_type TEXT,
    fininstrm_id BIGINT NOT NULL,
    isin TEXT,
    symbol TEXT,
    series TEXT,
    security_name TEXT,
    open_price NUMERIC,
    high_price NUMERIC,
    low_price NUMERIC,
    close_price NUMERIC,
    last_price NUMERIC,
    prev_close NUMERIC,
    total_trading_volume BIGINT,
    total_traded_value NUMERIC,
    total_trades BIGINT,
    session_id TEXT,
    lot_size BIGINT,
    source_file TEXT,
    loaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (trade_date, fininstrm_id)
);

CREATE INDEX IF NOT EXISTS idx_fact_bhavcopy_udiff_symbol_date
    ON nse.fact_bhavcopy_udiff (symbol, trade_date DESC);

CREATE TABLE IF NOT EXISTS nse.fact_daily_volatility (
    trade_date DATE NOT NULL,
    symbol TEXT NOT NULL,
    underlying_close_price NUMERIC,
    prev_close_price NUMERIC,
    log_return NUMERIC,
    prev_day_volatility NUMERIC,
    current_day_daily_volatility NUMERIC,
    annualised_volatility NUMERIC,
    source_file TEXT,
    loaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (trade_date, symbol)
);

CREATE TABLE IF NOT EXISTS nse.fact_market_activity_kv (
    trade_date DATE NOT NULL,
    metric_name TEXT NOT NULL,
    metric_value_numeric NUMERIC,
    metric_value_text TEXT,
    source_file TEXT,
    loaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (trade_date, metric_name)
);

CREATE TABLE IF NOT EXISTS nse.fact_market_activity_index (
    trade_date DATE NOT NULL,
    index_name TEXT NOT NULL,
    prev_close NUMERIC,
    open_price NUMERIC,
    high_price NUMERIC,
    low_price NUMERIC,
    close_price NUMERIC,
    gain_loss NUMERIC,
    source_file TEXT,
    loaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (trade_date, index_name)
);

CREATE TABLE IF NOT EXISTS nse.fact_52_week_high_low (
    report_date DATE NOT NULL,
    symbol TEXT NOT NULL,
    series TEXT NOT NULL,
    adjusted_52_week_high NUMERIC,
    high_date DATE,
    adjusted_52_week_low NUMERIC,
    low_date DATE,
    source_file TEXT,
    loaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (report_date, symbol, series)
);

CREATE TABLE IF NOT EXISTS nse.fact_bulk_deals (
    trade_date DATE NOT NULL,
    symbol TEXT NOT NULL,
    security_name TEXT,
    client_name TEXT NOT NULL,
    side TEXT NOT NULL,
    quantity_traded BIGINT,
    trade_price NUMERIC,
    remarks TEXT,
    source_file TEXT,
    loaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (trade_date, symbol, client_name, side, quantity_traded, trade_price)
);

CREATE TABLE IF NOT EXISTS nse.fact_block_deals (
    trade_date DATE NOT NULL,
    symbol TEXT NOT NULL,
    security_name TEXT,
    client_name TEXT NOT NULL,
    side TEXT NOT NULL,
    quantity_traded BIGINT,
    trade_price NUMERIC,
    source_file TEXT,
    loaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (trade_date, symbol, client_name, side, quantity_traded, trade_price)
);

CREATE TABLE IF NOT EXISTS nse.fact_short_selling (
    trade_date DATE NOT NULL,
    report_date DATE,
    symbol TEXT NOT NULL,
    security_name TEXT,
    quantity BIGINT,
    source_file TEXT,
    loaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (trade_date, symbol, quantity, source_file)
);

CREATE INDEX IF NOT EXISTS idx_fact_short_selling_symbol_date
    ON nse.fact_short_selling (symbol, trade_date DESC);

CREATE TABLE IF NOT EXISTS nse.fact_surveillance_indicators (
    report_date DATE NOT NULL,
    symbol TEXT NOT NULL,
    series TEXT,
    status TEXT,
    nse_exclusive TEXT,
    scrip_code TEXT,
    source_version TEXT NOT NULL,
    non_default_flag_count INTEGER,
    flags JSONB NOT NULL DEFAULT '{}'::jsonb,
    source_file TEXT,
    loaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (report_date, symbol, series, source_version)
);

CREATE TABLE IF NOT EXISTS nse.fact_corporate_actions (
    ex_date DATE NOT NULL,
    report_date DATE NOT NULL,
    symbol TEXT NOT NULL,
    series TEXT,
    security_name TEXT,
    record_date DATE,
    bc_start_date DATE,
    bc_end_date DATE,
    nd_start_date DATE,
    nd_end_date DATE,
    purpose TEXT,
    source_file TEXT,
    loaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (ex_date, symbol, series, purpose)
);

CREATE TABLE IF NOT EXISTS nse.fact_text_events (
    report_date DATE NOT NULL,
    event_type TEXT NOT NULL,
    symbol TEXT,
    headline TEXT,
    raw_text TEXT NOT NULL,
    source_file TEXT,
    loaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (report_date, event_type, raw_text)
);

CREATE TABLE IF NOT EXISTS nse.fact_margin_trading_summary (
    report_date DATE NOT NULL,
    metric_name TEXT NOT NULL,
    metric_value NUMERIC,
    source_file TEXT,
    loaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (report_date, metric_name)
);

CREATE TABLE IF NOT EXISTS nse.fact_margin_trading_scrip (
    report_date DATE NOT NULL,
    symbol TEXT NOT NULL,
    security_name TEXT,
    qty_financed BIGINT,
    amt_financed_lakhs NUMERIC,
    source_file TEXT,
    loaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (report_date, symbol)
);

CREATE TABLE IF NOT EXISTS nse.fact_var_margin (
    report_date DATE NOT NULL,
    source_seq INTEGER NOT NULL,
    symbol TEXT NOT NULL,
    series TEXT,
    isin TEXT,
    security_var_rate NUMERIC,
    index_var_rate NUMERIC,
    var_margin_rate NUMERIC,
    extreme_loss_rate NUMERIC,
    adhoc_margin_rate NUMERIC,
    applicable_margin_rate NUMERIC,
    source_file TEXT,
    loaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (report_date, source_seq, symbol, series, isin)
);
