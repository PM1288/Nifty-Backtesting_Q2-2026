"""
utils.py
========
Shared helpers: logging setup, retry/backoff, and normalization routines
for dates, prices, percentages, broker names, and company names.
"""
from __future__ import annotations

import logging
import random
import re
import sys
import time
from datetime import datetime
from functools import wraps
from typing import Callable, Optional, TypeVar

from config import SETTINGS

T = TypeVar("T")


# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
def setup_logging(verbose: bool = True) -> logging.Logger:
    logger = logging.getLogger("trendlyne_scraper")
    logger.setLevel(logging.DEBUG if verbose else logging.INFO)
    logger.propagate = False

    if logger.handlers:
        return logger  # already configured (e.g. re-entrant calls)

    fmt = logging.Formatter(
        "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    file_handler = logging.FileHandler(SETTINGS.log_path, encoding="utf-8")
    file_handler.setFormatter(fmt)
    file_handler.setLevel(logging.DEBUG)

    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(fmt)
    console_handler.setLevel(logging.INFO)

    logger.addHandler(file_handler)
    logger.addHandler(console_handler)
    return logger


LOGGER = setup_logging()


# ---------------------------------------------------------------------------
# Retry / exponential backoff
# ---------------------------------------------------------------------------
class RetryExhaustedError(RuntimeError):
    pass


def retry_with_backoff(
    max_retries: Optional[int] = None,
    base: Optional[float] = None,
    max_delay: Optional[float] = None,
    retry_on: tuple = (Exception,),
):
    """Decorator: retries the wrapped call with exponential backoff + jitter."""
    max_retries = max_retries if max_retries is not None else SETTINGS.max_retries
    base = base if base is not None else SETTINGS.backoff_base_sec
    max_delay = max_delay if max_delay is not None else SETTINGS.backoff_max_sec

    def decorator(func: Callable[..., T]) -> Callable[..., T]:
        @wraps(func)
        def wrapper(*args, **kwargs):
            attempt = 0
            while True:
                try:
                    return func(*args, **kwargs)
                except retry_on as exc:  # noqa: PERF203
                    attempt += 1
                    if attempt > max_retries:
                        LOGGER.error(
                            "Retries exhausted for %s after %d attempts: %s",
                            func.__name__, attempt - 1, exc,
                        )
                        raise RetryExhaustedError(
                            f"{func.__name__} failed after {attempt - 1} retries"
                        ) from exc
                    delay = min(max_delay, base * (2 ** (attempt - 1)))
                    delay += random.uniform(0, delay * 0.25)  # jitter
                    LOGGER.warning(
                        "Attempt %d/%d for %s failed (%s); retrying in %.1fs",
                        attempt, max_retries, func.__name__, exc, delay,
                    )
                    time.sleep(delay)
        return wrapper
    return decorator


# ---------------------------------------------------------------------------
# Rate limiter (simple token-bucket-ish sleep gate, thread-safe)
# ---------------------------------------------------------------------------
import threading


class RateLimiter:
    def __init__(self, min_interval_sec: float):
        self.min_interval = min_interval_sec
        self._lock = threading.Lock()
        self._last_call = 0.0

    def wait(self):
        with self._lock:
            now = time.monotonic()
            elapsed = now - self._last_call
            sleep_for = self.min_interval - elapsed
            if sleep_for > 0:
                time.sleep(sleep_for)
            self._last_call = time.monotonic()


RATE_LIMITER = RateLimiter(SETTINGS.min_request_interval_sec)


def random_user_agent() -> str:
    return random.choice(SETTINGS.user_agents)


# ---------------------------------------------------------------------------
# Normalization helpers
# ---------------------------------------------------------------------------
_DATE_FORMATS = (
    "%d %b %Y",     # 08 Jul 2026
    "%d %B %Y",     # 08 July 2026
    "%Y-%m-%d",
    "%d/%m/%Y",
    "%d-%m-%Y",
)


def clean_text(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    value = re.sub(r"\s+", " ", value).strip()
    return value or None


def normalize_date(raw: Optional[str]) -> Optional[str]:
    """Normalize a variety of date strings to ISO YYYY-MM-DD."""
    raw = clean_text(raw)
    if not raw:
        return None
    raw = raw.replace("Sept", "Sep")
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(raw, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    # Last resort: pull a dd Mon yyyy pattern out of noisier strings
    m = re.search(r"(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})", raw)
    if m:
        for fmt in ("%d %b %Y", "%d %B %Y"):
            try:
                return datetime.strptime(m.group(1), fmt).strftime("%Y-%m-%d")
            except ValueError:
                continue
    LOGGER.debug("Could not normalize date: %r", raw)
    return None


def normalize_price(raw) -> Optional[float]:
    if raw is None:
        return None
    if isinstance(raw, (int, float)):
        return float(raw)
    raw = clean_text(str(raw))
    if not raw:
        return None
    raw = raw.replace(",", "").replace("₹", "").replace("Rs.", "").replace("Rs", "")
    raw = raw.strip()
    m = re.search(r"-?\d+(\.\d+)?", raw)
    if not m:
        return None
    try:
        return float(m.group(0))
    except ValueError:
        return None


def normalize_percent(raw) -> Optional[float]:
    if raw is None:
        return None
    if isinstance(raw, (int, float)):
        return float(raw)
    raw = clean_text(str(raw))
    if not raw:
        return None
    raw = raw.replace("%", "").replace(",", "").strip()
    m = re.search(r"-?\d+(\.\d+)?", raw)
    if not m:
        return None
    try:
        return float(m.group(0))
    except ValueError:
        return None


_BROKER_ALIASES = {
    "hdfc sec": "HDFC Securities",
    "hdfc securities ltd": "HDFC Securities",
    "icici direct.com": "ICICI Direct",
    "icici securities ltd": "ICICI Securities Limited",
    "motilal oswal financial services": "Motilal Oswal",
    "kotak sec": "Kotak Securities",
    "geojit bnp": "Geojit BNP Paribas",
}


def normalize_broker_name(raw: Optional[str]) -> Optional[str]:
    raw = clean_text(raw)
    if not raw:
        return None
    key = raw.strip().lower()
    return _BROKER_ALIASES.get(key, raw.strip())


def normalize_company_name(raw: Optional[str]) -> Optional[str]:
    raw = clean_text(raw)
    if not raw:
        return None
    # Trendlyne truncates long names with ".." in the listing table.
    raw = raw.rstrip(".").strip()
    # Title-case only if the source gave us all-caps/garbled casing.
    return raw


_RECO_WORDS = {"buy", "sell", "hold", "add", "accumulate", "reduce", "neutral",
               "outperform", "underperform", "overweight", "underweight"}


def extract_recommendation(report_type_text: Optional[str]) -> Optional[str]:
    """On Trendlyne's listing, the 'Type' column doubles as the recommendation
    for stock-specific reports (Buy/Hold/Sell) and as a report category
    (Daily Note, Sector Update, IPO Note, Strategy Note, ...) for
    non-recommendation reports. Only return it as a recommendation when it
    is actually one of the known recommendation words."""
    text = clean_text(report_type_text)
    if not text:
        return None
    return text if text.strip().lower() in _RECO_WORDS else None


def normalize_report_type(report_type_text: Optional[str]) -> Optional[str]:
    text = clean_text(report_type_text)
    if not text:
        return None
    if text.strip().lower() in _RECO_WORDS:
        return "Stock Recommendation"
    return text
