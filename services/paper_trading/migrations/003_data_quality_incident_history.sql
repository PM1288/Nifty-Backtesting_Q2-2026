BEGIN;

ALTER TABLE __SCHEMA__.data_quality_incidents
  DROP CONSTRAINT IF EXISTS data_quality_incidents_exchange_instrument_token_incident_t_key;

CREATE UNIQUE INDEX IF NOT EXISTS data_quality_incidents_one_open_idx
  ON __SCHEMA__.data_quality_incidents(exchange,instrument_token,incident_type)
  WHERE status='OPEN';

INSERT INTO __SCHEMA__.schema_migrations(version)
VALUES ('003_data_quality_incident_history')
ON CONFLICT DO NOTHING;

COMMIT;
