CREATE TABLE IF NOT EXISTS nse.daily_job_run (
    id BIGSERIAL PRIMARY KEY,
    job_date DATE NOT NULL UNIQUE,
    source_trade_date DATE NOT NULL,
    run_id BIGINT REFERENCES nse.ingest_runs(run_id),
    scheduled_for TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('RUNNING','SUCCESS','PARTIAL','FAILED','SUPPRESSED')),
    metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nse.notification_outbox (
    id BIGSERIAL PRIMARY KEY,
    event_id UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    event_type TEXT NOT NULL,
    dedupe_key TEXT NOT NULL UNIQUE,
    trade_date DATE NOT NULL,
    payload JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING','SENDING','RETRY','SENT','DEAD_LETTER')),
    attempts INTEGER NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_attempt_at TIMESTAMPTZ,
    sent_at TIMESTAMPTZ,
    response_status INTEGER,
    response_excerpt TEXT,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS nse_notification_outbox_claim_idx
    ON nse.notification_outbox(status,next_attempt_at,created_at)
    WHERE status IN ('PENDING','RETRY');

COMMENT ON TABLE nse.notification_outbox IS
    'Durable isolated NSE ingestion notifications; never used for paper-trading events.';
