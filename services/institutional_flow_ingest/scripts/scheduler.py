from __future__ import annotations

import logging
import os
import subprocess
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo


LOGGER = logging.getLogger("institutional_flow.scheduler")
IST = ZoneInfo("Asia/Kolkata")
DEFAULT_TIME = "08:10"
DEFAULT_LATE_ARRIVAL_WINDOW = "5"
DEFAULT_SLEEP_CAP_SECONDS = 300


def _bool_env(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _int_env(name: str, default: int) -> int:
    value = os.getenv(name)
    if value is None:
        return default
    try:
        return max(int(value), 1)
    except ValueError:
        LOGGER.warning("Invalid integer for %s=%r, using %s", name, value, default)
        return default


def _parse_schedule_time(value: str) -> tuple[int, int]:
    try:
        hour_str, minute_str = value.strip().split(":", 1)
        hour = int(hour_str)
        minute = int(minute_str)
        if not (0 <= hour <= 23 and 0 <= minute <= 59):
            raise ValueError
        return hour, minute
    except ValueError:
        LOGGER.warning("Invalid MIF_SCHEDULER_TIME=%r, using %s", value, DEFAULT_TIME)
        return 8, 10


def _next_run_at(now: datetime, hour: int, minute: int) -> datetime:
    candidate = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
    if now >= candidate:
        candidate += timedelta(days=1)
    while candidate.weekday() >= 5:
        candidate += timedelta(days=1)
    return candidate


def _run_daily_once() -> int:
    script_path = Path(__file__).with_name("run_daily.py")
    late_arrival_window = os.getenv("MIF_SCHEDULER_LATE_ARRIVAL_WINDOW", DEFAULT_LATE_ARRIVAL_WINDOW)
    cmd = [sys.executable, str(script_path), "--late-arrival-window", late_arrival_window]
    LOGGER.info("Starting institutional-flow daily run: %s", " ".join(cmd))
    completed = subprocess.run(cmd, check=False)
    LOGGER.info("Institutional-flow daily run exited with code %s", completed.returncode)
    return completed.returncode


def main() -> int:
    logging.basicConfig(
        level=os.getenv("MIF_LOG_LEVEL", "INFO").upper(),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    if not _bool_env("MIF_SCHEDULER_ENABLED", True):
        LOGGER.info("Institutional-flow scheduler disabled via MIF_SCHEDULER_ENABLED")
        return 0

    run_on_start = _bool_env("MIF_SCHEDULER_RUN_ON_START", True)
    schedule_time = os.getenv("MIF_SCHEDULER_TIME", DEFAULT_TIME)
    hour, minute = _parse_schedule_time(schedule_time)
    sleep_cap_seconds = _int_env("MIF_SCHEDULER_SLEEP_CAP_SECONDS", DEFAULT_SLEEP_CAP_SECONDS)

    LOGGER.info(
        "Institutional-flow scheduler started: run_on_start=%s schedule_time=%02d:%02d tz=%s",
        run_on_start,
        hour,
        minute,
        IST,
    )

    first_loop = True
    while True:
        now = datetime.now(IST)
        if first_loop and run_on_start:
            _run_daily_once()
            now = datetime.now(IST)
        first_loop = False

        next_run = _next_run_at(now, hour, minute)
        LOGGER.info("Next institutional-flow daily run scheduled at %s", next_run.isoformat())
        while True:
            now = datetime.now(IST)
            remaining_seconds = (next_run - now).total_seconds()
            if remaining_seconds <= 0:
                break
            time.sleep(min(int(remaining_seconds), sleep_cap_seconds))

        _run_daily_once()


if __name__ == "__main__":
    raise SystemExit(main())
