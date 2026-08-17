BEGIN;

CREATE TABLE IF NOT EXISTS mobile_notifications.event_outbox (
  outbox_id bigserial PRIMARY KEY,
  event_id uuid NOT NULL UNIQUE REFERENCES paper_trading.trade_events(event_id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','PROCESSING','RETRY','DELIVERED','DEAD')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  available_at timestamptz NOT NULL DEFAULT now(),
  lease_expires_at timestamptz,
  delivered_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mobile_notification_event_outbox_claim_idx
  ON mobile_notifications.event_outbox(status, available_at, outbox_id);

CREATE OR REPLACE FUNCTION mobile_notifications.enqueue_paper_event()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.payload->'data'->'notification' IS NOT NULL
     AND NEW.event_type IN (
       'com.papertrading.trade_leg.opened.v1',
       'com.papertrading.target_track.closed.v1',
       'com.papertrading.execution_target.hit.v1',
       'com.papertrading.trade_leg.closed.v1',
       'com.papertrading.trade_group.closed.v1',
       'com.papertrading.summary.daily.v1',
       'com.papertrading.summary.daily_corrected.v1',
       'com.papertrading.market_data.stale.v1',
       'com.papertrading.system.processing_error.v1',
       'com.papertrading.webhook.dead_lettered.v1'
     ) THEN
    INSERT INTO mobile_notifications.event_outbox(event_id)
    VALUES (NEW.event_id)
    ON CONFLICT (event_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enqueue_mobile_notification_event
  ON paper_trading.trade_events;
CREATE TRIGGER enqueue_mobile_notification_event
AFTER INSERT ON paper_trading.trade_events
FOR EACH ROW EXECUTE FUNCTION mobile_notifications.enqueue_paper_event();

CREATE OR REPLACE VIEW mobile_notifications.v_event_delivery_health AS
SELECT status, count(*)::bigint AS row_count, min(created_at) AS oldest
FROM mobile_notifications.event_outbox
GROUP BY status;

COMMIT;
