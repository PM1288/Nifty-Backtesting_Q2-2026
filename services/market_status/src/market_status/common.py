from __future__ import annotations

import json
import logging
import os
import time
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any

from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from .config import Settings


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        fields = {
            "timestamp_utc": datetime.now(UTC).isoformat(),
            "level": record.levelname,
            "service": record.name,
            "event": getattr(record, "event", "log"),
            "message": record.getMessage(),
        }
        for key in (
            "job_id",
            "job_name",
            "event_id",
            "event_type",
            "trade_date",
            "source_run_id",
            "dedupe_key",
            "suppression_reason",
            "data_as_of",
            "coverage",
            "freshness",
            "delivery_attempt",
            "http_outcome",
            "correlation_id",
        ):
            value = getattr(record, key, None)
            if value is not None:
                fields[key] = value
        return json.dumps(fields, default=str, separators=(",", ":"))


def configure_logging(service: str) -> logging.Logger:
    handler = logging.StreamHandler()
    handler.setFormatter(JsonFormatter())
    logger = logging.getLogger(service)
    logger.handlers[:] = [handler]
    logger.setLevel(os.getenv("LOG_LEVEL", "INFO"))
    logger.propagate = False
    return logger


class Runtime:
    def __init__(self, settings: Settings, service_name: str) -> None:
        self.settings = settings
        self.service_name = service_name
        self.log = configure_logging(service_name)
        self.pool = ConnectionPool(
            settings.database_url,
            min_size=1,
            max_size=4,
            kwargs={"row_factory": dict_row, "autocommit": False},
        )

    def close(self) -> None:
        self.pool.close()

    def heartbeat(self, status: str, detail: dict[str, Any], success: bool = True) -> None:
        with self.pool.connection() as conn:
            conn.execute(
                """INSERT INTO market_status.service_heartbeat
                  (service_name,status,detail,last_success_at,last_error_at)
                VALUES (%s,%s,%s::jsonb,CASE WHEN %s THEN now() END,CASE WHEN %s THEN NULL ELSE now() END)
                ON CONFLICT(service_name) DO UPDATE SET status=excluded.status,detail=excluded.detail,
                  last_success_at=CASE WHEN %s THEN now() ELSE market_status.service_heartbeat.last_success_at END,
                  last_error_at=CASE WHEN %s THEN market_status.service_heartbeat.last_error_at ELSE now() END,
                  updated_at=now()""",
                (self.service_name, status, json.dumps(detail, default=str), success, success, success, success),
            )


def run_forever(runtime: Runtime, tick: Callable[[], dict[str, Any]]) -> None:
    while True:
        try:
            detail = tick()
            status = "DISABLED" if not runtime.settings.notifications_enabled else "OK"
            runtime.heartbeat(status, detail)
            runtime.log.info("tick complete", extra={"event": "tick", **detail})
        except Exception as exc:
            runtime.log.exception("tick failed", extra={"event": "tick_failed"})
            try:
                runtime.heartbeat("ERROR", {"error": f"{type(exc).__name__}: {exc}"}, False)
            except Exception:
                runtime.log.exception("heartbeat failed", extra={"event": "heartbeat_failed"})
        time.sleep(runtime.settings.poll_seconds)


def check(runtime: Runtime) -> None:
    with runtime.pool.connection() as conn:
        conn.execute("SELECT 1")
        conn.execute("SELECT 1 FROM market_status.service_heartbeat LIMIT 1")
    print(json.dumps({"status": "PASS", "enabled": runtime.settings.notifications_enabled}))
