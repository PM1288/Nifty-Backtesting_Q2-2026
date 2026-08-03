from __future__ import annotations

from pathlib import Path
from typing import Any, Literal

import yaml
from pydantic import BaseModel, ConfigDict, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class PathsConfig(BaseModel):
    raw_root: Path
    staging_root: Path
    curated_root: Path
    logs_root: Path
    run_reports_root: Path
    completion_marker: Path


class DatabaseConfig(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    url: str
    schema_name: str = Field(default="institutional_flow", alias="schema")


class NetworkConfig(BaseModel):
    user_agent: str
    timeout_seconds: int = 30
    max_retries: int = 4
    polite_pause_seconds: float = 1.0


class RuntimeConfig(BaseModel):
    default_lookback_years: int = 5
    daily_target_time: str = "08:10"
    late_arrival_window: int = 3
    browser_fallback_enabled: bool = False
    retain_raw_files: bool = False
    retain_curated_files: bool = False


class RuntimeSettings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="MIF_", extra="ignore")

    root_dir: Path = Path(".")
    config_path: Path = Path("configs/runtime.yaml")
    dataset_catalog_path: Path = Path("configs/datasets.yaml")
    log_level: str = "INFO"
    http_timeout_seconds: int = 30
    http_max_retries: int = 4
    polite_pause_seconds: float = 1.0
    timezone: str = "Asia/Kolkata"
    user_agent: str | None = None
    late_arrival_window: int = 3
    database_url: str | None = None
    database_schema: str | None = None
    retain_raw_files: bool = False
    retain_curated_files: bool = False


class Settings(BaseModel):
    root_dir: Path
    timezone: str
    log_level: str
    database: DatabaseConfig
    paths: PathsConfig
    network: NetworkConfig
    runtime: RuntimeConfig
    holiday_overrides: list[str] = Field(default_factory=list)

    def resolve(self, path: Path) -> Path:
        if path.is_absolute():
            return path
        return (self.root_dir / path).resolve()


class DatasetSpec(BaseModel):
    dataset_name: str
    source_system: Literal["NSE", "BSE", "NSDL"]
    frequency: Literal["daily", "periodic"]
    tier: int
    enabled: bool = True
    adapter: str
    normalizer: str
    official_anchor: str
    notes: str = ""
    exchange_scope: str | None = None
    deal_kind: str | None = None
    archive_key: str | None = None
    report_type: str | None = None
    url_candidates: list[str] = Field(default_factory=list)
    period_kind: Literal["monthly", "yearly", "fortnightly"] | None = None
    backfill_partitioned: bool = False


def _read_yaml(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        return yaml.safe_load(handle) or {}


def load_settings(root_dir: Path | None = None) -> Settings:
    runtime = RuntimeSettings()
    resolved_root = (root_dir or runtime.root_dir).resolve()
    config_path = runtime.config_path
    if not config_path.is_absolute():
        config_path = (resolved_root / config_path).resolve()
    payload = _read_yaml(config_path)
    payload["root_dir"] = resolved_root
    payload["log_level"] = runtime.log_level
    payload.setdefault("network", {})
    payload["network"]["timeout_seconds"] = runtime.http_timeout_seconds
    payload["network"]["max_retries"] = runtime.http_max_retries
    payload["network"]["polite_pause_seconds"] = runtime.polite_pause_seconds
    if runtime.user_agent:
        payload["network"]["user_agent"] = runtime.user_agent
    payload.setdefault("runtime", {})
    payload["runtime"]["late_arrival_window"] = runtime.late_arrival_window
    payload["runtime"]["retain_raw_files"] = runtime.retain_raw_files
    payload["runtime"]["retain_curated_files"] = runtime.retain_curated_files
    payload.setdefault("database", {})
    if runtime.database_url:
        payload["database"]["url"] = runtime.database_url
    if runtime.database_schema:
        payload["database"]["schema"] = runtime.database_schema
    settings = Settings.model_validate(payload)
    settings.paths.raw_root = settings.resolve(settings.paths.raw_root)
    settings.paths.staging_root = settings.resolve(settings.paths.staging_root)
    settings.paths.curated_root = settings.resolve(settings.paths.curated_root)
    settings.paths.logs_root = settings.resolve(settings.paths.logs_root)
    settings.paths.run_reports_root = settings.resolve(settings.paths.run_reports_root)
    settings.paths.completion_marker = settings.resolve(settings.paths.completion_marker)
    return settings


def load_dataset_catalog(settings: Settings) -> dict[str, DatasetSpec]:
    runtime = RuntimeSettings()
    catalog_path = runtime.dataset_catalog_path
    if not catalog_path.is_absolute():
        catalog_path = (settings.root_dir / catalog_path).resolve()
    payload = _read_yaml(catalog_path)
    datasets = payload.get("datasets", [])
    return {item["dataset_name"]: DatasetSpec.model_validate(item) for item in datasets}
