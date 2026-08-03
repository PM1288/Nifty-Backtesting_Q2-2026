from __future__ import annotations

import asyncio
from dataclasses import dataclass

from fastapi import WebSocket

from .data_source import build_snapshot_from_mock, init_mock_state, step_mock_state
from .schemas import Snapshot
from .settings import Settings


@dataclass
class Broadcaster:
    settings: Settings
    _subscribers: set[WebSocket] = None  # type: ignore[assignment]
    _task: asyncio.Task | None = None

    def __post_init__(self) -> None:
        self._subscribers = set()

    def start(self) -> None:
        if self._task is None or self._task.done():
            self._task = asyncio.create_task(self._run())

    async def stop(self) -> None:
        if self._task and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except BaseException:
                pass
        self._task = None
        self._subscribers.clear()

    async def _run(self) -> None:
        st = init_mock_state()
        while True:
            await asyncio.sleep(self.settings.mock_emit_interval_sec)
            st = step_mock_state(st)
            snap = build_snapshot_from_mock(st)
            await self.publish_snapshot(snap)

    async def publish_snapshot(self, snapshot: Snapshot) -> None:
        msg = snapshot.model_dump(mode="json")
        dead: list[WebSocket] = []
        for ws in list(self._subscribers):
            try:
                await ws.send_json({"type": "snapshot", "payload": msg})
            except Exception:
                dead.append(ws)
        for ws in dead:
            self._subscribers.discard(ws)

    async def subscribe(self, ws: WebSocket) -> None:
        await ws.accept()
        self._subscribers.add(ws)

        # immediate snapshot
        st = init_mock_state()
        st = step_mock_state(st)
        snap = build_snapshot_from_mock(st)
        await ws.send_json({"type": "snapshot", "payload": snap.model_dump(mode="json")})

        try:
            while True:
                await ws.receive_text()
        except Exception:
            self._subscribers.discard(ws)
