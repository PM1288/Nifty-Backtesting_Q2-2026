from __future__ import annotations

import asyncio
import logging

from .config import Settings
from .orchestrator import run_latest_pull


LOGGER = logging.getLogger(__name__)


class AutoPullScheduler:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._task: asyncio.Task[None] | None = None
        self._stop = asyncio.Event()

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
        interval_seconds = self.settings.auto_pull_interval_minutes * 60
        while not self._stop.is_set():
            try:
                await asyncio.to_thread(
                    run_latest_pull,
                    self.settings,
                    max_lookback_days=self.settings.auto_pull_max_lookback_days,
                    save_parsed=self.settings.auto_pull_save_parsed,
                )
            except Exception:
                LOGGER.exception("Scheduled NSE FII latest pull failed")

            try:
                await asyncio.wait_for(self._stop.wait(), timeout=interval_seconds)
            except asyncio.TimeoutError:
                continue
