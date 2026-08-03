from __future__ import annotations

from dataclasses import dataclass, replace
from pathlib import Path
import os


def _env_flag(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None or not raw.strip():
        return default
    value = int(raw)
    if value <= 0:
        raise ValueError(f"{name} must be > 0")
    return value


def _env_path(name: str, default: str) -> Path:
    raw = os.getenv(name, default).strip()
    path = Path(raw)
    if not path.is_absolute():
        path = Path.cwd() / path
    return path.resolve()


def _env_text(name: str, default: str) -> str:
    raw = os.getenv(name)
    if raw is None:
        return default
    value = raw.strip()
    return value or default


@dataclass(frozen=True)
class Settings:
    output_dir: Path
    request_timeout_seconds: int
    enable_reports_api_fallback: bool
    auto_pull_enabled: bool
    auto_pull_interval_minutes: int
    auto_pull_max_lookback_days: int
    auto_pull_save_parsed: bool
    log_level: str
    postgres_host: str
    postgres_port: int
    postgres_db: str
    postgres_user: str
    postgres_password: str
    postgres_schema: str
    postgres_audit_schema: str
    truncate_tables_on_load: bool

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            output_dir=_env_path("OUTPUT_DIR", "data"),
            request_timeout_seconds=_env_int("REQUEST_TIMEOUT_SECONDS", 30),
            enable_reports_api_fallback=_env_flag("ENABLE_REPORTS_API_FALLBACK", True),
            auto_pull_enabled=_env_flag("AUTO_PULL_ENABLED", False),
            auto_pull_interval_minutes=_env_int("AUTO_PULL_INTERVAL_MINUTES", 60),
            auto_pull_max_lookback_days=_env_int("AUTO_PULL_MAX_LOOKBACK_DAYS", 10),
            auto_pull_save_parsed=_env_flag("AUTO_PULL_SAVE_PARSED", True),
            log_level=os.getenv("LOG_LEVEL", "INFO").strip().upper() or "INFO",
            postgres_host=_env_text("POSTGRES_HOST", "postgres"),
            postgres_port=_env_int("POSTGRES_PORT", 5432),
            postgres_db=_env_text("POSTGRES_DB", "marketdata"),
            postgres_user=_env_text("POSTGRES_USER", "trader"),
            postgres_password=_env_text("POSTGRES_PASSWORD", ""),
            postgres_schema=_env_text("POSTGRES_SCHEMA", "market_data"),
            postgres_audit_schema=_env_text("POSTGRES_AUDIT_SCHEMA", "audit"),
            truncate_tables_on_load=_env_flag("TRUNCATE_TABLES_ON_LOAD", False),
        )

    def with_overrides(self, **overrides: object) -> "Settings":
        return replace(self, **overrides)

    @property
    def latest_daily_root(self) -> Path:
        return self.output_dir / "latest_daily"

    @property
    def history_backfill_root(self) -> Path:
        return self.output_dir / "history_backfill"

    @property
    def latest_run_metadata_path(self) -> Path:
        return self.output_dir / "latest_run.json"

    @property
    def latest_daily_metadata_path(self) -> Path:
        return self.latest_daily_root / "latest_run.json"

    @property
    def latest_backfill_metadata_path(self) -> Path:
        return self.history_backfill_root / "latest_backfill.json"

    @property
    def postgres_dsn(self) -> str:
        return (
            f"host={self.postgres_host} "
            f"port={self.postgres_port} "
            f"dbname={self.postgres_db} "
            f"user={self.postgres_user} "
            f"password={self.postgres_password}"
        )
