BEGIN;

CREATE TABLE IF NOT EXISTS research.experiment_run (
    run_id text PRIMARY KEY,
    run_spec jsonb NOT NULL,
    strategy_version_id text NOT NULL REFERENCES catalog.strategy_version(strategy_version_id),
    data_snapshot_id text NOT NULL REFERENCES catalog.data_snapshot(snapshot_id),
    universe_snapshot_id text NOT NULL REFERENCES catalog.universe_snapshot(universe_snapshot_id),
    feature_set_id text NOT NULL,
    feature_version text NOT NULL,
    fee_profile_id text NOT NULL REFERENCES catalog.fee_schedule(schedule_id),
    execution_model_id text NOT NULL REFERENCES catalog.execution_model(execution_model_id),
    scenario_key text NOT NULL,
    date_start date NOT NULL,
    date_end date NOT NULL,
    code_hash text NOT NULL,
    random_seed bigint NOT NULL DEFAULT 0,
    status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','running','validating','validated','published','failed','cancelled')),
    validation_status text NOT NULL DEFAULT 'pending' CHECK (validation_status IN ('pending','passed','failed')),
    published boolean NOT NULL DEFAULT false,
    requested_by text,
    created_at timestamptz NOT NULL DEFAULT now(),
    started_at timestamptz,
    finished_at timestamptz,
    summary jsonb NOT NULL DEFAULT '{}'::jsonb,
    error_message text,
    CHECK (date_end >= date_start),
    CHECK (NOT published OR (status = 'published' AND validation_status = 'passed'))
);

CREATE INDEX IF NOT EXISTS experiment_run_strategy_idx
    ON research.experiment_run (strategy_version_id, scenario_key, created_at DESC);

CREATE TABLE IF NOT EXISTS research.run_shard (
    shard_id text PRIMARY KEY,
    run_id text NOT NULL REFERENCES research.experiment_run(run_id) ON DELETE CASCADE,
    ordinal integer NOT NULL CHECK (ordinal >= 0),
    date_start date NOT NULL,
    date_end date NOT NULL,
    symbols jsonb NOT NULL,
    input_hash text NOT NULL,
    status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','running','completed','failed')),
    attempt_no integer NOT NULL DEFAULT 0 CHECK (attempt_no >= 0),
    lease_owner text,
    lease_expires_at timestamptz,
    heartbeat_at timestamptz,
    cursor_json jsonb NOT NULL DEFAULT '{}'::jsonb,
    output_uri text,
    output_checksum text,
    output_row_count bigint NOT NULL DEFAULT 0 CHECK (output_row_count >= 0),
    started_at timestamptz,
    finished_at timestamptz,
    error_message text,
    UNIQUE (run_id, ordinal),
    CHECK (date_end >= date_start),
    CHECK (status <> 'completed' OR (output_uri IS NOT NULL AND output_checksum IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS run_shard_claim_idx
    ON research.run_shard (run_id, status, lease_expires_at, ordinal);

CREATE TABLE IF NOT EXISTS simulation.signal_intent (
    signal_id text PRIMARY KEY,
    run_id text NOT NULL REFERENCES research.experiment_run(run_id) ON DELETE CASCADE,
    strategy_version_id text NOT NULL,
    symbol text NOT NULL,
    instrument_id text NOT NULL,
    decision_ts timestamptz NOT NULL,
    available_at timestamptz NOT NULL,
    intent_type text NOT NULL,
    side text NOT NULL,
    reason_codes jsonb NOT NULL,
    feature_snapshot_id text,
    confidence_score numeric,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    CHECK (available_at >= decision_ts),
    CHECK (confidence_score IS NULL OR confidence_score BETWEEN 0 AND 1)
);

CREATE INDEX IF NOT EXISTS signal_intent_run_time_idx
    ON simulation.signal_intent (run_id, decision_ts, symbol);

CREATE TABLE IF NOT EXISTS simulation.trade_result (
    trade_id text PRIMARY KEY,
    run_id text NOT NULL REFERENCES research.experiment_run(run_id) ON DELETE CASCADE,
    strategy_version_id text NOT NULL,
    scenario_key text NOT NULL,
    symbol text NOT NULL,
    entry_ts timestamptz NOT NULL,
    exit_ts timestamptz NOT NULL,
    entry_price numeric NOT NULL,
    exit_price numeric NOT NULL,
    quantity bigint NOT NULL CHECK (quantity > 0),
    exit_reason text NOT NULL,
    gross_pnl numeric NOT NULL,
    total_cost numeric NOT NULL,
    net_pnl numeric NOT NULL,
    bars_held integer NOT NULL CHECK (bars_held >= 0),
    ambiguous_path boolean NOT NULL DEFAULT false,
    cost_breakdown jsonb NOT NULL,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (exit_ts >= entry_ts),
    CHECK (net_pnl = gross_pnl - total_cost)
);

CREATE INDEX IF NOT EXISTS trade_result_run_symbol_idx
    ON simulation.trade_result (run_id, symbol, entry_ts);

CREATE TABLE IF NOT EXISTS simulation.equity_point (
    run_id text NOT NULL REFERENCES research.experiment_run(run_id) ON DELETE CASCADE,
    scenario_key text NOT NULL,
    event_ts timestamptz NOT NULL,
    cash numeric NOT NULL,
    gross_market_value numeric NOT NULL,
    gross_equity numeric NOT NULL,
    net_liquidation_equity numeric NOT NULL,
    open_positions integer NOT NULL CHECK (open_positions >= 0),
    PRIMARY KEY (run_id, scenario_key, event_ts),
    CHECK (gross_equity = cash + gross_market_value),
    CHECK (net_liquidation_equity <= gross_equity)
);

CREATE TABLE IF NOT EXISTS simulation.skipped_signal (
    skipped_signal_id bigserial PRIMARY KEY,
    run_id text NOT NULL REFERENCES research.experiment_run(run_id) ON DELETE CASCADE,
    signal_id text NOT NULL,
    reason text NOT NULL,
    details jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS research.metric_result (
    run_id text NOT NULL REFERENCES research.experiment_run(run_id) ON DELETE CASCADE,
    metric_scope text NOT NULL,
    scope_key text NOT NULL,
    metric_name text NOT NULL,
    metric_value_numeric numeric,
    metric_value_text text,
    sample_count bigint,
    details jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (run_id, metric_scope, scope_key, metric_name)
);

CREATE TABLE IF NOT EXISTS research.published_run (
    publication_key text PRIMARY KEY,
    run_id text NOT NULL REFERENCES research.experiment_run(run_id),
    published_at timestamptz NOT NULL DEFAULT now(),
    published_by text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE OR REPLACE FUNCTION research.publish_validated_run(
    p_run_id text,
    p_publication_key text,
    p_published_by text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    v_status text;
    v_validation text;
BEGIN
    SELECT status, validation_status
      INTO v_status, v_validation
      FROM research.experiment_run
     WHERE run_id = p_run_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'run % does not exist', p_run_id;
    END IF;
    IF v_status <> 'validated' OR v_validation <> 'passed' THEN
        RAISE EXCEPTION 'run % is not successfully validated', p_run_id;
    END IF;
    IF EXISTS (
        SELECT 1 FROM research.run_shard
         WHERE run_id = p_run_id AND status <> 'completed'
    ) THEN
        RAISE EXCEPTION 'run % has incomplete shards', p_run_id;
    END IF;

    INSERT INTO research.published_run(publication_key, run_id, published_by)
    VALUES (p_publication_key, p_run_id, p_published_by)
    ON CONFLICT (publication_key) DO UPDATE
        SET run_id = EXCLUDED.run_id,
            published_at = now(),
            published_by = EXCLUDED.published_by;

    UPDATE research.experiment_run
       SET status = 'published', published = true, finished_at = COALESCE(finished_at, now())
     WHERE run_id = p_run_id;
END;
$$;

COMMIT;
