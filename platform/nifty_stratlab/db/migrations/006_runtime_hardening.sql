BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS skipped_signal_run_signal_reason_unique
    ON simulation.skipped_signal (run_id, signal_id, reason);

CREATE TABLE IF NOT EXISTS research.programme_acceptance_criterion (
    programme_version text NOT NULL,
    criterion_id text NOT NULL,
    evidence_status text NOT NULL CHECK (evidence_status IN ('EVIDENCED','PARTIAL','BLOCKED','NOT_RUN')),
    owner_acceptance text NOT NULL DEFAULT 'PENDING'
        CHECK (owner_acceptance IN ('PENDING','PASS','DEFERRED','FAIL')),
    evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (programme_version, criterion_id)
);

COMMIT;
