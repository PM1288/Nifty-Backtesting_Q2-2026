from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    database_url: str
    app_title: str
    log_level: str
    log_dir: Path
    rebuild_window_days: int
    feature_retention_days: int
    summary_retention_days: int
    log_retention_days: int
    dashboard_default_lookback_days: int
    quality_checks_path: Path
    analysis_sections_path: Path
    indicator_strategy_registry_path: Path
    snapshot_refresh_url: str | None
    snapshot_refresh_token: str | None
    snapshot_refresh_timeout_seconds: int


def get_settings() -> Settings:
    return Settings(
        database_url=os.environ["DATABASE_URL"],
        app_title=os.environ.get("APP_TITLE", "NSE Market Learning Dashboard"),
        log_level=os.environ.get("LOG_LEVEL", "INFO"),
        log_dir=Path(os.environ.get("LOG_DIR", "/app/runtime/logs")),
        rebuild_window_days=int(os.environ.get("REBUILD_WINDOW_DAYS", "120")),
        feature_retention_days=int(os.environ.get("FEATURE_RETENTION_DAYS", "1825")),
        summary_retention_days=int(os.environ.get("SUMMARY_RETENTION_DAYS", "3650")),
        log_retention_days=int(os.environ.get("LOG_RETENTION_DAYS", "365")),
        dashboard_default_lookback_days=int(os.environ.get("DASHBOARD_DEFAULT_LOOKBACK_DAYS", "120")),
        quality_checks_path=Path(os.environ.get("QUALITY_CHECKS_PATH", "/app/config/data_quality_checks.yml")),
        analysis_sections_path=Path(os.environ.get("ANALYSIS_SECTIONS_PATH", "/app/config/analysis_sections.yml")),
        indicator_strategy_registry_path=Path(
            os.environ.get("INDICATOR_STRATEGY_REGISTRY_PATH", "/app/config/indicator_strategy_registry.yml")
        ),
        snapshot_refresh_url=os.environ.get("SNAPSHOT_REFRESH_URL"),
        snapshot_refresh_token=os.environ.get("SNAPSHOT_REFRESH_TOKEN"),
        snapshot_refresh_timeout_seconds=int(os.environ.get("SNAPSHOT_REFRESH_TIMEOUT_SECONDS", "120")),
    )
