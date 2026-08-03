CREATE SCHEMA IF NOT EXISTS market_data;
CREATE SCHEMA IF NOT EXISTS audit;

CREATE TABLE IF NOT EXISTS market_data.nse_fii_participant_open_interest (
    run_id TEXT NOT NULL,
    run_kind TEXT NOT NULL,
    loaded_at TIMESTAMPTZ NOT NULL,
    trade_date DATE NOT NULL,
    client_type TEXT NOT NULL,
    future_index_long BIGINT,
    future_index_short BIGINT,
    future_stock_long BIGINT,
    future_stock_short BIGINT,
    option_index_call_long BIGINT,
    option_index_put_long BIGINT,
    option_index_call_short BIGINT,
    option_index_put_short BIGINT,
    option_stock_call_long BIGINT,
    option_stock_put_long BIGINT,
    option_stock_call_short BIGINT,
    option_stock_put_short BIGINT,
    total_long_contracts BIGINT,
    total_short_contracts BIGINT,
    source_file TEXT,
    parsed_file TEXT
);

CREATE TABLE IF NOT EXISTS market_data.nse_fii_participant_volume (
    run_id TEXT NOT NULL,
    run_kind TEXT NOT NULL,
    loaded_at TIMESTAMPTZ NOT NULL,
    trade_date DATE NOT NULL,
    client_type TEXT NOT NULL,
    future_index_long BIGINT,
    future_index_short BIGINT,
    future_stock_long BIGINT,
    future_stock_short BIGINT,
    option_index_call_long BIGINT,
    option_index_put_long BIGINT,
    option_index_call_short BIGINT,
    option_index_put_short BIGINT,
    option_stock_call_long BIGINT,
    option_stock_put_long BIGINT,
    option_stock_call_short BIGINT,
    option_stock_put_short BIGINT,
    total_long_contracts BIGINT,
    total_short_contracts BIGINT,
    source_file TEXT,
    parsed_file TEXT
);

CREATE TABLE IF NOT EXISTS market_data.nse_fii_derivatives_stats (
    run_id TEXT NOT NULL,
    run_kind TEXT NOT NULL,
    loaded_at TIMESTAMPTZ NOT NULL,
    trade_date DATE NOT NULL,
    fii_derivatives TEXT NOT NULL,
    buy_contracts NUMERIC,
    buy_value_in_cr NUMERIC,
    sell_contracts NUMERIC,
    sell_value_in_cr NUMERIC,
    open_contracts NUMERIC,
    open_contracts_value_in_cr NUMERIC,
    source_file TEXT,
    parsed_file TEXT
);

CREATE INDEX IF NOT EXISTS idx_nse_fii_participant_oi_trade_date
    ON market_data.nse_fii_participant_open_interest (trade_date, client_type);

CREATE INDEX IF NOT EXISTS idx_nse_fii_participant_volume_trade_date
    ON market_data.nse_fii_participant_volume (trade_date, client_type);

CREATE INDEX IF NOT EXISTS idx_nse_fii_derivatives_stats_trade_date
    ON market_data.nse_fii_derivatives_stats (trade_date, fii_derivatives);
