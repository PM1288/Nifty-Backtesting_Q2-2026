from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from .config import Settings
from .orchestrator import load_run, run_latest_pull


LOGGER = logging.getLogger(__name__)
IST = ZoneInfo("Asia/Kolkata")
LOCK_NAME = "nse-fii-morning-refresh-v1"


def parse_time_of_day(value: str) -> tuple[int, int]:
    try:
        hour_text, minute_text = value.strip().split(":", 1)
        hour, minute = int(hour_text), int(minute_text)
        if 0 <= hour <= 23 and 0 <= minute <= 59:
            return hour, minute
    except (TypeError, ValueError):
        pass
    raise ValueError("AUTO_PULL_TIME must use HH:MM in Asia/Kolkata")


def scheduled_today(now: datetime, hour: int, minute: int) -> datetime:
    return now.replace(hour=hour, minute=minute, second=0, microsecond=0)


def next_scheduled_run(now: datetime, hour: int, minute: int) -> datetime:
    candidate = scheduled_today(now, hour, minute)
    return candidate if candidate > now else candidate + timedelta(days=1)


def _trade_date_to_run_id(value: str) -> str:
    return datetime.strptime(value, "%d-%m-%Y").date().isoformat()


class AutoPullScheduler:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._task: asyncio.Task[None] | None = None
        self._stop = asyncio.Event()
        self.last_attempt_at: str | None = None
        self.last_success_at: str | None = None
        self.last_trade_date: str | None = None
        self.last_error: str | None = None
        self.next_run_at: str | None = None

    @property
    def running(self) -> bool:
        return self._task is not None and not self._task.done()

    async def start(self) -> None:
        if self.running:
            return
        self._stop.clear()
        self._task = asyncio.create_task(self._loop(), name="nse-fii-auto-pull")

    async def stop(self) -> None:
        self._stop.set()
        if self._task is not None:
            await self._task
            self._task = None

    async def _loop(self) -> None:
        hour, minute = parse_time_of_day(self.settings.auto_pull_time)
        retry_seconds = self.settings.auto_pull_interval_minutes * 60
        first_loop = True
        retry_pending = False
        while not self._stop.is_set():
            now = datetime.now(IST)
            should_run = retry_pending or (
                first_loop
                and self.settings.auto_pull_run_on_start
                and now >= scheduled_today(now, hour, minute)
            )
            first_loop = False
            if should_run:
                success = await asyncio.to_thread(self._refresh_once)
                if not success:
                    retry_pending = True
                    self.next_run_at = (datetime.now(IST) + timedelta(seconds=retry_seconds)).isoformat()
                    LOGGER.warning("Retrying NSE FII morning refresh at %s", self.next_run_at)
                    try:
                        await asyncio.wait_for(self._stop.wait(), timeout=retry_seconds)
                    except asyncio.TimeoutError:
                        pass
                    continue
                retry_pending = False

            next_run = next_scheduled_run(datetime.now(IST), hour, minute)
            self.next_run_at = next_run.isoformat()
            LOGGER.info("Next NSE FII morning refresh scheduled at %s", self.next_run_at)
            wait_seconds = max(1.0, (next_run - datetime.now(IST)).total_seconds())
            try:
                await asyncio.wait_for(self._stop.wait(), timeout=wait_seconds)
            except asyncio.TimeoutError:
                retry_pending = not await asyncio.to_thread(self._refresh_once)
                if retry_pending:
                    self.next_run_at = (datetime.now(IST) + timedelta(seconds=retry_seconds)).isoformat()
                    LOGGER.warning("Retrying NSE FII morning refresh at %s", self.next_run_at)
                    try:
                        await asyncio.wait_for(self._stop.wait(), timeout=retry_seconds)
                    except asyncio.TimeoutError:
                        pass

    def _refresh_once(self) -> bool:
        self.last_attempt_at = datetime.now(IST).isoformat()
        try:
            import psycopg2

            with psycopg2.connect(self.settings.postgres_dsn) as conn:
                with conn.cursor() as cur:
                    cur.execute("SELECT pg_try_advisory_lock(hashtext(%s))", (LOCK_NAME,))
                    locked = bool(cur.fetchone()[0])
                if not locked:
                    LOGGER.info("NSE FII morning refresh skipped because another worker holds the lock")
                    return True
                try:
                    payload = run_latest_pull(
                        self.settings,
                        max_lookback_days=self.settings.auto_pull_max_lookback_days,
                        save_parsed=self.settings.auto_pull_save_parsed,
                    )
                    trade_date = str(payload["trade_date"])
                    with conn.cursor() as cur:
                        cur.execute(
                            """SELECT max(trade_date)::text
                               FROM public.trading_calendar
                               WHERE is_trading_day AND market_close_ts < %s""",
                            (datetime.now(IST),),
                        )
                        expected_trade_date = cur.fetchone()[0]
                    run_id = _trade_date_to_run_id(trade_date)
                    if expected_trade_date and run_id < expected_trade_date:
                        raise RuntimeError(
                            f"latest NSE report is {run_id}; expected completed session {expected_trade_date}"
                        )
                    if self.settings.auto_load_enabled:
                        load_run(
                            self.settings,
                            kind="daily",
                            run_id=run_id,
                            truncate_tables_on_load=False,
                        )
                    self.last_trade_date = trade_date
                    self.last_success_at = datetime.now(IST).isoformat()
                    self.last_error = None
                    LOGGER.info("NSE FII morning refresh published report date %s", trade_date)
                    return True
                finally:
                    with conn.cursor() as cur:
                        cur.execute("SELECT pg_advisory_unlock(hashtext(%s))", (LOCK_NAME,))
        except Exception as exc:
            self.last_error = type(exc).__name__
            LOGGER.exception("Scheduled NSE FII pull/load failed")
            return False
