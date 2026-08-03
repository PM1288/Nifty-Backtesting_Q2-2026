from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache


def _env_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "y", "on"}


@dataclass(frozen=True)
class Settings:
    pg_dsn: str
    db_pool_min_size: int
    db_pool_max_size: int
    db_pool_timeout_seconds: int
    db_pool_max_idle_seconds: int
    timezone: str
    log_level: str
    api_host: str
    api_port: int
    export_root: str
    install_sql_on_start: bool
    data_stale_days_max: int
    export_retention_days: int
    ops_run_retention_days: int

    cron_ingest_recent: str
    cron_refresh_features: str
    cron_refresh_summaries: str
    cron_refresh_watchlists: str
    cron_refresh_exports: str
    cron_refresh_quality: str
    cron_retention: str
    cron_weekly_history: str

    job_cmd_ingest_recent: str
    job_cmd_refresh_features: str
    job_cmd_refresh_summaries: str
    job_cmd_refresh_watchlists: str
    job_cmd_refresh_exports: str
    job_cmd_refresh_quality: str
    job_cmd_retention: str
    job_cmd_weekly_history: str


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings(
        pg_dsn=os.getenv("PG_DSN", "postgresql://postgres:postgres@postgres:5432/postgres"),
        db_pool_min_size=int(os.getenv("NSE_EXPORT_DB_POOL_MIN_SIZE", "1")),
        db_pool_max_size=int(os.getenv("NSE_EXPORT_DB_POOL_MAX_SIZE", "4")),
        db_pool_timeout_seconds=int(os.getenv("NSE_EXPORT_DB_POOL_TIMEOUT_SECONDS", "10")),
        db_pool_max_idle_seconds=int(os.getenv("NSE_EXPORT_DB_POOL_MAX_IDLE_SECONDS", "30")),
        timezone=os.getenv("TIMEZONE", "Asia/Kolkata"),
        log_level=os.getenv("LOG_LEVEL", "INFO"),
        api_host=os.getenv("API_HOST", "0.0.0.0"),
        api_port=int(os.getenv("API_PORT", "8091")),
        export_root=os.getenv("EXPORT_ROOT", "/var/lib/nse/exports"),
        install_sql_on_start=_env_bool("INSTALL_SQL_ON_START", False),
        data_stale_days_max=int(os.getenv("DATA_STALE_DAYS_MAX", "7")),
        export_retention_days=int(os.getenv("EXPORT_RETENTION_DAYS", "30")),
        ops_run_retention_days=int(os.getenv("OPS_RUN_RETENTION_DAYS", "180")),
        cron_ingest_recent=os.getenv("CRON_INGEST_RECENT", "15 20 * * 1-5"),
        cron_refresh_features=os.getenv("CRON_REFRESH_FEATURES", "30 20 * * 1-5"),
        cron_refresh_summaries=os.getenv("CRON_REFRESH_SUMMARIES", "40 20 * * 1-5"),
        cron_refresh_watchlists=os.getenv("CRON_REFRESH_WATCHLISTS", "47 20 * * 1-5"),
        cron_refresh_exports=os.getenv("CRON_REFRESH_EXPORTS", "55 20 * * 1-5"),
        cron_refresh_quality=os.getenv("CRON_REFRESH_QUALITY", "5 21 * * 1-5"),
        cron_retention=os.getenv("CRON_RETENTION", "20 2 * * *"),
        cron_weekly_history=os.getenv("CRON_WEEKLY_HISTORY", "45 3 * * 6"),
        job_cmd_ingest_recent=os.getenv("JOB_CMD_INGEST_RECENT", ""),
        job_cmd_refresh_features=os.getenv("JOB_CMD_REFRESH_FEATURES", ""),
        job_cmd_refresh_summaries=os.getenv("JOB_CMD_REFRESH_SUMMARIES", "python -m nse_orchestration_exports.manual_jobs refresh-summaries"),
        job_cmd_refresh_watchlists=os.getenv("JOB_CMD_REFRESH_WATCHLISTS", "python -m nse_orchestration_exports.manual_jobs refresh-watchlists"),
        job_cmd_refresh_exports=os.getenv("JOB_CMD_REFRESH_EXPORTS", "python -m nse_orchestration_exports.manual_jobs refresh-exports"),
        job_cmd_refresh_quality=os.getenv("JOB_CMD_REFRESH_QUALITY", "python -m nse_orchestration_exports.manual_jobs run-quality-checks"),
        job_cmd_retention=os.getenv("JOB_CMD_RETENTION", "python -m nse_orchestration_exports.manual_jobs retention"),
        job_cmd_weekly_history=os.getenv("JOB_CMD_WEEKLY_HISTORY", ""),
    )
