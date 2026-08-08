-- Additive storage for threshold-free OIIS diagnostic captures.
-- Source market tables are not modified. PostgreSQL identifiers use YYYYMM
-- suffixes because hyphens require quoted identifiers and complicate clients.

CREATE SCHEMA IF NOT EXISTS oiis_research;

CREATE TABLE IF NOT EXISTS oiis_research.all_signal_run (
    run_id uuid PRIMARY KEY,
    created_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz,
    status text NOT NULL,
    requested_start date NOT NULL,
    requested_end date NOT NULL,
    ofactor_min numeric NOT NULL,
    xfactor_min numeric NOT NULL,
    universe_size integer,
    row_count bigint,
    config_json jsonb NOT NULL,
    artifact_manifest_json jsonb
);

CREATE TABLE IF NOT EXISTS oiis_research.all_signal_observation (
    run_id uuid NOT NULL REFERENCES oiis_research.all_signal_run(run_id),
    signal_date date NOT NULL,
    symbol text NOT NULL,
    sector text,
    entry_date date,
    entry_ts timestamptz,
    path_status text NOT NULL,
    selected_direction text,
    decision_code text,
    ofactor_long numeric,
    ofactor_short numeric,
    directional_edge numeric,
    xfactor_score numeric,
    close_price numeric,
    entry_price numeric,
    rsi_14 numeric,
    willr_14 numeric,
    ema_61 numeric,
    close_vs_ema61_pct numeric,
    bb_lower_20_2 numeric,
    bb_mid_20 numeric,
    bb_upper_20_2 numeric,
    bb_position numeric,
    fast_k_14 numeric,
    slow_k_3 numeric,
    volume numeric,
    volume_sma_20 numeric,
    volume_ema_20 numeric,
    volume_ema_60 numeric,
    macd_line_12_26 numeric,
    macd_signal_9 numeric,
    macd_histogram numeric,
    nifty_close numeric,
    nifty_primary_trend text,
    stock_primary_trend text,
    vix_regime text,
    intraday_mfe_pct numeric,
    intraday_mae_pct numeric,
    d5_mfe_pct numeric,
    d5_mae_pct numeric,
    h30_max_high_upside_pct numeric,
    h30_max_close_upside_pct numeric,
    h30_mae_pct numeric,
    nifty_d5_return_pct numeric,
    nifty_h30_return_pct numeric,
    stock_excess_nifty_d5_pct numeric,
    stock_excess_nifty_h30_pct numeric,
    ofactor_long_components jsonb NOT NULL DEFAULT '{}'::jsonb,
    ofactor_short_components jsonb NOT NULL DEFAULT '{}'::jsonb,
    xfactor_components jsonb NOT NULL DEFAULT '{}'::jsonb,
    gate_results jsonb NOT NULL DEFAULT '[]'::jsonb,
    indicator_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    outcome_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    observation_hash text NOT NULL,
    PRIMARY KEY (run_id, signal_date, symbol)
) PARTITION BY RANGE (signal_date);

CREATE INDEX IF NOT EXISTS all_signal_observation_symbol_date_idx
    ON oiis_research.all_signal_observation(symbol, signal_date);
CREATE INDEX IF NOT EXISTS all_signal_observation_scores_idx
    ON oiis_research.all_signal_observation(ofactor_long, xfactor_score);
CREATE INDEX IF NOT EXISTS all_signal_observation_regime_idx
    ON oiis_research.all_signal_observation(nifty_primary_trend, stock_primary_trend, vix_regime);

CREATE OR REPLACE VIEW oiis_research.all_signal_latest AS
SELECT o.*
FROM oiis_research.all_signal_observation o
JOIN (
    SELECT run_id FROM oiis_research.all_signal_run
    WHERE status = 'COMPLETED'
    ORDER BY completed_at DESC NULLS LAST LIMIT 1
) r USING (run_id);
