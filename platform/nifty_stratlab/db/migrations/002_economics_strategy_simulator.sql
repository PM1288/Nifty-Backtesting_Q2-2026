BEGIN;

CREATE TABLE IF NOT EXISTS catalog.fee_schedule (
    schedule_id text PRIMARY KEY,
    exchange text NOT NULL,
    product text NOT NULL,
    effective_from date NOT NULL,
    effective_to date,
    brokerage_rate numeric NOT NULL DEFAULT 0,
    brokerage_cap_per_order numeric NOT NULL DEFAULT 0,
    stt_buy_rate numeric NOT NULL DEFAULT 0,
    stt_sell_rate numeric NOT NULL DEFAULT 0,
    exchange_transaction_rate numeric NOT NULL DEFAULT 0,
    sebi_rate numeric NOT NULL DEFAULT 0,
    ipft_rate numeric NOT NULL DEFAULT 0,
    stamp_buy_rate numeric NOT NULL DEFAULT 0,
    gst_rate numeric NOT NULL DEFAULT 0,
    dp_sell_flat numeric NOT NULL DEFAULT 0,
    rounding_policy jsonb NOT NULL DEFAULT '{}'::jsonb,
    source_ref text,
    status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','validated','retired')),
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (effective_to IS NULL OR effective_to >= effective_from),
    CHECK (brokerage_rate >= 0 AND brokerage_cap_per_order >= 0),
    CHECK (stt_buy_rate >= 0 AND stt_sell_rate >= 0),
    CHECK (exchange_transaction_rate >= 0 AND sebi_rate >= 0 AND ipft_rate >= 0),
    CHECK (stamp_buy_rate >= 0 AND gst_rate >= 0 AND dp_sell_flat >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS fee_schedule_effective_unique
    ON catalog.fee_schedule (exchange, product, effective_from);

CREATE TABLE IF NOT EXISTS catalog.feature_definition (
    feature_id text NOT NULL,
    feature_version text NOT NULL,
    display_name text NOT NULL,
    description text NOT NULL,
    lookback_bars integer NOT NULL CHECK (lookback_bars >= 0),
    required_inputs jsonb NOT NULL DEFAULT '[]'::jsonb,
    availability_policy text NOT NULL,
    implementation_ref text NOT NULL,
    source_hash text NOT NULL,
    parity_status text NOT NULL DEFAULT 'pending' CHECK (parity_status IN ('pending','passed','failed','waived')),
    status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','retired')),
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (feature_id, feature_version)
);

CREATE TABLE IF NOT EXISTS catalog.strategy (
    strategy_id text PRIMARY KEY,
    display_name text NOT NULL,
    archetype text NOT NULL,
    owner text NOT NULL,
    description text,
    status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','research','paper','shadow','approved','suspended','retired')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS catalog.strategy_version (
    strategy_version_id text PRIMARY KEY,
    strategy_id text NOT NULL REFERENCES catalog.strategy(strategy_id),
    version_number integer NOT NULL CHECK (version_number > 0),
    plugin_ref text NOT NULL,
    source_hash text NOT NULL,
    manifest_json jsonb NOT NULL,
    required_feature_versions jsonb NOT NULL,
    fee_profile_id text REFERENCES catalog.fee_schedule(schedule_id),
    immutable_hash text NOT NULL UNIQUE,
    status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','retired')),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (strategy_id, version_number)
);

CREATE TABLE IF NOT EXISTS catalog.execution_model (
    execution_model_id text PRIMARY KEY,
    display_name text NOT NULL,
    version text NOT NULL,
    configuration jsonb NOT NULL,
    assumptions jsonb NOT NULL,
    source_hash text NOT NULL,
    validation_status text NOT NULL DEFAULT 'pending' CHECK (validation_status IN ('pending','passed','failed')),
    created_at timestamptz NOT NULL DEFAULT now()
);

COMMIT;
