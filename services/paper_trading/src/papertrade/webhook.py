from __future__ import annotations

import random
import time
import uuid
from datetime import UTC, datetime, timedelta
from email.utils import parsedate_to_datetime
from typing import Any

import httpx

from .events import canonical_json, sign


class WebhookWorker:
    def __init__(
        self, db: Any, settings: Any, worker_id: str | None = None, client: httpx.Client | None = None
    ) -> None:
        self.db, self.settings, self.schema = db, settings, settings.PAPER_TRADING_SCHEMA
        self.worker_id = worker_id or f"webhook-{uuid.uuid4()}"
        self.client = client or httpx.Client(timeout=float(settings.WEBHOOK_TIMEOUT_SECONDS))

    def claim(self) -> dict[str, Any] | None:
        with self.db.connection() as conn:
            # A process can die after claiming a row. Requeue only leases whose
            # expiry has passed; live workers retain their ownership.
            conn.execute(
                f"UPDATE {self.schema}.webhook_outbox SET status='RETRY',lease_owner=NULL,lease_expires_at=NULL,available_at=now() WHERE status='PROCESSING' AND lease_expires_at<now()"
            )
            return conn.execute(
                f"""WITH candidate AS (SELECT outbox_id FROM {self.schema}.webhook_outbox WHERE status IN ('PENDING','RETRY') AND available_at<=now() AND (lease_expires_at IS NULL OR lease_expires_at<now()) ORDER BY available_at,created_at FOR UPDATE SKIP LOCKED LIMIT 1) UPDATE {self.schema}.webhook_outbox o SET status='PROCESSING',lease_owner=%s,lease_expires_at=now()+interval '60 seconds' FROM candidate c WHERE o.outbox_id=c.outbox_id RETURNING o.*""",
                (self.worker_id,),
            ).fetchone()

    def _retry_at(self, attempt: int, retry_after: str | None) -> datetime:
        if retry_after:
            try:
                return datetime.now(UTC) + timedelta(seconds=max(1, int(retry_after)))
            except ValueError:
                try:
                    return parsedate_to_datetime(retry_after).astimezone(UTC)
                except (TypeError, ValueError):
                    pass
        cap = min(3600, self.settings.WEBHOOK_BASE_RETRY_SECONDS * (2 ** max(attempt - 1, 0)))
        return datetime.now(UTC) + timedelta(seconds=random.uniform(cap * 0.5, cap))

    def deliver_one(self) -> bool:
        item = self.claim()
        if not item:
            return False
        started = time.monotonic()
        delivery_id = str(uuid.uuid4())
        with self.db.connection() as conn:
            prior = conn.execute(
                f"SELECT COALESCE(MAX(attempt_number),0) AS n FROM {self.schema}.webhook_delivery_attempts WHERE outbox_id=%s",
                (item["outbox_id"],),
            ).fetchone()
            attempt = max(int(item["attempt_count"]) + 1, int(prior["n"]) + 1)
            event = conn.execute(
                f"SELECT * FROM {self.schema}.trade_events WHERE event_id=%s", (item["event_id"],)
            ).fetchone()
            sub = (
                conn.execute(
                    f"SELECT * FROM {self.schema}.webhook_subscriptions WHERE subscription_id=%s",
                    (item["subscription_id"],),
                ).fetchone()
                if item["subscription_id"]
                else None
            )
        body = canonical_json(event["payload"])
        timestamp = str(int(time.time()))
        url = str(sub["endpoint_url"] if sub else self.settings.N8N_WEBHOOK_URL)
        headers = {
            "Content-Type": "application/cloudevents+json",
            "X-Paper-Event-Id": str(event["event_id"]),
            "X-Paper-Delivery-Id": delivery_id,
            "X-Paper-Delivery-Attempt": str(attempt),
            "X-Paper-Event-Sequence": str(event["sequence"]),
            "X-Paper-Signature-Timestamp": timestamp,
            "X-Paper-Signature-256": sign(
                timestamp, body, self.settings.WEBHOOK_SIGNING_SECRET.get_secret_value()
            ),
        }
        status = None
        excerpt = ""
        error = None
        retry_after = None
        try:
            response = self.client.post(
                url,
                content=body,
                headers=headers,
                auth=(self.settings.N8N_BASIC_USERNAME, self.settings.N8N_BASIC_PASSWORD.get_secret_value()),
            )
            status = response.status_code
            excerpt = response.text[:1000]
            retry_after = response.headers.get("Retry-After")
            success = 200 <= status < 300
            retryable = status in {408, 425, 429} or status >= 500
            if not success:
                error = f"HTTP_{status}"
        except httpx.HTTPError as exc:
            success = False
            retryable = True
            error = type(exc).__name__
        duration = int((time.monotonic() - started) * 1000)
        with self.db.connection() as conn:
            conn.execute(
                f"INSERT INTO {self.schema}.webhook_delivery_attempts(delivery_id,outbox_id,attempt_number,started_at,completed_at,response_status,response_body_excerpt,error_class,duration_ms) VALUES (%s,%s,%s,now(),now(),%s,%s,%s,%s)",
                (delivery_id, item["outbox_id"], attempt, status, excerpt, error, duration),
            )
            if success:
                conn.execute(
                    f"UPDATE {self.schema}.webhook_outbox SET status='DELIVERED',attempt_count=%s,delivered_at=now(),lease_owner=NULL,lease_expires_at=NULL,last_error=NULL WHERE outbox_id=%s",
                    (attempt, item["outbox_id"]),
                )
            elif retryable and attempt < self.settings.WEBHOOK_MAX_ATTEMPTS:
                conn.execute(
                    f"UPDATE {self.schema}.webhook_outbox SET status='RETRY',attempt_count=%s,available_at=%s,lease_owner=NULL,lease_expires_at=NULL,last_error=%s WHERE outbox_id=%s",
                    (attempt, self._retry_at(attempt, retry_after), error, item["outbox_id"]),
                )
            else:
                conn.execute(
                    f"UPDATE {self.schema}.webhook_outbox SET status='DEAD',attempt_count=%s,lease_owner=NULL,lease_expires_at=NULL,last_error=%s WHERE outbox_id=%s",
                    (attempt, error, item["outbox_id"]),
                )
                conn.execute(
                    f"INSERT INTO {self.schema}.webhook_dead_letters(outbox_id,event_id,reason) VALUES (%s,%s,%s) ON CONFLICT DO NOTHING",
                    (item["outbox_id"], item["event_id"], error or "NON_RETRYABLE"),
                )
        return True

    def drain(self, limit: int = 100) -> int:
        count = 0
        while count < limit and self.deliver_one():
            count += 1
        return count
