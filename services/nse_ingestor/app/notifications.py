from __future__ import annotations

from datetime import datetime, timedelta, timezone
import logging
import uuid

import requests

LOG = logging.getLogger(__name__)
RETRY_DELAYS = (10, 30, 120, 600, 1800, 3600)


def build_missing_files_event(job_date, source_trade_date, run_id: int, metrics: dict) -> tuple[str, dict]:
    event_id = str(uuid.uuid4())
    missing = metrics.get("missing_files", [])
    payload = {
        "schema": "nse-daily-ingest-whatsapp.v1",
        "event_id": event_id,
        "event_type": "nse.daily.files.missing.v1",
        "environment": "DATA_OPERATIONS",
        "job_date": job_date.isoformat(),
        "trade_date": source_trade_date.isoformat(),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "timezone": "Asia/Kolkata",
        "dedupe_key": f"nse-missing-files:{job_date.isoformat()}:{source_trade_date.isoformat()}",
        "source": "nse-ingestor",
        "payload": {
            "run_id": run_id,
            "expected_files": metrics["expected_files"],
            "available_files": metrics["available_files"],
            "missing_count": metrics["missing_count"],
            "missing_files": missing,
            "action": "Review NSE report availability and rerun only the missing reports.",
        },
    }
    return payload["dedupe_key"], payload


class DeliveryWorker:
    def __init__(self, conn, settings):
        self.conn = conn
        self.settings = settings

    def deliver_once(self, limit: int = 20) -> int:
        if not self.settings.notifications_enabled or not self.settings.n8n_webhook_url:
            return 0
        delivered = 0
        for _ in range(limit):
            row = self._claim()
            if row is None:
                break
            if self._deliver(row):
                delivered += 1
        return delivered

    def _claim(self):
        with self.conn.transaction():
            row = self.conn.execute(
                '''
                SELECT id,event_id,event_type,dedupe_key,payload,attempts
                FROM nse.notification_outbox
                WHERE status IN ('PENDING','RETRY') AND next_attempt_at <= now()
                ORDER BY created_at
                FOR UPDATE SKIP LOCKED
                LIMIT 1
                '''
            ).fetchone()
            if row is None:
                return None
            self.conn.execute(
                "UPDATE nse.notification_outbox SET status='SENDING',attempts=attempts+1,last_attempt_at=now(),updated_at=now() WHERE id=%s",
                (row[0],),
            )
        return row

    def _deliver(self, row) -> bool:
        outbox_id, event_id, event_type, dedupe_key, payload, attempts_before = row
        auth = None
        if self.settings.n8n_user:
            auth = (self.settings.n8n_user, self.settings.n8n_password)
        try:
            response = requests.post(
                self.settings.n8n_webhook_url,
                json=payload,
                auth=auth,
                headers={"Idempotency-Key": str(event_id), "X-NSE-Ingest-Event-Type": event_type},
                timeout=self.settings.n8n_timeout_seconds,
            )
            if 200 <= response.status_code < 300:
                self.conn.execute(
                    "UPDATE nse.notification_outbox SET status='SENT',sent_at=now(),response_status=%s,response_excerpt=%s,updated_at=now() WHERE id=%s",
                    (response.status_code, response.text[:500], outbox_id),
                )
                self.conn.commit()
                return True
            transient = response.status_code in {408, 425, 429} or response.status_code >= 500
            self._fail(outbox_id, attempts_before + 1, f"HTTP {response.status_code}: {response.text[:300]}", response.status_code, transient)
        except requests.RequestException as exc:
            self._fail(outbox_id, attempts_before + 1, str(exc), None, True)
        return False

    def _fail(self, outbox_id: int, attempts: int, error: str, response_status: int | None, transient: bool) -> None:
        terminal = not transient or attempts >= self.settings.notification_max_attempts
        status = "DEAD_LETTER" if terminal else "RETRY"
        delay = RETRY_DELAYS[min(max(attempts - 1, 0), len(RETRY_DELAYS) - 1)]
        self.conn.execute(
            '''
            UPDATE nse.notification_outbox
            SET status=%s,next_attempt_at=%s,response_status=%s,last_error=%s,updated_at=now()
            WHERE id=%s
            ''',
            (status, datetime.now(timezone.utc) + timedelta(seconds=delay), response_status, error[:1000], outbox_id),
        )
        self.conn.commit()
        LOG.warning("NSE notification delivery %s outbox_id=%s error=%s", status, outbox_id, error)
