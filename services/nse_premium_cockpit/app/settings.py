from __future__ import annotations

from dataclasses import dataclass
import os


@dataclass(frozen=True)
class Settings:
    host: str = "0.0.0.0"
    port: int = 8000
    data_mode: str = "mock"
    database_url: str | None = None
    mock_emit_interval_sec: float = 1.0
    dashboard_history_minutes: int = 240

    # Optional UI overrides (useful behind reverse proxies / separate gateways)
    public_ws_url: str | None = None
    public_api_base: str | None = None


def get_settings() -> Settings:
    return Settings(
        host=os.getenv("HOST", "0.0.0.0"),
        port=int(os.getenv("PORT", "8000")),
        data_mode=os.getenv("DATA_MODE", "mock").strip().lower(),
        database_url=os.getenv("DATABASE_URL"),
        mock_emit_interval_sec=float(os.getenv("MOCK_EMIT_INTERVAL_SEC", "1.0")),
        dashboard_history_minutes=int(os.getenv("DASHBOARD_HISTORY_MINUTES", "240")),
        public_ws_url=os.getenv("PUBLIC_WS_URL"),
        public_api_base=os.getenv("PUBLIC_API_BASE"),
    )
