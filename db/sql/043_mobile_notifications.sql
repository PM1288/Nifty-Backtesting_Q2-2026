BEGIN;

CREATE SCHEMA IF NOT EXISTS mobile_notifications;

CREATE TABLE IF NOT EXISTS mobile_notifications.device (
  device_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_uid text NOT NULL,
  installation_id text NOT NULL,
  platform text NOT NULL CHECK (platform IN ('ANDROID')),
  push_token text NOT NULL,
  push_token_hash text NOT NULL,
  app_version text,
  build_number text,
  locale text,
  timezone text,
  enabled boolean NOT NULL DEFAULT true,
  last_registered_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_uid, installation_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS mobile_device_token_hash_idx
  ON mobile_notifications.device(push_token_hash);
CREATE INDEX IF NOT EXISTS mobile_device_user_enabled_idx
  ON mobile_notifications.device(user_uid, enabled, updated_at DESC);

CREATE TABLE IF NOT EXISTS mobile_notifications.notification_state (
  user_uid text NOT NULL,
  event_id uuid NOT NULL,
  read_at timestamptz,
  acknowledged_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_uid, event_id)
);

COMMENT ON SCHEMA mobile_notifications IS
  'Authenticated Android device registrations and per-user state for canonical backend events.';
COMMENT ON COLUMN mobile_notifications.device.push_token IS
  'Sensitive FCM delivery address. Never return or log this value.';

COMMIT;
