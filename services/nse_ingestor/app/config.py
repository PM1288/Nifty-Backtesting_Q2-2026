from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml


@dataclass
class Settings:
    database_url: str
    staging_dir: Path
    log_dir: Path
    keep_downloads: bool
    retention_days: int
    log_retention_days: int
    staging_retention_days: int
    request_timeout_seconds: int
    nse_http_user_agent: str
    report_catalog_path: Path


def _as_bool(value: str | None, default: bool = False) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "y", "on"}


def get_settings() -> Settings:
    database_url = os.environ["DATABASE_URL"]
    staging_dir = Path(os.getenv("STAGING_DIR", "/var/lib/nse/staging"))
    log_dir = Path(os.getenv("LOG_DIR", "/var/log/nse"))
    staging_dir.mkdir(parents=True, exist_ok=True)
    if _as_bool(os.getenv("FILE_LOG_ENABLED"), True):
        log_dir.mkdir(parents=True, exist_ok=True)
    return Settings(
        database_url=database_url,
        staging_dir=staging_dir,
        log_dir=log_dir,
        keep_downloads=_as_bool(os.getenv("KEEP_DOWNLOADS"), False),
        retention_days=int(os.getenv("RETENTION_DAYS", "190")),
        log_retention_days=int(os.getenv("LOG_RETENTION_DAYS", "365")),
        staging_retention_days=int(os.getenv("STAGING_RETENTION_DAYS", "3")),
        request_timeout_seconds=int(os.getenv("REQUEST_TIMEOUT_SECONDS", "45")),
        nse_http_user_agent=os.getenv(
            "NSE_HTTP_USER_AGENT",
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome Safari",
        ),
        report_catalog_path=Path(os.getenv("REPORT_CATALOG_PATH", "/app/config/report_catalog.yml")),
    )


def load_report_catalog(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as f:
        return yaml.safe_load(f) or {}
