CREATE SCHEMA IF NOT EXISTS institutional_flow;
SET search_path TO institutional_flow, public;

CREATE TABLE IF NOT EXISTS ingestion_registry (
    dataset_name VARCHAR NOT NULL,
    market_date DATE,
    source_system VARCHAR NOT NULL,
    source_url VARCHAR,
    local_raw_path VARCHAR,
    checksum_sha256 VARCHAR,
    content_length BIGINT,
    http_status INTEGER,
    discovered_at TIMESTAMP,
    downloaded_at TIMESTAMP,
    normalized_at TIMESTAMP,
    row_count_raw BIGINT,
    row_count_normalized BIGINT,
    status VARCHAR NOT NULL,
    error_class VARCHAR,
    error_message VARCHAR,
    retry_count INTEGER DEFAULT 0,
    run_id VARCHAR NOT NULL
);

CREATE TABLE IF NOT EXISTS dataset_completeness (
    dataset_name VARCHAR NOT NULL,
    expected_date DATE NOT NULL,
    is_expected_trading_day BOOLEAN NOT NULL,
    is_present BOOLEAN NOT NULL,
    reason_missing VARCHAR,
    last_checked_at TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS source_capabilities (
    dataset_name VARCHAR NOT NULL,
    source_system VARCHAR NOT NULL,
    public_endpoint_verified BOOLEAN NOT NULL,
    requires_browser_fallback BOOLEAN NOT NULL,
    is_paid_only BOOLEAN NOT NULL,
    notes VARCHAR,
    last_verified_at TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS raw_file_versions (
    dataset_name VARCHAR NOT NULL,
    market_date DATE,
    file_name VARCHAR NOT NULL,
    checksum_sha256 VARCHAR NOT NULL,
    local_raw_path VARCHAR NOT NULL,
    created_at TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS normalized_nse_fii_dii (
    market_date DATE,
    participant_type VARCHAR,
    buy_value DOUBLE PRECISION,
    sell_value DOUBLE PRECISION,
    net_value DOUBLE PRECISION,
    exchange_scope VARCHAR,
    source_dataset VARCHAR
);

CREATE TABLE IF NOT EXISTS normalized_nse_cm_bhavcopy (
    market_date DATE,
    symbol VARCHAR,
    series VARCHAR,
    open DOUBLE PRECISION,
    high DOUBLE PRECISION,
    low DOUBLE PRECISION,
    close DOUBLE PRECISION,
    last DOUBLE PRECISION,
    prev_close DOUBLE PRECISION,
    volume BIGINT,
    delivery_qty BIGINT,
    delivery_pct DOUBLE PRECISION,
    turnover DOUBLE PRECISION,
    trades BIGINT,
    isin VARCHAR,
    source_dataset VARCHAR
);

CREATE TABLE IF NOT EXISTS normalized_nse_bulk_block (
    market_date DATE,
    deal_date DATE,
    symbol VARCHAR,
    buyer_name VARCHAR,
    seller_name VARCHAR,
    quantity BIGINT,
    price DOUBLE PRECISION,
    value DOUBLE PRECISION,
    deal_kind VARCHAR,
    source_dataset VARCHAR
);

CREATE TABLE IF NOT EXISTS normalized_nse_derivatives_participants (
    market_date DATE,
    client_type VARCHAR,
    instrument_type VARCHAR,
    buy_contracts DOUBLE PRECISION,
    sell_contracts DOUBLE PRECISION,
    open_interest_long DOUBLE PRECISION,
    open_interest_short DOUBLE PRECISION,
    call_long DOUBLE PRECISION,
    call_short DOUBLE PRECISION,
    put_long DOUBLE PRECISION,
    put_short DOUBLE PRECISION,
    source_dataset VARCHAR
);

CREATE TABLE IF NOT EXISTS normalized_nse_shareholding (
    filing_date DATE,
    as_on_date DATE,
    symbol VARCHAR,
    company_name VARCHAR,
    category VARCHAR,
    subcategory VARCHAR,
    shares DOUBLE PRECISION,
    percent_hold DOUBLE PRECISION,
    source_dataset VARCHAR
);

CREATE TABLE IF NOT EXISTS normalized_reference_isin_sector_map (
    as_on_date DATE,
    isin VARCHAR,
    sector_name VARCHAR,
    industry_name VARCHAR,
    source_dataset VARCHAR
);

CREATE TABLE IF NOT EXISTS normalized_nsdl_daily_trends (
    market_date DATE,
    equity_net DOUBLE PRECISION,
    debt_net DOUBLE PRECISION,
    hybrid_net DOUBLE PRECISION,
    total_net DOUBLE PRECISION,
    source_kind VARCHAR,
    source_dataset VARCHAR
);

CREATE TABLE IF NOT EXISTS normalized_nsdl_monthly_history (
    period_start DATE,
    equity_gross_purchase DOUBLE PRECISION,
    equity_gross_sales DOUBLE PRECISION,
    equity_net DOUBLE PRECISION,
    debt_gross_purchase DOUBLE PRECISION,
    debt_gross_sales DOUBLE PRECISION,
    debt_net DOUBLE PRECISION,
    hybrid_gross_purchase DOUBLE PRECISION,
    hybrid_gross_sales DOUBLE PRECISION,
    hybrid_net DOUBLE PRECISION,
    total_net DOUBLE PRECISION,
    source_dataset VARCHAR
);

CREATE TABLE IF NOT EXISTS normalized_nsdl_yearly_history (
    period_start DATE,
    equity_gross_purchase DOUBLE PRECISION,
    equity_gross_sales DOUBLE PRECISION,
    equity_net DOUBLE PRECISION,
    debt_gross_purchase DOUBLE PRECISION,
    debt_gross_sales DOUBLE PRECISION,
    debt_net DOUBLE PRECISION,
    hybrid_gross_purchase DOUBLE PRECISION,
    hybrid_gross_sales DOUBLE PRECISION,
    hybrid_net DOUBLE PRECISION,
    total_net DOUBLE PRECISION,
    source_dataset VARCHAR
);

CREATE TABLE IF NOT EXISTS normalized_nsdl_fortnightly_sector (
    market_date DATE,
    date_code VARCHAR,
    sector VARCHAR,
    equity_auc_inr DOUBLE PRECISION,
    debt_auc_inr DOUBLE PRECISION,
    hybrid_auc_inr DOUBLE PRECISION,
    total_auc_inr DOUBLE PRECISION,
    equity_net_inr DOUBLE PRECISION,
    debt_net_inr DOUBLE PRECISION,
    hybrid_net_inr DOUBLE PRECISION,
    total_net_inr DOUBLE PRECISION,
    source_dataset VARCHAR
);

CREATE TABLE IF NOT EXISTS normalized_nsdl_tradewise_monthly (
    period_start DATE,
    sector VARCHAR,
    buy_cr DOUBLE PRECISION,
    sell_cr DOUBLE PRECISION,
    net_cr DOUBLE PRECISION,
    tx_count BIGINT,
    unmapped_isin_count BIGINT,
    source_dataset VARCHAR
);

CREATE TABLE IF NOT EXISTS normalized_bse_index_history (
    market_date DATE,
    index_name VARCHAR,
    open DOUBLE PRECISION,
    high DOUBLE PRECISION,
    low DOUBLE PRECISION,
    close DOUBLE PRECISION,
    volume DOUBLE PRECISION,
    turnover DOUBLE PRECISION,
    source_dataset VARCHAR
);
