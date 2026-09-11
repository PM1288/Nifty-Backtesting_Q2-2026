-- Additive, revision-preserving NSE F&O Daily Volatility (FOVOLT) evidence.
CREATE SCHEMA IF NOT EXISTS market_data;
CREATE SCHEMA IF NOT EXISTS audit;

CREATE TABLE IF NOT EXISTS audit.nse_fovolt_report_revision (
    revision_id TEXT PRIMARY KEY,
    report_date DATE NOT NULL,
    content_sha256 TEXT NOT NULL,
    source_filename TEXT NOT NULL,
    source_url TEXT,
    source_basis TEXT NOT NULL,
    source_published_at TIMESTAMPTZ,
    first_seen_at TIMESTAMPTZ NOT NULL,
    ingested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    parser_version TEXT NOT NULL,
    schema_identifier TEXT NOT NULL,
    raw_archive_reference TEXT,
    row_count INTEGER NOT NULL CHECK (row_count >= 0),
    validation_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
    UNIQUE (report_date, content_sha256)
);

CREATE TABLE IF NOT EXISTS market_data.nse_fovolt_report_row (
    revision_id TEXT NOT NULL REFERENCES audit.nse_fovolt_report_revision(revision_id),
    source_csv_line INTEGER NOT NULL,
    report_date DATE NOT NULL,
    symbol TEXT NOT NULL,
    underlying_close NUMERIC,
    underlying_previous_close NUMERIC,
    underlying_log_return NUMERIC,
    underlying_vol_previous NUMERIC,
    underlying_vol_current NUMERIC,
    underlying_vol_annual NUMERIC,
    futures_close NUMERIC,
    futures_previous_close NUMERIC,
    futures_log_return NUMERIC,
    futures_vol_previous NUMERIC,
    futures_vol_current NUMERIC,
    futures_vol_annual NUMERIC,
    applicable_vol_daily NUMERIC,
    applicable_vol_annual NUMERIC,
    raw_fields JSONB NOT NULL,
    instrument_id TEXT,
    mapping_state TEXT NOT NULL DEFAULT 'REQUIRES_DATE_EFFECTIVE_MASTER',
    PRIMARY KEY (revision_id, source_csv_line),
    UNIQUE (revision_id, report_date, symbol)
);

CREATE TABLE IF NOT EXISTS market_data.nse_fovolt_screen_run (
    run_id TEXT PRIMARY KEY,
    revision_id TEXT NOT NULL REFERENCES audit.nse_fovolt_report_revision(revision_id),
    report_date DATE NOT NULL,
    analysis_session DATE,
    rule_version TEXT NOT NULL,
    threshold_raw NUMERIC NOT NULL,
    timing_mode TEXT NOT NULL,
    intended_decision_cutoff TIMESTAMPTZ,
    cohort_frozen_at TIMESTAMPTZ NOT NULL,
    source_row_count INTEGER NOT NULL,
    computable_count INTEGER NOT NULL,
    matched_count INTEGER NOT NULL,
    status TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS market_data.nse_fovolt_screen_row (
    run_id TEXT NOT NULL REFERENCES market_data.nse_fovolt_screen_run(run_id),
    revision_id TEXT NOT NULL,
    source_csv_line INTEGER NOT NULL,
    symbol TEXT NOT NULL,
    previous_futures_daily_vol NUMERIC,
    current_futures_daily_vol NUMERIC,
    delta_raw NUMERIC,
    delta_basis_points NUMERIC,
    qualifies BOOLEAN,
    rank_in_valid_report INTEGER,
    match_rank INTEGER,
    screen_state TEXT NOT NULL,
    mapping_state TEXT NOT NULL,
    quality_flags TEXT[] NOT NULL DEFAULT '{}',
    PRIMARY KEY (run_id, source_csv_line),
    FOREIGN KEY (revision_id, source_csv_line)
      REFERENCES market_data.nse_fovolt_report_row(revision_id, source_csv_line)
);

CREATE INDEX IF NOT EXISTS idx_nse_fovolt_revision_date
    ON audit.nse_fovolt_report_revision (report_date DESC, first_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_nse_fovolt_row_symbol_date
    ON market_data.nse_fovolt_report_row (symbol, report_date DESC);
CREATE INDEX IF NOT EXISTS idx_nse_fovolt_screen_analysis
    ON market_data.nse_fovolt_screen_run (analysis_session DESC, report_date DESC);
CREATE INDEX IF NOT EXISTS idx_nse_fovolt_match_rank
    ON market_data.nse_fovolt_screen_row (run_id, qualifies, match_rank);

COMMENT ON TABLE market_data.nse_fovolt_report_row IS
  'Physical NSE FOVOLT columns preserved per immutable content revision; separate from option-IV strategy data.';
COMMENT ON COLUMN market_data.nse_fovolt_screen_row.delta_raw IS
  'Exact reported physical column K minus J (CSV columns M minus L by spreadsheet position).';
