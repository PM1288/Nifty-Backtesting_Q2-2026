BEGIN;

CREATE TABLE IF NOT EXISTS catalog.csv_minute_import (
    import_id bigserial PRIMARY KEY,
    source_path text NOT NULL,
    symbol text NOT NULL,
    symbol_token text,
    source_sha256 text NOT NULL,
    source_bytes bigint NOT NULL,
    status text NOT NULL CHECK (status IN ('RUNNING','COMPLETED','FAILED','DRY_RUN','SUPERSEDED')),
    requested_start date,
    requested_end date,
    source_rows bigint NOT NULL DEFAULT 0,
    accepted_rows bigint NOT NULL DEFAULT 0,
    rejected_rows bigint NOT NULL DEFAULT 0,
    raw_inserted_rows bigint NOT NULL DEFAULT 0,
    feature_upserted_rows bigint NOT NULL DEFAULT 0,
    minimum_ts timestamptz,
    maximum_ts timestamptz,
    details jsonb NOT NULL DEFAULT '{}'::jsonb,
    started_at timestamptz NOT NULL DEFAULT now(),
    finished_at timestamptz
);

ALTER TABLE catalog.csv_minute_import ADD COLUMN IF NOT EXISTS requested_start date;
ALTER TABLE catalog.csv_minute_import ADD COLUMN IF NOT EXISTS requested_end date;
ALTER TABLE catalog.csv_minute_import DROP CONSTRAINT IF EXISTS csv_minute_import_status_check;
ALTER TABLE catalog.csv_minute_import ADD CONSTRAINT csv_minute_import_status_check
    CHECK (status IN ('RUNNING','COMPLETED','FAILED','DRY_RUN','SUPERSEDED'));
DROP INDEX IF EXISTS catalog.csv_minute_import_completed_file_unique;
CREATE UNIQUE INDEX csv_minute_import_completed_file_unique
    ON catalog.csv_minute_import (
        source_path, source_sha256,
        COALESCE(requested_start, DATE '0001-01-01'),
        COALESCE(requested_end, DATE '9999-12-31')
    )
    WHERE status = 'COMPLETED';

CREATE TABLE IF NOT EXISTS research.security_minute_technical (
    ts timestamptz NOT NULL,
    exchange text NOT NULL DEFAULT 'NSE',
    symbol_token text NOT NULL,
    symbol text NOT NULL,
    session_date date NOT NULL,
    minute_of_session integer NOT NULL,
    rsi_14 numeric,
    willr_14 numeric,
    sma20 numeric,
    sma50 numeric,
    bollinger_lower_20_2 numeric,
    macd_line numeric,
    macd_signal numeric,
    macd_hist numeric,
    prior_completed_daily_rsi numeric,
    prior_daily_rsi_previous numeric,
    prior_daily_close numeric,
    source_sha256 text NOT NULL,
    calculated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (ts, exchange, symbol_token)
);

CREATE INDEX IF NOT EXISTS security_minute_technical_symbol_ts_idx
    ON research.security_minute_technical (symbol, ts DESC);
CREATE INDEX IF NOT EXISTS security_minute_technical_session_idx
    ON research.security_minute_technical (session_date, symbol, minute_of_session);
CREATE INDEX IF NOT EXISTS security_minute_technical_signal_idx
    ON research.security_minute_technical (symbol, session_date, rsi_14, willr_14);

COMMIT;
