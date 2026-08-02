BEGIN;

CREATE SCHEMA IF NOT EXISTS catalog;
CREATE SCHEMA IF NOT EXISTS research;
CREATE SCHEMA IF NOT EXISTS simulation;

CREATE TABLE IF NOT EXISTS catalog.session_profile (
    profile_id text PRIMARY KEY,
    exchange text NOT NULL,
    segment text NOT NULL,
    timezone_name text NOT NULL,
    effective_from date NOT NULL,
    effective_to date,
    pre_open_start time,
    regular_open time NOT NULL,
    regular_close time NOT NULL,
    expiry_close time,
    bar_timestamp_semantics text NOT NULL CHECK (bar_timestamp_semantics IN ('bar_start','bar_end')),
    bar_close_inclusive boolean NOT NULL DEFAULT false,
    source_ref text,
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (effective_to IS NULL OR effective_to >= effective_from),
    CHECK (regular_close > regular_open)
);

CREATE INDEX IF NOT EXISTS session_profile_effective_idx
    ON catalog.session_profile (segment, effective_from, effective_to);

CREATE TABLE IF NOT EXISTS catalog.expiry_rule (
    rule_id text PRIMARY KEY,
    underlying_scope text NOT NULL,
    frequency text NOT NULL CHECK (frequency IN ('weekly','monthly')),
    weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
    effective_from date NOT NULL,
    effective_to date,
    holiday_adjustment text NOT NULL CHECK (holiday_adjustment IN ('previous_trading_day','next_trading_day')),
    source_ref text,
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE TABLE IF NOT EXISTS catalog.data_snapshot (
    snapshot_id text PRIMARY KEY,
    created_at timestamptz NOT NULL,
    as_of timestamptz NOT NULL,
    source_hashes jsonb NOT NULL,
    schema_fingerprints jsonb NOT NULL DEFAULT '{}'::jsonb,
    quality_status text NOT NULL CHECK (quality_status IN ('PASS','WARN','FAIL')),
    notes text
);

CREATE TABLE IF NOT EXISTS catalog.source_file (
    source_file_id text PRIMARY KEY,
    snapshot_id text REFERENCES catalog.data_snapshot(snapshot_id),
    dataset_name text NOT NULL,
    relative_path text NOT NULL,
    absolute_path text,
    bytes bigint NOT NULL CHECK (bytes >= 0),
    modified_at_utc timestamptz,
    mime_type text,
    sha256 text NOT NULL,
    parser_version text,
    row_count bigint,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (dataset_name, relative_path, sha256)
);

CREATE INDEX IF NOT EXISTS source_file_dataset_idx
    ON catalog.source_file (dataset_name, relative_path);

CREATE TABLE IF NOT EXISTS catalog.quality_result (
    quality_result_id bigserial PRIMARY KEY,
    snapshot_id text REFERENCES catalog.data_snapshot(snapshot_id),
    source_file_id text REFERENCES catalog.source_file(source_file_id),
    check_name text NOT NULL,
    severity text NOT NULL CHECK (severity IN ('INFO','WARN','ERROR','FATAL')),
    status text NOT NULL CHECK (status IN ('PASS','WARN','FAIL','SKIP')),
    observed_value numeric,
    threshold jsonb NOT NULL DEFAULT '{}'::jsonb,
    details jsonb NOT NULL DEFAULT '{}'::jsonb,
    checked_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS quality_result_snapshot_idx
    ON catalog.quality_result (snapshot_id, status, severity);

CREATE TABLE IF NOT EXISTS catalog.instrument_alias (
    source_system text NOT NULL,
    source_identifier text NOT NULL,
    instrument_id text NOT NULL,
    effective_from timestamptz NOT NULL,
    effective_to timestamptz,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    PRIMARY KEY (source_system, source_identifier, effective_from),
    CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE TABLE IF NOT EXISTS catalog.universe_snapshot (
    universe_snapshot_id text PRIMARY KEY,
    universe_name text NOT NULL,
    as_of date NOT NULL,
    membership_hash text NOT NULL,
    member_count integer NOT NULL CHECK (member_count >= 0),
    source_ref text,
    members jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (universe_name, as_of, membership_hash)
);

COMMIT;
