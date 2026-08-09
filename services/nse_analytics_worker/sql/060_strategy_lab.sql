BEGIN;

CREATE TABLE IF NOT EXISTS research.strategy_lab_run (
    run_id text PRIMARY KEY,
    idempotency_key text NOT NULL,
    request_hash text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
    requested_by text NOT NULL,
    strategy_version_id text NOT NULL
        REFERENCES nse_app.backtest_strategy_version(strategy_version_id),
    source_batch_run_id bigint NOT NULL
        REFERENCES nse_app.batch_run_audit(batch_run_id),
    engine_version text NOT NULL,
    evaluation_policy_version text NOT NULL,
    requested_date_start date NOT NULL,
    requested_date_end date NOT NULL,
    actual_date_start date,
    actual_date_end date,
    universe_mode text NOT NULL
        CHECK (universe_mode IN ('single_stock','nifty_100')),
    symbols jsonb NOT NULL DEFAULT '[]'::jsonb,
    parameters jsonb NOT NULL,
    capital_config jsonb NOT NULL,
    status text NOT NULL DEFAULT 'QUEUED'
        CHECK (status IN (
            'QUEUED','RUNNING','VALIDATING','COMPLETED','FAILED',
            'FAILED_VALIDATION','CANCEL_REQUESTED','CANCELLED'
        )),
    validation_status text NOT NULL DEFAULT 'PENDING'
        CHECK (validation_status IN ('PENDING','PASS','FAIL','NOT_RUN')),
    total_work_units integer NOT NULL DEFAULT 0 CHECK (total_work_units >= 0),
    completed_work_units integer NOT NULL DEFAULT 0 CHECK (completed_work_units >= 0),
    lease_owner text,
    lease_expires_at timestamptz,
    heartbeat_at timestamptz,
    attempt_no integer NOT NULL DEFAULT 0 CHECK (attempt_no >= 0),
    summary jsonb NOT NULL DEFAULT '{}'::jsonb,
    validation_result jsonb NOT NULL DEFAULT '{}'::jsonb,
    result_hash text,
    error_code text,
    error_detail text,
    created_at timestamptz NOT NULL DEFAULT now(),
    started_at timestamptz,
    finished_at timestamptz,
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (requested_by, idempotency_key),
    CHECK (requested_date_end >= requested_date_start),
    CHECK (actual_date_end IS NULL OR actual_date_start IS NOT NULL),
    CHECK (actual_date_end IS NULL OR actual_date_end >= actual_date_start),
    CHECK (completed_work_units <= total_work_units OR total_work_units = 0),
    CHECK (jsonb_typeof(symbols) = 'array'),
    CHECK (jsonb_typeof(parameters) = 'object'),
    CHECK (jsonb_typeof(capital_config) = 'object')
);

CREATE INDEX IF NOT EXISTS strategy_lab_run_claim_idx
    ON research.strategy_lab_run(status, lease_expires_at, created_at)
    WHERE status IN ('QUEUED','RUNNING');

CREATE INDEX IF NOT EXISTS strategy_lab_run_strategy_idx
    ON research.strategy_lab_run(strategy_version_id, created_at DESC);

CREATE TABLE IF NOT EXISTS research.strategy_lab_event (
    event_id bigserial PRIMARY KEY,
    run_id text NOT NULL REFERENCES research.strategy_lab_run(run_id),
    event_type text NOT NULL,
    status_before text,
    status_after text,
    event_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    actor text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (jsonb_typeof(event_payload) = 'object')
);

CREATE INDEX IF NOT EXISTS strategy_lab_event_run_idx
    ON research.strategy_lab_event(run_id, event_id);

CREATE TABLE IF NOT EXISTS research.strategy_lab_signal (
    signal_id text PRIMARY KEY,
    run_id text NOT NULL REFERENCES research.strategy_lab_run(run_id),
    symbol text NOT NULL,
    sector text NOT NULL,
    signal_date date NOT NULL,
    proposed_entry_date date NOT NULL,
    portfolio_accepted boolean NOT NULL,
    skipped_reason text,
    rank_inputs jsonb NOT NULL,
    feature_snapshot jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (run_id, symbol, signal_date),
    CHECK (proposed_entry_date > signal_date),
    CHECK (portfolio_accepted OR skipped_reason IS NOT NULL),
    CHECK (jsonb_typeof(rank_inputs) = 'object'),
    CHECK (jsonb_typeof(feature_snapshot) = 'object')
);

CREATE INDEX IF NOT EXISTS strategy_lab_signal_run_idx
    ON research.strategy_lab_signal(run_id, portfolio_accepted, signal_date, symbol);

CREATE TABLE IF NOT EXISTS simulation.strategy_lab_trade (
    trade_id text PRIMARY KEY,
    run_id text NOT NULL REFERENCES research.strategy_lab_run(run_id),
    symbol text NOT NULL,
    sector text NOT NULL,
    signal_date date NOT NULL,
    entry_date date NOT NULL,
    entry_price numeric(20,6) NOT NULL CHECK (entry_price > 0),
    quantity numeric(24,6) NOT NULL CHECK (quantity > 0),
    signal_rsi numeric(12,6),
    signal_willr numeric(12,6),
    signal_macd_line numeric(20,8),
    signal_macd_signal numeric(20,8),
    signal_macd_hist numeric(20,8),
    signal_sma20 numeric(20,6),
    signal_sma50 numeric(20,6),
    close_vs_prev_close_pct numeric(14,8),
    stock_regime text,
    nifty_regime text,
    india_vix_regime text,
    global_market_context jsonb NOT NULL DEFAULT '{}'::jsonb,
    execution_status text NOT NULL CHECK (execution_status IN ('OPEN','CLOSED')),
    execution_exit_date date,
    execution_exit_price numeric(20,6),
    execution_exit_reason text,
    gross_pnl numeric(24,6),
    total_cost numeric(24,6),
    tax_provision numeric(24,6),
    after_tax_pnl numeric(24,6),
    net_liquidation_pnl numeric(24,6) NOT NULL,
    evaluation_sessions integer NOT NULL CHECK (evaluation_sessions >= 1),
    actual_holding_trading_sessions integer NOT NULL CHECK (actual_holding_trading_sessions >= 1),
    capital_days numeric(24,6) NOT NULL CHECK (capital_days >= 0),
    maximum_favourable_excursion_pct numeric(14,8),
    maximum_adverse_excursion_pct numeric(14,8),
    time_underwater_sessions integer NOT NULL DEFAULT 0 CHECK (time_underwater_sessions >= 0),
    recovery_sessions integer,
    same_bar_ambiguity boolean NOT NULL DEFAULT false,
    right_censored boolean NOT NULL DEFAULT false,
    feature_snapshot jsonb NOT NULL,
    execution_result jsonb NOT NULL,
    diagnostic_result jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (run_id, symbol, signal_date),
    CHECK (entry_date > signal_date),
    CHECK (execution_exit_date IS NULL OR execution_exit_date >= entry_date),
    CHECK (jsonb_typeof(feature_snapshot) = 'object'),
    CHECK (jsonb_typeof(execution_result) = 'object'),
    CHECK (jsonb_typeof(diagnostic_result) = 'object')
);

ALTER TABLE simulation.strategy_lab_trade
    ADD COLUMN IF NOT EXISTS global_market_context jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid='simulation.strategy_lab_trade'::regclass
           AND conname='strategy_lab_trade_global_context_object_ck'
    ) THEN
        ALTER TABLE simulation.strategy_lab_trade
            ADD CONSTRAINT strategy_lab_trade_global_context_object_ck
            CHECK (jsonb_typeof(global_market_context) = 'object');
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS strategy_lab_trade_run_entry_idx
    ON simulation.strategy_lab_trade(run_id, entry_date, symbol);

CREATE TABLE IF NOT EXISTS simulation.strategy_lab_ladder_result (
    run_id text NOT NULL REFERENCES research.strategy_lab_run(run_id),
    trade_id text NOT NULL REFERENCES simulation.strategy_lab_trade(trade_id),
    ladder_kind text NOT NULL
        CHECK (ladder_kind IN ('INTRADAY_REWARD','D5_REWARD','ADVERSE','H30_REWARD')),
    level_key text NOT NULL,
    level_pct numeric(12,8) NOT NULL,
    hit boolean NOT NULL,
    first_hit_date date,
    first_hit_session integer,
    hit_price numeric(20,6),
    sequence_state text,
    details jsonb NOT NULL DEFAULT '{}'::jsonb,
    PRIMARY KEY (trade_id, ladder_kind, level_key),
    CHECK (first_hit_session IS NULL OR first_hit_session >= 0),
    CHECK (NOT hit OR first_hit_date IS NOT NULL),
    CHECK (jsonb_typeof(details) = 'object')
);

CREATE INDEX IF NOT EXISTS strategy_lab_ladder_run_idx
    ON simulation.strategy_lab_ladder_result(run_id, ladder_kind, level_key, hit);

CREATE TABLE IF NOT EXISTS simulation.strategy_lab_equity_point (
    run_id text NOT NULL REFERENCES research.strategy_lab_run(run_id),
    trade_date date NOT NULL,
    cash numeric(24,6),
    deployed_capital numeric(24,6) NOT NULL,
    net_liquidation_equity numeric(24,6) NOT NULL,
    realised_pnl numeric(24,6) NOT NULL,
    unrealised_pnl numeric(24,6) NOT NULL,
    drawdown_pct numeric(14,8) NOT NULL,
    open_positions integer NOT NULL CHECK (open_positions >= 0),
    PRIMARY KEY (run_id, trade_date)
);

CREATE TABLE IF NOT EXISTS research.strategy_lab_artifact (
    artifact_id bigserial PRIMARY KEY,
    run_id text NOT NULL REFERENCES research.strategy_lab_run(run_id),
    artifact_kind text NOT NULL CHECK (artifact_kind IN ('TRADES_CSV','SUMMARY_JSON','MANIFEST_JSON')),
    relative_path text NOT NULL,
    byte_size bigint NOT NULL CHECK (byte_size >= 0),
    sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
    row_count bigint,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (run_id, artifact_kind)
);

COMMENT ON TABLE research.strategy_lab_run IS
    'Durable, bounded, paper/research-only interactive backtest request ledger.';
COMMENT ON TABLE simulation.strategy_lab_trade IS
    'Consolidated per-trade execution and independent path diagnostics; diagnostic targets never imply execution exits.';
COMMENT ON TABLE simulation.strategy_lab_ladder_result IS
    'Every ladder level is evaluated independently; no first-target short circuit is permitted.';

COMMIT;
