BEGIN;
CREATE TABLE IF NOT EXISTS mobile_notifications.web_push_identity (
  singleton boolean PRIMARY KEY CHECK (singleton),
  private_jwk jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS mobile_notifications.web_push_subscription (
  endpoint_hash text PRIMARY KEY,
  endpoint text NOT NULL,
  user_uid text NOT NULL,
  cursor_id bigint NOT NULL,
  registered_at timestamptz NOT NULL DEFAULT now(),
  available_at timestamptz NOT NULL DEFAULT now(),
  test_requested_at timestamptz,
  test_sent_at timestamptz,
  lease uuid,
  failures integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS web_push_due_idx ON mobile_notifications.web_push_subscription(available_at);
COMMIT;
