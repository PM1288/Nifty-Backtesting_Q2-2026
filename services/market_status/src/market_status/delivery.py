from __future__ import annotations

import argparse
import json
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
from jsonschema import Draft202012Validator, FormatChecker

from .common import Runtime, check, run_forever
from .config import Settings
from .models import fingerprint_membership

SERVICE = "market-status-delivery"
RETRY_DELAYS = (10, 30, 120, 600, 1800, 3600)
TRANSIENT_STATUS = {408, 425, 429}
PERMANENT_STATUS = {400, 401, 403, 404, 422}


def retryable_status(status: int) -> bool:
    return status in TRANSIENT_STATUS or status >= 500


class Delivery(Runtime):
    def __init__(self, settings: Settings) -> None:
        super().__init__(settings, SERVICE)
        schema = json.loads(settings.schema_path.read_text(encoding="utf-8"))
        self.validator = Draft202012Validator(schema, format_checker=FormatChecker())
        self.client = httpx.Client(timeout=settings.webhook_timeout_seconds, follow_redirects=False)

    def close(self) -> None:
        self.client.close()
        super().close()

    def claim(self) -> dict[str, Any] | None:
        with self.pool.connection() as conn:
            row = conn.execute(
                """SELECT * FROM market_status.notification_outbox
                WHERE status IN ('PENDING','RETRY') AND next_attempt_at<=now()
                ORDER BY next_attempt_at,created_at LIMIT 1 FOR UPDATE SKIP LOCKED"""
            ).fetchone()
            if not row:
                return None
            claimed = conn.execute(
                """UPDATE market_status.notification_outbox SET status='SENDING',attempts=attempts+1,
                  last_attempt_at=now(),updated_at=now() WHERE id=%s RETURNING *""",
                (row["id"],),
            ).fetchone()
            conn.execute(
                """INSERT INTO market_status.notification_delivery_attempt
                  (outbox_id,attempt_number,outcome) VALUES (%s,%s,'SENDING')""",
                (claimed["id"], claimed["attempts"]),
            )
            return dict(claimed)

    def mark_sent(self, event: dict[str, Any], status: int, excerpt: str, *, update_state: bool) -> None:
        with self.pool.connection() as conn:
            conn.execute(
                """UPDATE market_status.notification_outbox SET status='SENT',sent_at=now(),
                  response_status=%s,response_excerpt=%s,last_error=NULL,updated_at=now() WHERE id=%s""",
                (status, excerpt[:500], event["id"]),
            )
            conn.execute(
                """UPDATE market_status.notification_delivery_attempt SET outcome='SENT',completed_at=now(),
                  http_status=%s,response_excerpt=%s WHERE outbox_id=%s AND attempt_number=%s""",
                (status, excerpt[:500], event["id"], event["attempts"]),
            )
            if update_state and event["event_type"] == "market.oiis.candidates.changed.v1":
                payload = event["payload"]["payload"]
                membership = {
                    "long": sorted(item["symbol"] for item in payload.get("long_candidates", [])),
                    "short": sorted(item["symbol"] for item in payload.get("short_candidates", [])),
                }
                fingerprint = fingerprint_membership(membership)
                conn.execute(
                    """INSERT INTO market_status.notification_state
                      (event_family,destination_key,trade_date,last_successful_membership,
                       last_successful_fingerprint,last_successful_event_id,last_successful_source_run_id,
                       last_successful_at,last_enqueued_fingerprint,last_enqueued_event_id)
                    VALUES ('OIIS_CANDIDATES',%s,%s,%s::jsonb,%s,%s,%s,now(),%s,%s)
                    ON CONFLICT(event_family,destination_key,trade_date) DO UPDATE SET
                      last_successful_membership=excluded.last_successful_membership,
                      last_successful_fingerprint=excluded.last_successful_fingerprint,
                      last_successful_event_id=excluded.last_successful_event_id,
                      last_successful_source_run_id=excluded.last_successful_source_run_id,
                      last_successful_at=excluded.last_successful_at,
                      last_enqueued_fingerprint=excluded.last_enqueued_fingerprint,
                      last_enqueued_event_id=excluded.last_enqueued_event_id,updated_at=now()""",
                    (
                        event["destination_key"],
                        event["trade_date"],
                        json.dumps(membership),
                        fingerprint,
                        event["event_id"],
                        event["source_run_id"],
                        fingerprint,
                        event["event_id"],
                    ),
                )

    def mark_failure(
        self, event: dict[str, Any], error: str, status: int | None, permanent: bool = False
    ) -> None:
        exhausted = int(event["attempts"]) >= self.settings.webhook_max_attempts
        dead = permanent or exhausted
        next_status = "DEAD_LETTER" if dead else "RETRY"
        delay_index = min(max(0, int(event["attempts"]) - 1), len(RETRY_DELAYS) - 1)
        retry_at = datetime.now(UTC) + timedelta(seconds=RETRY_DELAYS[delay_index])
        with self.pool.connection() as conn:
            conn.execute(
                """UPDATE market_status.notification_outbox SET status=%s,next_attempt_at=%s,
                  response_status=%s,last_error=%s,updated_at=now() WHERE id=%s""",
                (next_status, retry_at, status, error[:1000], event["id"]),
            )
            conn.execute(
                """UPDATE market_status.notification_delivery_attempt SET outcome=%s,completed_at=now(),
                  http_status=%s,error_excerpt=%s WHERE outbox_id=%s AND attempt_number=%s""",
                (next_status, status, error[:1000], event["id"], event["attempts"]),
            )

    def deliver_one(self) -> bool:
        event = self.claim()
        if not event:
            return False
        errors = sorted(self.validator.iter_errors(event["payload"]), key=lambda item: list(item.path))
        if errors:
            self.mark_failure(event, f"EVENT_SCHEMA_INVALID: {errors[0].message}", None, permanent=True)
            return True
        if self.settings.dry_run:
            self.mark_sent(event, 204, "DRY_RUN_NO_NETWORK", update_state=False)
            return True
        if not self.settings.delivery_ready():
            self.mark_failure(event, "WEBHOOK_AUTH_FAILED: incomplete dedicated configuration", None, permanent=True)
            return True
        headers = {
            "Content-Type": "application/json",
            "Idempotency-Key": str(event["event_id"]),
            "X-Market-Status-Event-Id": str(event["event_id"]),
            "X-Market-Status-Event-Type": event["event_type"],
            "X-Correlation-Id": str(event["correlation_id"]),
        }
        try:
            response = self.client.post(
                self.settings.webhook_url,
                json=event["payload"],
                headers=headers,
                auth=httpx.BasicAuth(self.settings.webhook_username, self.settings.webhook_password),
            )
        except (httpx.TimeoutException, httpx.NetworkError) as exc:
            self.mark_failure(event, f"{type(exc).__name__}: {exc}", None)
            return True
        if 200 <= response.status_code < 300:
            self.mark_sent(event, response.status_code, response.text, update_state=True)
            return True
        permanent = response.status_code in PERMANENT_STATUS or not retryable_status(response.status_code)
        self.mark_failure(
            event,
            f"HTTP {response.status_code}: {response.text[:500]}",
            response.status_code,
            permanent=permanent,
        )
        return True

    def tick(self) -> dict[str, Any]:
        if not self.settings.notifications_enabled:
            return {"disabled": True, "processed": 0}
        processed = 0
        while processed < 20 and self.deliver_one():
            processed += 1
        with self.pool.connection() as conn:
            depth = conn.execute(
                """SELECT count(*) FILTER(WHERE status='PENDING') pending,
                  count(*) FILTER(WHERE status='RETRY') retry,
                  count(*) FILTER(WHERE status='DEAD_LETTER') dead
                FROM market_status.notification_outbox"""
            ).fetchone()
        return {"disabled": False, "processed": processed, "outbox": dict(depth)}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=("run", "tick", "check"))
    args = parser.parse_args()
    runtime = Delivery(Settings())
    try:
        if args.command == "run":
            run_forever(runtime, runtime.tick)
        elif args.command == "tick":
            print(json.dumps(runtime.tick(), indent=2, default=str))
        else:
            check(runtime)
    finally:
        runtime.close()


if __name__ == "__main__":
    main()
