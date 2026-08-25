"""
config.py
=========
Central configuration for the Trendlyne research-reports scraper.

Everything here is deliberately conservative:
- Only the *public*, unauthenticated listing pages are targeted.
- Concurrency and request rate are capped to be polite to the source site.
- Nothing here attempts to authenticate, bypass a login wall, or work
  around Trendlyne's stated subscriber download quotas (70/day, 300/month).
  This scraper only ever touches the public listing HTML, never the
  gated PDF/report endpoints that require a logged-in session.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass


PROJECT_ROOT = Path(__file__).resolve().parent
LOG_DIR = PROJECT_ROOT / "logs"
DATA_DIR = PROJECT_ROOT / "data"
CHECKPOINT_DIR = PROJECT_ROOT / "checkpoints"
STATE_DIR = PROJECT_ROOT / "state"

for _d in (LOG_DIR, DATA_DIR, CHECKPOINT_DIR, STATE_DIR):
    _d.mkdir(parents=True, exist_ok=True)


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, default))
    except (TypeError, ValueError):
        return default


def _env_float(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, default))
    except (TypeError, ValueError):
        return default


def _env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def compute_cutoff_date(years_back: int) -> datetime:
    """Cutoff = `years_back` years before today, UTC (Feb 29 edge handled)."""
    now = datetime.now(timezone.utc)
    try:
        return now.replace(year=now.year - years_back)
    except ValueError:
        return now.replace(month=2, day=28, year=now.year - years_back)


@dataclass(frozen=True)
class Settings:
    # ---- Target -------------------------------------------------------
    base_url: str = "https://trendlyne.com"
    listing_path: str = "/research-reports/all/"

    # ---- Date window ----------------------------------------------------
    years_back: int = _env_int("YEARS_BACK", 5)

    @property
    def cutoff_date(self) -> datetime:
        return compute_cutoff_date(self.years_back)

    # ---- Politeness / rate limiting -----------------------------------
    # Requests are sequential-ish with a small worker pool. This is a
    # crawl-delay style throttle for the *public listing pages only* -
    # it is not, and should not be turned into, a tool for maximizing
    # throughput against a rate-limited paid resource.
    max_workers: int = _env_int("MAX_WORKERS", 2)
    min_request_interval_sec: float = _env_float("MIN_REQUEST_INTERVAL_SEC", 1.5)
    request_timeout_sec: int = _env_int("REQUEST_TIMEOUT_SEC", 20)

    # ---- Retry / backoff -------------------------------------------------
    max_retries: int = _env_int("MAX_RETRIES", 5)
    backoff_base_sec: float = _env_float("BACKOFF_BASE_SEC", 2.0)
    backoff_max_sec: float = _env_float("BACKOFF_MAX_SEC", 60.0)

    # ---- Safety valve ---------------------------------------------------
    # Hard ceiling on pages crawled in a single run, regardless of date
    # window, so a parsing bug can never turn into an unbounded crawl.
    max_pages_per_run: int = _env_int("MAX_PAGES_PER_RUN", 5000)

    # ---- NIFTY 100 filtering ---------------------------------------------
    # When enabled (the default), only reports whose stock is currently a
    # NIFTY 100 (NIFTY 50 + NIFTY Next 50) constituent are kept; everything
    # else is parsed (for pagination/date-cutoff purposes) but dropped
    # before it's stored/exported. See nifty100.py for how the constituent
    # list itself is resolved (live NSE fetch, cached, or --symbols-file).
    nifty100_only: bool = os.getenv("NIFTY100_ONLY", "true").lower() == "true"
    nifty100_cache_max_age_days: int = _env_int("NIFTY100_CACHE_MAX_AGE_DAYS", 7)

    # ---- Optional enrichment ---------------------------------------------
    # Best-effort fetch of each unique stock's public overview page to try
    # to fill in sector/industry/company name/market cap. These fields do
    # not appear on the listing page at all. This is opt-in, off by
    # default, and any field it can't find stays null rather than guessed.
    enrich_stock_pages: bool = os.getenv("ENRICH_STOCK_PAGES", "false").lower() == "true"

    # ---- PostgreSQL (optional durability layer) --------------------------
    # The processed dataset is mirrored into
    #     tradingdb.research.trendlyne_reports
    # after crawling/cleaning/validation. Credentials come from .env.
    # Set POSTGRES_ENABLED=false (or pass --no-postgres) to skip it.
    postgres_enabled: bool = os.getenv("POSTGRES_ENABLED", "true").lower() == "true"
    db_host: Optional[str] = os.getenv("DB_HOST")
    db_port: str = os.getenv("DB_PORT", "5432")
    db_name: Optional[str] = os.getenv("DB_NAME")
    db_user: Optional[str] = os.getenv("DB_USER")
    db_password: Optional[str] = os.getenv("DB_PASSWORD")
    db_schema: str = "research"
    db_table: str = "trendlyne_reports"
    db_connect_timeout_sec: int = _env_int("DB_CONNECT_TIMEOUT_SEC", 10)

    # ---- Incremental production runner ------------------------------------
    incremental_overlap_days: int = _env_int("INCREMENTAL_OVERLAP_DAYS", 14)
    incremental_stop_after_known_pages: int = _env_int("INCREMENTAL_STOP_AFTER_KNOWN_PAGES", 0)
    schedule_timezone: str = os.getenv("SCHEDULE_TIMEZONE", "Asia/Kolkata")
    schedule_hour: int = _env_int("SCHEDULE_HOUR", 7)
    schedule_minute: int = _env_int("SCHEDULE_MINUTE", 0)
    run_on_startup: bool = _env_bool("RUN_ON_STARTUP", True)
    scheduler_heartbeat_seconds: int = _env_int("SCHEDULER_HEARTBEAT_SECONDS", 30)

    # ---- New-report webhook ------------------------------------------------
    webhook_enabled: bool = _env_bool("WEBHOOK_ENABLED", False)
    webhook_url: Optional[str] = os.getenv("WEBHOOK_URL")
    webhook_token_file: Optional[str] = os.getenv("WEBHOOK_TOKEN_FILE")
    webhook_chat_id: Optional[str] = os.getenv("WEBHOOK_CHAT_ID")
    webhook_timeout_sec: int = _env_int("WEBHOOK_TIMEOUT_SECONDS", 15)
    webhook_batch_size: int = _env_int("WEBHOOK_BATCH_SIZE", 50)

    # ---- Output -----------------------------------------------------------
    csv_path: Path = DATA_DIR / "trendlyne_reports_5y.csv"
    parquet_path: Path = DATA_DIR / "trendlyne_reports_5y.parquet"
    sqlite_path: Path = DATA_DIR / "trendlyne_reports.db"
    checkpoint_path: Path = CHECKPOINT_DIR / "checkpoint.json"
    log_path: Path = LOG_DIR / "scraper.log"
    nifty100_cache_path: Path = DATA_DIR / "nifty100_constituents.csv"
    scheduler_state_path: Path = STATE_DIR / "scheduler.json"

    # ---- HTTP -------------------------------------------------------------
    user_agents: tuple = (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 "
        "(KHTML, like Gecko) Version/17.4 Safari/605.1.15",
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 "
        "Firefox/125.0",
    )

    source_name: str = "Trendlyne"
    default_exchange: str = "NSE"
    default_currency: str = "INR"


SETTINGS = Settings()
