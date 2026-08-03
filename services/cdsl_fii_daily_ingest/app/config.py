from __future__ import annotations

import os
from dataclasses import dataclass


DEFAULT_HOLIDAY_OVERRIDES = {
    "2026-01-15",
    "2026-01-26",
    "2026-03-03",
    "2026-03-26",
    "2026-03-31",
    "2026-04-03",
    "2026-04-14",
    "2026-05-01",
    "2026-05-28",
    "2026-06-26",
    "2026-09-14",
    "2026-10-02",
    "2026-10-20",
    "2026-11-10",
    "2026-11-24",
    "2026-12-25",
}


def _csv_env(name: str) -> set[str]:
    raw = os.getenv(name, "")
    return {item.strip() for item in raw.split(",") if item.strip()}


@dataclass(frozen=True, slots=True)
class Settings:
    database_url: str
    schema_name: str
    url: str
    timeout_seconds: int
    user_agent: str
    log_level: str
    timezone: str
    morning_time: str
    evening_time: str
    run_on_start: bool
    sleep_cap_seconds: int
    holiday_overrides: set[str]


def load_settings() -> Settings:
    return Settings(
        database_url=os.getenv(
            "CDSL_FII_DATABASE_URL",
            os.getenv("DATABASE_URL", "postgresql://postgres:postgres@postgres:5432/postgres"),
        ),
        schema_name=os.getenv("CDSL_FII_POSTGRES_SCHEMA", "institutional_flow"),
        url=os.getenv("CDSL_FII_URL", "https://www.cdslindia.com/eservices/publications/fiidaily"),
        timeout_seconds=max(int(os.getenv("CDSL_FII_REQUEST_TIMEOUT_SECONDS", "30")), 5),
        user_agent=os.getenv("CDSL_FII_USER_AGENT", "Mozilla/5.0 (compatible; trading-stack-cdsl-fii/1.0)"),
        log_level=os.getenv("CDSL_FII_LOG_LEVEL", "INFO").upper(),
        timezone=os.getenv("CDSL_FII_TIMEZONE", "Asia/Kolkata"),
        morning_time=os.getenv("CDSL_FII_MORNING_TIME", "08:00"),
        evening_time=os.getenv("CDSL_FII_EVENING_TIME", "21:00"),
        run_on_start=os.getenv("CDSL_FII_RUN_ON_START", "1").strip().lower() in {"1", "true", "yes", "on"},
        sleep_cap_seconds=max(int(os.getenv("CDSL_FII_SLEEP_CAP_SECONDS", "300")), 5),
        holiday_overrides=_csv_env("CDSL_FII_HOLIDAY_OVERRIDES") or DEFAULT_HOLIDAY_OVERRIDES,
    )
