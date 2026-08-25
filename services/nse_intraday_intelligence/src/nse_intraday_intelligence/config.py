from __future__ import annotations

import os
import json
from datetime import time
from dataclasses import dataclass
from functools import lru_cache


def _env_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "y", "on"}


def _env_json_dict(name: str) -> dict[str, str]:
    raw = os.getenv(name)
    if not raw:
        return {}
    try:
        value = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Invalid JSON object in {name}") from exc
    if not isinstance(value, dict):
        raise ValueError(f"{name} must decode to a JSON object")
    return {str(key): str(val) for key, val in value.items()}


def _env_time(name: str, default: str) -> time:
    raw = (os.getenv(name) or default).strip()
    try:
        hour_text, minute_text = raw.split(":", 1)
        return time(hour=int(hour_text), minute=int(minute_text))
    except Exception as exc:
        raise ValueError(f"{name} must be in HH:MM format") from exc


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
    install_sql_on_start: bool
    default_index_code: str
    export_root: str

    raw_retention_days: int
    minute_retention_days: int
    feature_retention_days: int
    snapshot_retention_days: int
    ops_run_retention_days: int

    cron_sync_raw: str
    cron_refresh_features: str
    cron_refresh_dashboard: str
    cron_refresh_watchlists: str
    cron_run_quality: str
    cron_finalize_session: str
    cron_retention: str
    cron_backfill_history: str

    live_source_max_delay_seconds: int
    raw_sync_max_lag_minutes: int
    snapshot_max_lag_minutes: int
    market_open_live_stock_min_rows: int
    market_alert_start_time: time
    market_alert_end_time: time

    alerts_enable_webhook: bool
    alerts_webhook_url: str
    alerts_webhook_timeout_seconds: int
    alerts_webhook_headers: dict[str, str]
    alerts_cooldown_minutes: int
    alerts_send_recovery: bool

    job_cmd_sync_raw: str
    job_cmd_refresh_features: str
    job_cmd_refresh_dashboard: str
    job_cmd_refresh_watchlists: str
    job_cmd_run_quality: str
    job_cmd_finalize_session: str
    job_cmd_retention: str
    job_cmd_backfill_history: str


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings(
        pg_dsn=os.getenv("PG_DSN", "postgresql://postgres:postgres@postgres:5432/postgres"),
        db_pool_min_size=int(os.getenv("NSE_INTRADAY_DB_POOL_MIN_SIZE", "1")),
        db_pool_max_size=int(os.getenv("NSE_INTRADAY_DB_POOL_MAX_SIZE", "4")),
        db_pool_timeout_seconds=int(os.getenv("NSE_INTRADAY_DB_POOL_TIMEOUT_SECONDS", "10")),
        db_pool_max_idle_seconds=int(os.getenv("NSE_INTRADAY_DB_POOL_MAX_IDLE_SECONDS", "30")),
        timezone=os.getenv("TIMEZONE", "Asia/Kolkata"),
        log_level=os.getenv("LOG_LEVEL", "INFO"),
        api_host=os.getenv("API_HOST", "0.0.0.0"),
        api_port=int(os.getenv("API_PORT", "8092")),
        install_sql_on_start=_env_bool("INSTALL_SQL_ON_START", False),
        default_index_code=os.getenv("DEFAULT_INDEX_CODE", "NIFTY 50"),
        export_root=os.getenv("EXPORT_ROOT", "/var/lib/nse/intraday_exports"),
        raw_retention_days=int(os.getenv("RAW_RETENTION_DAYS", "180")),
        minute_retention_days=int(os.getenv("MINUTE_RETENTION_DAYS", os.getenv("RAW_RETENTION_DAYS", "180"))),
        feature_retention_days=int(os.getenv("FEATURE_RETENTION_DAYS", "730")),
        snapshot_retention_days=int(os.getenv("SNAPSHOT_RETENTION_DAYS", "45")),
        ops_run_retention_days=int(os.getenv("OPS_RUN_RETENTION_DAYS", "365")),
        cron_sync_raw=os.getenv("CRON_SYNC_RAW", "*/1 9-15 * * mon-fri"),
        cron_refresh_features=os.getenv("CRON_REFRESH_FEATURES", "*/1 9-15 * * mon-fri"),
        cron_refresh_dashboard=os.getenv("CRON_REFRESH_DASHBOARD", "*/1 9-15 * * mon-fri"),
        cron_refresh_watchlists=os.getenv("CRON_REFRESH_WATCHLISTS", "*/2 9-15 * * mon-fri"),
        cron_run_quality=os.getenv("CRON_RUN_QUALITY", "*/5 9-15 * * mon-fri"),
        cron_finalize_session=os.getenv("CRON_FINALIZE_SESSION", "40 15 * * mon-fri"),
        cron_retention=os.getenv("CRON_RETENTION", "25 2 * * *"),
        cron_backfill_history=os.getenv("CRON_BACKFILL_HISTORY", "20 3 * * 6"),
        live_source_max_delay_seconds=int(os.getenv("NSE_INTRADAY_LIVE_SOURCE_MAX_DELAY_SECONDS", "120")),
        raw_sync_max_lag_minutes=int(os.getenv("NSE_INTRADAY_RAW_SYNC_MAX_LAG_MINUTES", "3")),
        snapshot_max_lag_minutes=int(os.getenv("NSE_INTRADAY_SNAPSHOT_MAX_LAG_MINUTES", "5")),
        market_open_live_stock_min_rows=int(os.getenv("NSE_INTRADAY_MARKET_OPEN_LIVE_STOCK_MIN_ROWS", "80")),
        market_alert_start_time=_env_time("NSE_INTRADAY_MARKET_ALERT_START_TIME", "09:30"),
        market_alert_end_time=_env_time("NSE_INTRADAY_MARKET_ALERT_END_TIME", "15:30"),
        alerts_enable_webhook=_env_bool("NSE_INTRADAY_ALERTS_ENABLE_WEBHOOK", False),
        alerts_webhook_url=os.getenv("NSE_INTRADAY_ALERTS_WEBHOOK_URL", "").strip(),
        alerts_webhook_timeout_seconds=int(os.getenv("NSE_INTRADAY_ALERTS_WEBHOOK_TIMEOUT_SECONDS", "5")),
        alerts_webhook_headers=_env_json_dict("NSE_INTRADAY_ALERTS_WEBHOOK_HEADERS"),
        alerts_cooldown_minutes=int(os.getenv("NSE_INTRADAY_ALERTS_COOLDOWN_MINUTES", "15")),
        alerts_send_recovery=_env_bool("NSE_INTRADAY_ALERTS_SEND_RECOVERY", True),
        job_cmd_sync_raw=os.getenv("JOB_CMD_SYNC_RAW", "python -m nse_intraday_intelligence.manual_jobs sync-raw"),
        job_cmd_refresh_features=os.getenv("JOB_CMD_REFRESH_FEATURES", "python -m nse_intraday_intelligence.manual_jobs refresh-features"),
        job_cmd_refresh_dashboard=os.getenv("JOB_CMD_REFRESH_DASHBOARD", "python -m nse_intraday_intelligence.manual_jobs refresh-dashboard"),
        job_cmd_refresh_watchlists=os.getenv("JOB_CMD_REFRESH_WATCHLISTS", "python -m nse_intraday_intelligence.manual_jobs refresh-watchlists"),
        job_cmd_run_quality=os.getenv("JOB_CMD_RUN_QUALITY", "python -m nse_intraday_intelligence.manual_jobs run-quality-checks"),
        job_cmd_finalize_session=os.getenv("JOB_CMD_FINALIZE_SESSION", "python -m nse_intraday_intelligence.manual_jobs finalize-session"),
        job_cmd_retention=os.getenv("JOB_CMD_RETENTION", "python -m nse_intraday_intelligence.manual_jobs retention"),
        job_cmd_backfill_history=os.getenv("JOB_CMD_BACKFILL_HISTORY", "python -m nse_intraday_intelligence.manual_jobs backfill-history --days 90"),
    )
