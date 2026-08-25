BEGIN;

ALTER TABLE mobile_notifications.device
  ADD COLUMN IF NOT EXISTS device_model text,
  ADD COLUMN IF NOT EXISTS device_manufacturer text,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS mobile_notification_device_last_seen_idx
  ON mobile_notifications.device(user_uid, enabled, last_seen_at DESC);

COMMIT;
