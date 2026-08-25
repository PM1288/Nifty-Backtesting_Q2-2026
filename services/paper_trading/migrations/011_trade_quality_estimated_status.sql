BEGIN;

ALTER TABLE __SCHEMA__.trade_quality_assessments
  DROP CONSTRAINT IF EXISTS trade_quality_assessments_status_check;

ALTER TABLE __SCHEMA__.trade_quality_assessments
  ADD CONSTRAINT trade_quality_assessments_status_check
  CHECK(status IN ('COMPLETE','PARTIAL','ESTIMATED','DEVELOPING','DATA_INVALID','NOT_ESTIMABLE'));

INSERT INTO __SCHEMA__.schema_migrations(version)
VALUES ('011_trade_quality_estimated_status')
ON CONFLICT DO NOTHING;

COMMIT;
