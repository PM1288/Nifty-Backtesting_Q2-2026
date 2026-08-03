from __future__ import annotations

from pathlib import Path
from typing import Any, Dict

import yaml
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration read from env and optional `.env`."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    DATABASE_URL: str = Field("postgresql+psycopg://postgres:postgres@postgres:5432/postgres", description="SQLAlchemy URL using psycopg driver")
    DB_POOL_SIZE: int = Field(4, description="Steady-state SQLAlchemy pool size for API and scheduler workloads")
    DB_POOL_MAX_OVERFLOW: int = Field(2, description="Temporary extra connections above DB_POOL_SIZE during bursts")
    DB_POOL_TIMEOUT_SECONDS: int = Field(10, description="Seconds to wait for a pooled connection before failing")
    DB_POOL_RECYCLE_SECONDS: int = Field(1800, description="Recycle pooled connections before server-side idle expiry")
    RETENTION_DAYS: int = Field(185, description="Rolling retention for reco/anomaly/log/export data")

    # Scheduler
    SCHEDULER_ENABLED: bool = Field(True)
    CRON_REFRESH_BASELINES: str = Field("10 8 * * 1-5")
    CRON_REFRESH_ANOMALIES: str = Field("*/2 9-15 * * 1-5")
    CRON_REFRESH_RECOMMENDATIONS: str = Field("*/2 9-15 * * 1-5")
    CRON_REFRESH_SCORECARDS: str = Field("40 16 * * 1-5")
    CRON_REFRESH_QUALITY: str = Field("45 16 * * 1-5")

    DEFAULT_INDEX_CODE: str = Field("NIFTY 50")
    DEFAULT_HORIZON: str = Field("30m")
    RECO_CONFIG_PATH: str = Field("config/reco_thresholds.yml")

    EXPORT_DIR: str = Field("/app/exports")
    MAX_EXPORT_ROWS: int = Field(2000)

    LOG_LEVEL: str = Field("INFO")

    def load_thresholds(self) -> Dict[str, Any]:
        path = Path(self.RECO_CONFIG_PATH)
        if not path.exists():
            raise FileNotFoundError(f"Missing thresholds config: {path}")
        with path.open("r", encoding="utf-8") as f:
            data = yaml.safe_load(f)
        if not isinstance(data, dict):
            raise ValueError("Thresholds config must be a YAML mapping")
        return data


settings = Settings()
