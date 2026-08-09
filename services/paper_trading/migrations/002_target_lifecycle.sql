ALTER TABLE __SCHEMA__.execution_exit_rules
  ADD COLUMN IF NOT EXISTS target_lifecycle text;

ALTER TABLE __SCHEMA__.execution_exit_rules
  DROP CONSTRAINT IF EXISTS execution_exit_rules_target_lifecycle_check;

ALTER TABLE __SCHEMA__.execution_exit_rules
  ADD CONSTRAINT execution_exit_rules_target_lifecycle_check
  CHECK (target_lifecycle IS NULL OR target_lifecycle IN ('INTRADAY','SWING'));

INSERT INTO __SCHEMA__.schema_migrations(version)
VALUES ('002_target_lifecycle') ON CONFLICT DO NOTHING;
