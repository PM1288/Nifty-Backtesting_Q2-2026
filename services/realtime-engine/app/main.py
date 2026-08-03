from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, WebSocket
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .provider import SnapshotProvider


class Broadcaster:
    def __init__(self, provider: SnapshotProvider, interval_sec: float) -> None:
        self.provider = provider
        self.interval_sec = interval_sec
        self.subscribers: set[WebSocket] = set()
        self.task: asyncio.Task | None = None

    def start(self) -> None:
        if self.task is None or self.task.done():
            self.task = asyncio.create_task(self._run())

    async def stop(self) -> None:
        if self.task and not self.task.done():
            self.task.cancel()
            try:
                await self.task
            except BaseException:
                pass
        self.task = None
        self.subscribers.clear()

    async def _run(self) -> None:
        while True:
            await asyncio.sleep(self.interval_sec)
            await self.publish()

    async def publish(self) -> None:
        snapshot = self.provider.load_snapshot()
        payload = {"type": "snapshot", "payload": snapshot.model_dump(mode="json")}
        dead: list[WebSocket] = []
        for ws in list(self.subscribers):
            try:
                await ws.send_json(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.subscribers.discard(ws)

    async def subscribe(self, ws: WebSocket) -> None:
        await ws.accept()
        self.subscribers.add(ws)
        snapshot = self.provider.load_snapshot()
        await ws.send_json({"type": "snapshot", "payload": snapshot.model_dump(mode="json")})
        try:
            while True:
                await ws.receive_text()
        except Exception:
            self.subscribers.discard(ws)


def create_app() -> FastAPI:
    settings = get_settings()
    provider = SnapshotProvider(settings=settings)
    broadcaster = Broadcaster(provider=provider, interval_sec=settings.snapshot_interval_sec)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        broadcaster.start()
        yield
        await broadcaster.stop()

    app = FastAPI(title="Realtime Engine", version="0.1.0", lifespan=lifespan)
    allow_origins = [origin.strip() for origin in settings.cors_allow_origins.split(",") if origin.strip()] or ["*"]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allow_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/api/health")
    def health() -> dict:
        try:
            snapshot = provider.load_snapshot()
            return {
                "ok": True,
                "trade_date": snapshot.ts.date().isoformat(),
                "as_of": snapshot.ts.isoformat(),
                "index_code": settings.default_index_code,
            }
        except Exception as exc:
            return {
                "ok": False,
                "detail": str(exc),
                "index_code": settings.default_index_code,
            }

    @app.get("/api/snapshot")
    def snapshot() -> dict:
        try:
            return provider.load_snapshot().model_dump(mode="json")
        except Exception as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc

    @app.get("/api/stock/{symbol}")
    def stock(symbol: str, minutes: int = 240) -> dict:
        try:
            return provider.load_stock_detail(symbol=symbol, minutes=minutes).model_dump(mode="json")
        except Exception as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @app.websocket("/ws/live")
    async def ws_live(ws: WebSocket) -> None:
        await broadcaster.subscribe(ws)

    return app


app = create_app()
