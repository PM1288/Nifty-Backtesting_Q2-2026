CREATE SCHEMA IF NOT EXISTS market_data;
CREATE SCHEMA IF NOT EXISTS audit;

CREATE TABLE IF NOT EXISTS market_data.nse_financial_results (
    run_id TEXT NOT NULL,
    fetched_at TIMESTAMPTZ NOT NULL,
    symbol TEXT NOT NULL,
    company_name TEXT,
    scrip_code TEXT,
    financial_statement_period TEXT NOT NULL,
    reporting_quarter TEXT,
    period_start_date DATE,
    period_end_date DATE,
    board_meeting_date DATE,
    audited_status TEXT,
    report_nature TEXT,
    presentation_currency TEXT,
    metric_name TEXT NOT NULL,
    metric_value TEXT,
    metric_value_num NUMERIC,
    source TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS market_data.yf_financial_statements (
    run_id TEXT NOT NULL,
    fetched_at TIMESTAMPTZ NOT NULL,
    symbol TEXT NOT NULL,
    statement_name TEXT NOT NULL,
    period_type TEXT NOT NULL,
    period_end DATE,
    metric_name TEXT NOT NULL,
    metric_value TEXT,
    metric_value_num NUMERIC,
    source TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS market_data.nse_corporate_actions (
    run_id TEXT NOT NULL,
    fetched_at TIMESTAMPTZ NOT NULL,
    symbol TEXT NOT NULL,
    company_name TEXT,
    series TEXT,
    purpose TEXT,
    face_value NUMERIC,
    ex_date DATE,
    record_date DATE,
    book_closure_start_date DATE,
    book_closure_end_date DATE,
    source TEXT NOT NULL,
    raw_json TEXT
);

CREATE TABLE IF NOT EXISTS market_data.nse_event_calendar (
    run_id TEXT NOT NULL,
    fetched_at TIMESTAMPTZ NOT NULL,
    symbol TEXT NOT NULL,
    company_name TEXT,
    purpose TEXT,
    details TEXT,
    event_date DATE,
    attachment TEXT,
    broadcast_datetime TIMESTAMPTZ,
    source TEXT NOT NULL,
    raw_json TEXT
);

CREATE TABLE IF NOT EXISTS audit.load_manifest (
    run_id TEXT NOT NULL,
    dataset_name TEXT NOT NULL,
    table_name TEXT NOT NULL,
    row_count BIGINT NOT NULL,
    status TEXT NOT NULL,
    combined_file TEXT,
    raw_dir TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_nse_financial_results_symbol_period
    ON market_data.nse_financial_results (symbol, period_end_date, metric_name);

CREATE INDEX IF NOT EXISTS idx_yf_financial_statements_symbol_period
    ON market_data.yf_financial_statements (symbol, period_end, metric_name);

CREATE INDEX IF NOT EXISTS idx_nse_corporate_actions_symbol_exdate
    ON market_data.nse_corporate_actions (symbol, ex_date);

CREATE INDEX IF NOT EXISTS idx_nse_event_calendar_symbol_eventdate
    ON market_data.nse_event_calendar (symbol, event_date);
