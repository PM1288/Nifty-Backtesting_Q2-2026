BEGIN;

CREATE TABLE IF NOT EXISTS catalog.option_contract_observation (
    observation_id text PRIMARY KEY,
    instrument_id text NOT NULL,
    underlying_symbol text NOT NULL,
    exchange text NOT NULL,
    segment text NOT NULL,
    trading_symbol text NOT NULL,
    expiry date NOT NULL,
    strike numeric NOT NULL,
    option_right text NOT NULL CHECK (option_right IN ('CE','PE')),
    lot_size integer NOT NULL CHECK (lot_size > 0),
    tick_size numeric NOT NULL CHECK (tick_size > 0),
    available_at timestamptz NOT NULL,
    active_from timestamptz,
    active_to timestamptz,
    source_ref text NOT NULL,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS option_contract_point_in_time_idx
    ON catalog.option_contract_observation (underlying_symbol, available_at, expiry, option_right, strike);

CREATE TABLE IF NOT EXISTS research.option_trade_result (
    option_trade_id text PRIMARY KEY,
    run_id text REFERENCES research.experiment_run(run_id) ON DELETE CASCADE,
    strategy_version_id text NOT NULL,
    underlying_symbol text NOT NULL,
    instrument_id text NOT NULL,
    expiry date NOT NULL,
    strike numeric NOT NULL,
    option_right text NOT NULL CHECK (option_right IN ('CE','PE')),
    entry_ts timestamptz NOT NULL,
    exit_ts timestamptz NOT NULL,
    entry_premium numeric NOT NULL,
    exit_premium numeric NOT NULL,
    quantity bigint NOT NULL CHECK (quantity > 0),
    lots integer NOT NULL CHECK (lots > 0),
    target_premium numeric NOT NULL,
    stop_premium numeric NOT NULL,
    exit_reason text NOT NULL,
    gross_pnl numeric NOT NULL,
    total_cost numeric NOT NULL,
    net_pnl numeric NOT NULL,
    ambiguous_path boolean NOT NULL DEFAULT false,
    greeks_at_entry jsonb NOT NULL DEFAULT '{}'::jsonb,
    volatility_context jsonb NOT NULL DEFAULT '{}'::jsonb,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (exit_ts >= entry_ts),
    CHECK (net_pnl = gross_pnl - total_cost)
);

CREATE TABLE IF NOT EXISTS research.feature_parity_result (
    parity_run_id text NOT NULL,
    feature_id text NOT NULL,
    feature_version text NOT NULL,
    symbol text NOT NULL,
    event_ts timestamptz NOT NULL,
    batch_value numeric,
    online_value numeric,
    absolute_difference numeric,
    tolerance numeric NOT NULL,
    status text NOT NULL CHECK (status IN ('PASS','FAIL')),
    details jsonb NOT NULL DEFAULT '{}'::jsonb,
    PRIMARY KEY (parity_run_id, feature_id, feature_version, symbol, event_ts)
);

CREATE TABLE IF NOT EXISTS research.research_pack (
    pack_id text PRIMARY KEY,
    as_of timestamptz NOT NULL,
    purpose text NOT NULL,
    symbols jsonb NOT NULL,
    data_snapshot_id text NOT NULL REFERENCES catalog.data_snapshot(snapshot_id),
    strategy_version_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
    archive_uri text NOT NULL,
    archive_sha256 text NOT NULL,
    manifest jsonb NOT NULL,
    requested_by text,
    status text NOT NULL DEFAULT 'generated' CHECK (status IN ('generated','distributed','responded','expired','invalid')),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS research.analyst_response (
    response_id text PRIMARY KEY,
    pack_id text NOT NULL REFERENCES research.research_pack(pack_id),
    analyst_name text NOT NULL,
    produced_at timestamptz NOT NULL,
    symbol text NOT NULL,
    stance text NOT NULL CHECK (stance IN ('avoid','watch','eligible','insufficient_evidence')),
    expected_direction text NOT NULL CHECK (expected_direction IN ('up','down','uncertain')),
    confidence numeric,
    response_json jsonb NOT NULL,
    order_authority boolean NOT NULL DEFAULT false,
    ingested_at timestamptz NOT NULL DEFAULT now(),
    CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
    CHECK (order_authority = false)
);

COMMIT;
