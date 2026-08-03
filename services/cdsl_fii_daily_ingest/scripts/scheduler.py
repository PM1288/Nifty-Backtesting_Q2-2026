from __future__ import annotations

import logging
import subprocess
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.calendar import TradingCalendar, parse_time_of_day, scheduled_today
from app.config import load_settings


LOGGER = logging.getLogger("cdsl_fii_daily.scheduler")


def _run_once(mode: str) -> int:
    completed = subprocess.run([sys.executable, "scripts/run_once.py", "--mode", mode], check=False)
    LOGGER.info("CDSL FII %s run exited with code %s", mode, completed.returncode)
    return completed.returncode


def _next_evening(now: datetime, calendar: TradingCalendar, hour: int, minute: int) -> datetime:
    cursor = now.date()
    while True:
        if calendar.is_trading_day(cursor):
            candidate = now.replace(
                year=cursor.year,
                month=cursor.month,
                day=cursor.day,
                hour=hour,
                minute=minute,
                second=0,
                microsecond=0,
            )
            if candidate > now:
                return candidate
        cursor += timedelta(days=1)


def main() -> int:
    settings = load_settings()
    logging.basicConfig(
        level=settings.log_level,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    timezone = ZoneInfo(settings.timezone)
    calendar = TradingCalendar(settings.holiday_overrides)
    morning_hour, morning_minute = parse_time_of_day(settings.morning_time)
    evening_hour, evening_minute = parse_time_of_day(settings.evening_time)

    LOGGER.info(
        "CDSL FII scheduler started: morning=%s evening=%s run_on_start=%s tz=%s",
        settings.morning_time,
        settings.evening_time,
        settings.run_on_start,
        settings.timezone,
    )

    first_loop = True
    last_morning_run: datetime.date | None = None
    last_evening_run: datetime.date | None = None

    while True:
        now = datetime.now(timezone)
        morning_slot = scheduled_today(now, morning_hour, morning_minute)
        evening_slot = scheduled_today(now, evening_hour, evening_minute)

        if first_loop and not settings.run_on_start:
            if now >= morning_slot:
                last_morning_run = now.date()
            if calendar.is_trading_day(now.date()) and now >= evening_slot:
                last_evening_run = now.date()
        first_loop = False

        if now >= morning_slot and last_morning_run != now.date():
            _run_once("morning")
            last_morning_run = now.date()
            now = datetime.now(timezone)
            evening_slot = scheduled_today(now, evening_hour, evening_minute)

        if calendar.is_trading_day(now.date()) and now >= evening_slot and last_evening_run != now.date():
            _run_once("evening")
            last_evening_run = now.date()
            now = datetime.now(timezone)

        next_morning = scheduled_today(now, morning_hour, morning_minute)
        if next_morning <= now:
            next_morning += timedelta(days=1)
        next_evening = _next_evening(now, calendar, evening_hour, evening_minute)
        next_run = min(next_morning, next_evening)
        LOGGER.info("Next CDSL FII scheduled run at %s", next_run.isoformat())

        while True:
            now = datetime.now(timezone)
            remaining_seconds = (next_run - now).total_seconds()
            if remaining_seconds <= 0:
                break
            time.sleep(min(int(remaining_seconds), settings.sleep_cap_seconds))


if __name__ == "__main__":
    raise SystemExit(main())
