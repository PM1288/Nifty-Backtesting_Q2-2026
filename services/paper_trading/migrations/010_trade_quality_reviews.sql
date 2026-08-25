BEGIN;

CREATE TABLE IF NOT EXISTS __SCHEMA__.trade_quality_reviews(
  review_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_group_id uuid NOT NULL REFERENCES __SCHEMA__.trade_groups ON DELETE RESTRICT,
  policy_id text NOT NULL,
  policy_version text NOT NULL,
  asset_class text NOT NULL CHECK(asset_class IN ('EQUITY','OPTION')),
  ratings jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(ratings)='object'),
  hard_fail_flags text[] NOT NULL DEFAULT '{}',
  entry_evidence_confirmed boolean NOT NULL DEFAULT false,
  evidence_note text NOT NULL CHECK(length(btrim(evidence_note)) BETWEEN 10 AND 2000),
  reviewer_uid text NOT NULL,
  reviewer_email text,
  supersedes_review_id uuid REFERENCES __SCHEMA__.trade_quality_reviews ON DELETE RESTRICT,
  reviewed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS trade_quality_reviews_trade_latest_idx
  ON __SCHEMA__.trade_quality_reviews(trade_group_id, reviewed_at DESC, review_id DESC);

CREATE OR REPLACE VIEW __SCHEMA__.v_trade_quality_review_latest AS
SELECT DISTINCT ON (trade_group_id, policy_version)
  review_id,trade_group_id,policy_id,policy_version,asset_class,ratings,hard_fail_flags,
  entry_evidence_confirmed,evidence_note,reviewer_uid,reviewer_email,supersedes_review_id,reviewed_at
FROM __SCHEMA__.trade_quality_reviews
ORDER BY trade_group_id,policy_version,reviewed_at DESC,review_id DESC;

INSERT INTO __SCHEMA__.schema_migrations(version)
VALUES ('010_trade_quality_reviews')
ON CONFLICT DO NOTHING;

COMMIT;
