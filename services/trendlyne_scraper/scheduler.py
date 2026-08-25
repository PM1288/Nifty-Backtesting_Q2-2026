#!/usr/bin/env python3
"""PID 1 scheduler: run on startup and at 07:00 IST every weekday."""
from __future__ import annotations

import fcntl
import json
import os
import signal
import subprocess
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

from config import SETTINGS, STATE_DIR
from utils import LOGGER

STOP = False
CHILD: subprocess.Popen | None = None
LOCK_PATH = STATE_DIR / "scheduler.lock"


def _handle_signal(signum, _frame) -> None:
    global STOP
    STOP = True
    LOGGER.info("Scheduler received signal %s", signum)
    if CHILD and CHILD.poll() is None:
        CHILD.terminate()


def _write_state(**updates) -> None:
    current = {}
    if SETTINGS.scheduler_state_path.exists():
        try:
            current = json.loads(SETTINGS.scheduler_state_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            current = {}
    current.update(updates)
    temp = SETTINGS.scheduler_state_path.with_suffix(".tmp")
    temp.write_text(json.dumps(current, indent=2, default=str), encoding="utf-8")
    temp.replace(SETTINGS.scheduler_state_path)


def next_weekday_run(now: datetime) -> datetime:
    candidate = now.replace(
        hour=SETTINGS.schedule_hour,
        minute=SETTINGS.schedule_minute,
        second=0,
        microsecond=0,
    )
    if candidate <= now:
        candidate += timedelta(days=1)
    while candidate.weekday() >= 5:
        candidate += timedelta(days=1)
    return candidate


def run_child(trigger: str) -> int:
    global CHILD
    command = [sys.executable, "incremental.py", "--trigger", trigger]
    LOGGER.info("Starting %s incremental run", trigger)
    CHILD = subprocess.Popen(command)
    while CHILD.poll() is None and not STOP:
        _write_state(
            scheduler_pid=os.getpid(),
            heartbeat_at=datetime.now(tz=ZoneInfo(SETTINGS.schedule_timezone)).isoformat(),
            active_trigger=trigger,
            child_pid=CHILD.pid,
        )
        time.sleep(max(5, SETTINGS.scheduler_heartbeat_seconds))
    if STOP and CHILD.poll() is None:
        CHILD.terminate()
        try:
            CHILD.wait(timeout=20)
        except subprocess.TimeoutExpired:
            CHILD.kill()
    code = CHILD.wait()
    CHILD = None
    _write_state(
        scheduler_pid=os.getpid(),
        heartbeat_at=datetime.now(tz=ZoneInfo(SETTINGS.schedule_timezone)).isoformat(),
        active_trigger=None,
        last_child_exit_code=code,
    )
    LOGGER.info("%s incremental run exited with code %d", trigger, code)
    return code


def main() -> int:
    signal.signal(signal.SIGTERM, _handle_signal)
    signal.signal(signal.SIGINT, _handle_signal)
    timezone = ZoneInfo(SETTINGS.schedule_timezone)
    lock_file = LOCK_PATH.open("a+")
    try:
        fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        LOGGER.error("Another scheduler process holds %s", LOCK_PATH)
        return 1

    _write_state(
        scheduler_pid=os.getpid(),
        scheduler_started_at=datetime.now(timezone).isoformat(),
        heartbeat_at=datetime.now(timezone).isoformat(),
        timezone=SETTINGS.schedule_timezone,
        schedule=f"weekdays {SETTINGS.schedule_hour:02d}:{SETTINGS.schedule_minute:02d}",
    )
    if SETTINGS.run_on_startup:
        run_child("startup")

    while not STOP:
        now = datetime.now(timezone)
        next_run = next_weekday_run(now)
        _write_state(heartbeat_at=now.isoformat(), next_scheduled_at=next_run.isoformat())
        LOGGER.info("Next scheduled run: %s", next_run.isoformat())
        while not STOP:
            remaining = (next_run - datetime.now(timezone)).total_seconds()
            if remaining <= 0:
                break
            _write_state(heartbeat_at=datetime.now(timezone).isoformat(), next_scheduled_at=next_run.isoformat())
            time.sleep(min(max(5, SETTINGS.scheduler_heartbeat_seconds), remaining))
        if not STOP:
            run_child("schedule")
    return 0


if __name__ == "__main__":
    sys.exit(main())
