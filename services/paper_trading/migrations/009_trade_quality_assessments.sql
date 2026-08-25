BEGIN;

CREATE TABLE IF NOT EXISTS __SCHEMA__.trade_quality_policies(
  policy_id text NOT NULL,
  policy_version text NOT NULL,
  effective_from date NOT NULL,
  effective_to date,
  asset_class text NOT NULL CHECK(asset_class IN ('EQUITY','OPTION')),
  process_maximum numeric(8,2) NOT NULL,
  outcome_maximum numeric(8,2) NOT NULL,
  policy_json jsonb NOT NULL,
  immutable_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(policy_id,policy_version,asset_class),
  CHECK(process_maximum+outcome_maximum=100)
);

CREATE TABLE IF NOT EXISTS __SCHEMA__.trade_quality_assessments(
  assessment_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_group_id uuid NOT NULL REFERENCES __SCHEMA__.trade_groups ON DELETE RESTRICT,
  policy_id text NOT NULL,
  policy_version text NOT NULL,
  asset_class text NOT NULL CHECK(asset_class IN ('EQUITY','OPTION')),
  assessment_stage text NOT NULL CHECK(assessment_stage IN ('ENTRY','CURRENT','FINAL','VERSIONED_RECOMPUTE')),
  status text NOT NULL CHECK(status IN ('COMPLETE','PARTIAL','DEVELOPING','DATA_INVALID','NOT_ESTIMABLE')),
  process_points numeric(8,2),
  process_score_pct numeric(8,2),
  process_coverage_pct numeric(8,2) NOT NULL DEFAULT 0,
  outcome_points numeric(8,2),
  outcome_score_pct numeric(8,2),
  outcome_coverage_pct numeric(8,2) NOT NULL DEFAULT 0,
  total_score numeric(8,2),
  quality_label text NOT NULL,
  hard_fail_flags text[] NOT NULL DEFAULT '{}',
  evidence_through timestamptz NOT NULL,
  source_watermark text NOT NULL,
  input_snapshot jsonb NOT NULL,
  result_snapshot jsonb NOT NULL,
  supersedes_assessment_id uuid REFERENCES __SCHEMA__.trade_quality_assessments,
  computed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(trade_group_id,policy_version,assessment_stage,source_watermark),
  CHECK(total_score IS NULL OR total_score BETWEEN 0 AND 100)
);
CREATE INDEX IF NOT EXISTS trade_quality_assessments_trade_latest_idx
  ON __SCHEMA__.trade_quality_assessments(trade_group_id,computed_at DESC);
CREATE INDEX IF NOT EXISTS trade_quality_assessments_label_idx
  ON __SCHEMA__.trade_quality_assessments(quality_label,computed_at DESC);

CREATE TABLE IF NOT EXISTS __SCHEMA__.trade_quality_criteria(
  assessment_id uuid NOT NULL REFERENCES __SCHEMA__.trade_quality_assessments ON DELETE CASCADE,
  criterion_id text NOT NULL,
  phase text NOT NULL CHECK(phase IN ('PROCESS','OUTCOME')),
  weight numeric(8,2) NOT NULL CHECK(weight>0),
  rating numeric(4,2) CHECK(rating BETWEEN 0 AND 5),
  weighted_points numeric(8,2),
  status text NOT NULL CHECK(status IN ('SCORED','NOT_ESTIMABLE','NOT_MATURE')),
  reason_code text,
  reason text NOT NULL,
  evidence_refs jsonb NOT NULL DEFAULT '[]',
  evidence_time timestamptz,
  PRIMARY KEY(assessment_id,criterion_id),
  CHECK(weighted_points IS NULL OR weighted_points BETWEEN 0 AND weight)
);

CREATE OR REPLACE VIEW __SCHEMA__.v_trade_quality_latest AS
SELECT DISTINCT ON (trade_group_id)
  trade_group_id,assessment_id,policy_id,policy_version,asset_class,assessment_stage,status,
  process_points,process_score_pct,process_coverage_pct,outcome_points,outcome_score_pct,
  outcome_coverage_pct,total_score,quality_label,hard_fail_flags,evidence_through,computed_at
FROM __SCHEMA__.trade_quality_assessments
ORDER BY trade_group_id,computed_at DESC,assessment_id DESC;

INSERT INTO __SCHEMA__.schema_migrations(version)
VALUES ('009_trade_quality_assessments')
ON CONFLICT DO NOTHING;

COMMIT;
