from __future__ import annotations

from dataclasses import dataclass
import os


@dataclass(frozen=True)
class Settings:
    host: str = "0.0.0.0"
    port: int = 9000
    database_url: str = "postgresql://postgres:postgres@postgres:5432/postgres"
    snapshot_interval_sec: float = 5.0
    default_index_code: str = "NIFTY 50"
    default_horizon: str = "30m"
    cors_allow_origins: str = "*"


def get_settings() -> Settings:
    return Settings(
        host=os.getenv("HOST", "0.0.0.0"),
        port=int(os.getenv("PORT", "9000")),
        database_url=os.getenv("DATABASE_URL", "postgresql://postgres:postgres@postgres:5432/postgres"),
        snapshot_interval_sec=float(os.getenv("SNAPSHOT_INTERVAL_SEC", "5.0")),
        default_index_code=os.getenv("DEFAULT_INDEX_CODE", "NIFTY 50"),
        default_horizon=os.getenv("DEFAULT_HORIZON", "30m"),
        cors_allow_origins=os.getenv("CORS_ALLOW_ORIGINS", "*"),
    )
