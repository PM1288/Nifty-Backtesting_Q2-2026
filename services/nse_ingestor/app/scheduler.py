from __future__ import annotations

from datetime import datetime, time
import logging
import time as time_module
from zoneinfo import ZoneInfo

from . import db
from .cli import execute_daily
from .config import get_settings, load_report_catalog
from .logging_setup import configure_logging
from .notifications import DeliveryWorker

LOG = logging.getLogger(__name__)
SCHEDULER_LOCK = 7_550_826


def parse_clock(value: str) -> time:
    hour, minute = (int(part) for part in value.split(":", 1))
    return time(hour, minute)


def tick(now: datetime | None = None) -> str:
    settings = get_settings()
    tz = ZoneInfo(settings.timezone)
    current = now.astimezone(tz) if now else datetime.now(tz)
    if current.time() < parse_clock(settings.schedule_time):
        return "BEFORE_SCHEDULE"

    conn = db.connect(settings.database_url)
    try:
        if not db.is_trading_day(conn, current.date()):
            return "NOT_TRADING_DAY"
        locked = conn.execute("SELECT pg_try_advisory_lock(%s)", (SCHEDULER_LOCK,)).fetchone()[0]
        if not locked:
            return "LOCK_BUSY"
        try:
            source_date = db.resolve_previous_trading_day(conn, current.date())
            scheduled_for = datetime.combine(current.date(), parse_clock(settings.schedule_time), tzinfo=tz)
            job_id = db.claim_daily_job(conn, current.date(), source_date, scheduled_for)
            if job_id is None:
                return "ALREADY_CLAIMED"
            execute_daily(conn, settings, load_report_catalog(settings.report_catalog_path), job_id, current.date(), source_date)
            return "EXECUTED"
        finally:
            conn.execute("SELECT pg_advisory_unlock(%s)", (SCHEDULER_LOCK,))
            conn.commit()
    finally:
        conn.close()


def run() -> None:
    settings = get_settings()
    configure_logging(settings.log_dir)
    conn = db.connect(settings.database_url)
    db.run_migrations(conn, __import__("pathlib").Path("/app/sql"))
    conn.close()
    LOG.info("NSE scheduler active daily at %s %s", settings.schedule_time, settings.timezone)
    while True:
        try:
            LOG.info("scheduler tick result=%s", tick())
        except Exception:
            LOG.exception("scheduler tick failed")
        time_module.sleep(settings.scheduler_poll_seconds)


def run_delivery() -> None:
    settings = get_settings()
    configure_logging(settings.log_dir)
    conn = db.connect(settings.database_url)
    db.run_migrations(conn, __import__("pathlib").Path("/app/sql"))
    worker = DeliveryWorker(conn, settings)
    LOG.info("NSE notification delivery worker active")
    while True:
        try:
            worker.deliver_once()
        except Exception:
            LOG.exception("notification delivery tick failed")
            conn.rollback()
        time_module.sleep(5)
