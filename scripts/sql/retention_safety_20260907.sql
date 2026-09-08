-- Additive safety registry. No existing data deleted; no approvals inferred.
BEGIN;
SET LOCAL lock_timeout='2s';
CREATE SCHEMA IF NOT EXISTS operations;
CREATE TABLE IF NOT EXISTS operations.retention_gate (
 relation_name text PRIMARY KEY,
 policy_version text NOT NULL DEFAULT 'RETENTION-20260907.1',
 retain_from timestamptz NOT NULL,
 expires_at timestamptz NOT NULL,
 daily_coverage_verified boolean NOT NULL DEFAULT false,
 paper_evidence_verified boolean NOT NULL DEFAULT false,
 dependencies_verified boolean NOT NULL DEFAULT false,
 restore_verified boolean NOT NULL DEFAULT false,
 backup_waived boolean NOT NULL DEFAULT false,
 backup_waiver_reason text,
 rolling_cutoff boolean NOT NULL DEFAULT false,
 evidence_uri text NOT NULL CHECK(length(evidence_uri)>0),
 approved_by text NOT NULL CHECK(length(approved_by)>0),
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE operations.retention_gate ADD COLUMN IF NOT EXISTS backup_waived boolean NOT NULL DEFAULT false;
ALTER TABLE operations.retention_gate ADD COLUMN IF NOT EXISTS backup_waiver_reason text;
ALTER TABLE operations.retention_gate ADD COLUMN IF NOT EXISTS rolling_cutoff boolean NOT NULL DEFAULT false;
ALTER TABLE operations.retention_gate DROP CONSTRAINT IF EXISTS retention_gate_backup_evidence_check;
ALTER TABLE operations.retention_gate ADD CONSTRAINT retention_gate_backup_evidence_check CHECK (
 restore_verified OR (backup_waived AND length(coalesce(backup_waiver_reason,''))>0)
);
CREATE TABLE IF NOT EXISTS operations.retention_result (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 relation_name text NOT NULL,cutoff timestamptz NOT NULL,
 policy_version text NOT NULL DEFAULT 'RETENTION-20260907.1',
 rows_deleted bigint NOT NULL,partitions_dropped bigint NOT NULL,
 partition_bytes_before_drop bigint NOT NULL,
 committed_at timestamptz NOT NULL DEFAULT now()
);
COMMIT;
