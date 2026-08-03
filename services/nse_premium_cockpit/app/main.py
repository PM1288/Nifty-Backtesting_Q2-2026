from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI, WebSocket
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles

from .data_source import build_stock_detail_from_mock, build_snapshot_from_mock, init_mock_state, step_mock_state
from .schemas import Snapshot, StockDetail
from .settings import get_settings
from .realtime import Broadcaster


def create_app() -> FastAPI:
    settings = get_settings()
    static_dir = Path(__file__).resolve().parent.parent / "static"
    broadcaster = Broadcaster(settings=settings)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        broadcaster.start()
        yield
        await broadcaster.stop()

    app = FastAPI(title="NSE Premium Cockpit", version="0.1.0", lifespan=lifespan)
    app.state.broadcaster = broadcaster
    app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")

    @app.get("/api/health")
    def health():
        return {"ok": True, "ts": datetime.now(timezone.utc).isoformat(), "mode": settings.data_mode}

    @app.get("/api/snapshot", response_model=Snapshot)
    def snapshot():
        st = init_mock_state()
        st = step_mock_state(st)
        return build_snapshot_from_mock(st)

    @app.get("/api/stock/{symbol}", response_model=StockDetail)
    def stock(symbol: str, minutes: int = 240):
        st = init_mock_state()
        return build_stock_detail_from_mock(st, symbol=symbol, minutes=minutes)

    @app.websocket("/ws/live")
    async def ws_live(ws: WebSocket):
        await broadcaster.subscribe(ws)

    @app.get("/", response_class=HTMLResponse)
    def index():
        html = (static_dir / "index.html").read_text(encoding="utf-8")
        if "<!--CONFIG-->" in html:
            if settings.public_ws_url or settings.public_api_base:
                cfg = []
                if settings.public_ws_url:
                    cfg.append(f'window.__WS_URL__ = "{settings.public_ws_url}";')
                if settings.public_api_base:
                    cfg.append(f'window.__API_BASE__ = "{settings.public_api_base}";')
                inject = "<script>" + "".join(cfg) + "</script>"
                html = html.replace("<!--CONFIG-->", inject)
            else:
                html = html.replace("<!--CONFIG-->", "")
        return HTMLResponse(html)

    return app


app = create_app()
