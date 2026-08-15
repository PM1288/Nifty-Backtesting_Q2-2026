BEGIN;

CREATE TABLE IF NOT EXISTS mobile_notifications.preference (
  user_uid text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT true,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mobile_notification_preference_settings_object
    CHECK (jsonb_typeof(settings) = 'object')
);

CREATE TABLE IF NOT EXISTS mobile_notifications.delivery_audit (
  audit_id bigserial PRIMARY KEY,
  event_id text NOT NULL,
  user_uid text,
  device_id uuid REFERENCES mobile_notifications.device(device_id) ON DELETE SET NULL,
  event_type text NOT NULL,
  domain text NOT NULL,
  channel_id text NOT NULL,
  dedupe_key text NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('SENT','SUPPRESSED','FAILED','OPENED','ACTIONED')),
  reason text,
  firebase_message_id text,
  occurred_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mobile_notification_audit_user_time_idx
  ON mobile_notifications.delivery_audit(user_uid, recorded_at DESC);
CREATE INDEX IF NOT EXISTS mobile_notification_audit_event_idx
  ON mobile_notifications.delivery_audit(event_id, outcome);

CREATE TABLE IF NOT EXISTS mobile_notifications.dedupe_state (
  user_uid text NOT NULL,
  dedupe_key text NOT NULL,
  last_delivered_at timestamptz NOT NULL,
  hour_bucket timestamptz NOT NULL,
  hour_count integer NOT NULL DEFAULT 1 CHECK (hour_count > 0),
  day_bucket date NOT NULL,
  day_count integer NOT NULL DEFAULT 1 CHECK (day_count > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_uid, dedupe_key)
);

COMMIT;
