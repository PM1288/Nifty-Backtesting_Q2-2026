import io
import os
import re
import time
import math
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

import requests
import yfinance as yf
from dateutil import parser as dt_parser
from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel, Field
from pypdf import PdfReader

APP_NAME = "market-data-gateway"
APP_VERSION = "1.0.0"
REQUEST_TIMEOUT_SECONDS = float(os.getenv("REQUEST_TIMEOUT_SECONDS", "8"))
DEFAULT_CACHE_TTL_SECONDS = int(os.getenv("CACHE_TTL_SECONDS", "60"))
IBJA_CACHE_TTL_SECONDS = int(os.getenv("IBJA_CACHE_TTL_SECONDS", "21600"))
IBJA_LOOKBACK_DAYS = int(os.getenv("IBJA_LOOKBACK_DAYS", "7"))
MAX_WORKERS = int(os.getenv("MAX_WORKERS", "8"))
USER_AGENT = os.getenv("USER_AGENT", f"{APP_NAME}/{APP_VERSION}")
FRED_API_KEY = os.getenv("FRED_API_KEY", "").strip()

UTC = timezone.utc

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(APP_NAME)

session = requests.Session()
session.headers.update(
    {
        "User-Agent": USER_AGENT,
        "Accept": "application/json,text/plain,application/pdf,*/*",
    }
)

# ---------------------------------------------------------------------------
# Simple TTL cache
# ---------------------------------------------------------------------------
_CACHE: Dict[str, Tuple[float, Any]] = {}


def cache_get(key: str) -> Optional[Any]:
    item = _CACHE.get(key)
    if not item:
        return None
    expires_at, value = item
    if time.time() >= expires_at:
        _CACHE.pop(key, None)
        return None
    return value


def cache_set(key: str, value: Any, ttl_seconds: int) -> Any:
    _CACHE[key] = (time.time() + ttl_seconds, value)
    return value


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------
class Quote(BaseModel):
    code: str
    label: str
    value: Optional[float] = None
    change_value: Optional[float] = None
    change_pct: Optional[float] = None
    currency: str
    unit: str
    as_of: Optional[str] = None
    source: str
    delayed: bool = True
    provider_symbol: Optional[str] = None
    quality: str = "delayed_or_eod"
    notes: List[str] = Field(default_factory=list)
    meta: Dict[str, Any] = Field(default_factory=dict)


class QuotesResponse(BaseModel):
    ok: bool = True
    generated_at: str
    items: List[Quote]
    errors: List[Dict[str, str]] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Symbol catalog
# ---------------------------------------------------------------------------
GLOBAL_INDICES: Dict[str, Dict[str, str]] = {
    "dow_jones": {"label": "Dow Jones Industrial Average", "symbol": "^DJI", "currency": "USD"},
    "sp_500": {"label": "S&P 500", "symbol": "^GSPC", "currency": "USD"},
    "nasdaq_composite": {"label": "NASDAQ Composite", "symbol": "^IXIC", "currency": "USD"},
    "russell_2000": {"label": "Russell 2000", "symbol": "^RUT", "currency": "USD"},
    "nifty_50": {"label": "NIFTY 50", "symbol": "^NSEI", "currency": "INR"},
    "sensex": {"label": "BSE SENSEX", "symbol": "^BSESN", "currency": "INR"},
    "ftse_100": {"label": "FTSE 100", "symbol": "^FTSE", "currency": "GBP"},
    "dax": {"label": "DAX", "symbol": "^GDAXI", "currency": "EUR"},
    "cac_40": {"label": "CAC 40", "symbol": "^FCHI", "currency": "EUR"},
    "euro_stoxx_50": {"label": "EURO STOXX 50", "symbol": "^STOXX50E", "currency": "EUR"},
    "nikkei_225": {"label": "Nikkei 225", "symbol": "^N225", "currency": "JPY"},
    "hang_seng": {"label": "Hang Seng", "symbol": "^HSI", "currency": "HKD"},
    "shanghai_composite": {"label": "Shanghai Composite", "symbol": "000001.SS", "currency": "CNY"},
    "kospi": {"label": "KOSPI", "symbol": "^KS11", "currency": "KRW"},
    "asx_200": {"label": "S&P/ASX 200", "symbol": "^AXJO", "currency": "AUD"},
    "tsx_composite": {"label": "S&P/TSX Composite", "symbol": "^GSPTSE", "currency": "CAD"},
    "bovespa": {"label": "Ibovespa", "symbol": "^BVSP", "currency": "BRL"},
}

SUPPORTED_CODES = {
    "gift_nifty": "GIFT NIFTY near-month futures level from NSE IX public derivatives board",
    "dow_jones": "Dow Jones index value",
    "brent_crude": "Brent crude oil price per barrel",
    "india_gold": "India benchmark gold PM rate (Rs/10g) from IBJA if available",
    "india_silver": "India benchmark silver PM rate (Rs/kg) from IBJA if available",
    "europe_natural_gas": "Europe natural gas benchmark via TTF futures",
    "usd_inr": "USD to INR",
}

DEFAULT_CODES = [
    "gift_nifty",
    "dow_jones",
    "brent_crude",
    "india_gold",
    "india_silver",
    "europe_natural_gas",
    "usd_inr",
]


# ---------------------------------------------------------------------------
# Utilities
# ---------------------------------------------------------------------------
def now_iso() -> str:
    return datetime.now(UTC).isoformat()



def normalize_float(value: Any) -> Optional[float]:
    if value is None:
        return None
    if isinstance(value, float):
        return None if math.isnan(value) or math.isinf(value) else float(value)
    if isinstance(value, int):
        return float(value)
    if isinstance(value, str):
        stripped = value.strip().replace(",", "")
        if stripped in {"", ".", "None", "null", "nan", "NaN"}:
            return None
        try:
            out = float(stripped)
            return None if math.isnan(out) or math.isinf(out) else out
        except ValueError:
            return None
    return None



def date_to_iso(value: Any) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=UTC)
        return value.astimezone(UTC).isoformat()
    if isinstance(value, date):
        return datetime(value.year, value.month, value.day, tzinfo=UTC).isoformat()
    return str(value)



def strip_ordinal_suffixes(text: str) -> str:
    return re.sub(r"(\d+)(st|nd|rd|th)", r"\1", text)



def safe_parse_human_date(text: str) -> Optional[str]:
    try:
        clean = strip_ordinal_suffixes(text)
        dt = dt_parser.parse(clean, dayfirst=True)
        return date_to_iso(dt)
    except Exception:
        return None


def parse_iso_datetime(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value)
    except Exception:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)


def is_reference_stale(as_of: Optional[str], *, max_age_days: int = 2) -> bool:
    parsed = parse_iso_datetime(as_of)
    if parsed is None:
        return True
    return (datetime.now(UTC) - parsed) > timedelta(days=max_age_days)



def build_quote(
    *,
    code: str,
    label: str,
    value: Optional[float],
    change_value: Optional[float] = None,
    change_pct: Optional[float] = None,
    currency: str,
    unit: str,
    as_of: Optional[str],
    source: str,
    delayed: bool,
    provider_symbol: Optional[str] = None,
    quality: str = "delayed_or_eod",
    notes: Optional[List[str]] = None,
    meta: Optional[Dict[str, Any]] = None,
) -> Quote:
    return Quote(
        code=code,
        label=label,
        value=None if value is None else round(float(value), 6),
        change_value=None if change_value is None else round(float(change_value), 6),
        change_pct=None if change_pct is None else round(float(change_pct), 6),
        currency=currency,
        unit=unit,
        as_of=as_of,
        source=source,
        delayed=delayed,
        provider_symbol=provider_symbol,
        quality=quality,
        notes=notes or [],
        meta=meta or {},
    )


# ---------------------------------------------------------------------------
# FRED helpers
# ---------------------------------------------------------------------------
FRED_OBS_URL = "https://api.stlouisfed.org/fred/series/observations"



def fred_latest_observation(series_id: str) -> Tuple[float, str, Dict[str, Any]]:
    if not FRED_API_KEY:
        raise RuntimeError("FRED_API_KEY is not configured")

    cache_key = f"fred:{series_id}"
    cached = cache_get(cache_key)
    if cached:
        return cached

    params = {
        "series_id": series_id,
        "api_key": FRED_API_KEY,
        "file_type": "json",
        "sort_order": "desc",
        "limit": 10,
    }
    response = session.get(FRED_OBS_URL, params=params, timeout=REQUEST_TIMEOUT_SECONDS)
    response.raise_for_status()
    payload = response.json()
    observations = payload.get("observations", [])
    for obs in observations:
        value = normalize_float(obs.get("value"))
        if value is not None:
            result = (
                value,
                date_to_iso(datetime.fromisoformat(obs["date"]).replace(tzinfo=UTC)),
                {"series_id": series_id, "realtime_start": payload.get("realtime_start")},
            )
            return cache_set(cache_key, result, DEFAULT_CACHE_TTL_SECONDS)
    raise RuntimeError(f"No usable observation returned for FRED series {series_id}")


# ---------------------------------------------------------------------------
# Frankfurter helpers (daily FX fallback)
# ---------------------------------------------------------------------------
FRANKFURTER_URL = "https://api.frankfurter.dev/v1/latest"
NSEIX_DERIVATIVES_URL = "https://www.nseix.com/api/market-rate"



def frankfurter_usd_inr() -> Quote:
    cache_key = "frankfurter:usd_inr"
    cached = cache_get(cache_key)
    if cached:
        return cached

    response = session.get(
        FRANKFURTER_URL,
        params={"base": "USD", "symbols": "INR"},
        timeout=REQUEST_TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    payload = response.json()
    value = normalize_float(payload.get("rates", {}).get("INR"))
    if value is None:
        raise RuntimeError("Frankfurter did not return INR")

    quote = build_quote(
        code="usd_inr",
        label="USD/INR",
        value=value,
        currency="INR",
        unit="INR_per_USD",
        as_of=date_to_iso(datetime.fromisoformat(payload["date"]).replace(tzinfo=UTC)),
        source="frankfurter",
        delayed=True,
        quality="daily_reference",
        notes=["Daily ECB-reference style FX rate fallback."],
        meta={"base": payload.get("base", "USD")},
    )
    return cache_set(cache_key, quote, DEFAULT_CACHE_TTL_SECONDS)


def nseix_front_month_nifty_future() -> Dict[str, Any]:
    cache_key = "nseix:front_month_nifty_future"
    cached = cache_get(cache_key)
    if cached:
        return cached

    response = session.get(
        NSEIX_DERIVATIVES_URL,
        params={"type": "derivative"},
        timeout=REQUEST_TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    payload = response.json()
    rows = payload.get("data") or []
    if not isinstance(rows, list) or not rows:
        raise RuntimeError("NSE IX derivatives endpoint returned no rows")

    front_month: Optional[Dict[str, Any]] = None
    front_month_expiry: Optional[datetime] = None

    for row in rows:
        if str(row.get("INSTRUMENTTYPE", "")).upper() != "FUTIDX":
            continue
        if str(row.get("SYMBOL", "")).upper() != "NIFTY":
            continue
        expiry_text = str(row.get("EXPIRYDATE") or "").strip()
        try:
            expiry_dt = dt_parser.parse(expiry_text, dayfirst=True)
        except Exception:
            expiry_dt = None
        if front_month is None:
            front_month = row
            front_month_expiry = expiry_dt
            continue
        if expiry_dt is not None and (front_month_expiry is None or expiry_dt < front_month_expiry):
            front_month = row
            front_month_expiry = expiry_dt

    if front_month is None:
        raise RuntimeError("NSE IX derivatives endpoint returned no NIFTY futures rows")

    return cache_set(cache_key, front_month, DEFAULT_CACHE_TTL_SECONDS)


# ---------------------------------------------------------------------------
# Yahoo / yfinance helpers
# ---------------------------------------------------------------------------

def yahoo_latest_quote(symbol: str, *, code: str, label: str, currency: str, unit: str) -> Quote:
    cache_key = f"yahoo:{symbol}"
    cached = cache_get(cache_key)
    if cached:
        return cached

    notes: List[str] = [
        "Uses Yahoo Finance via yfinance.",
        "Treat this as delayed or exchange-dependent unless your own exchange license says otherwise.",
    ]
    value: Optional[float] = None
    change_value: Optional[float] = None
    change_pct: Optional[float] = None
    as_of: Optional[str] = None
    meta: Dict[str, Any] = {}

    ticker = yf.Ticker(symbol)

    # Try fast_info first (usually cheapest and fast).
    try:
        fast_info = getattr(ticker, "fast_info", None)
        if fast_info:
            value = normalize_float(fast_info.get("lastPrice") or fast_info.get("last_price"))
            if value is not None:
                currency = str(fast_info.get("currency") or currency)
                meta["exchange"] = fast_info.get("exchange")
                meta["quote_type"] = fast_info.get("quoteType") or fast_info.get("quote_type")
                previous_close = normalize_float(
                    fast_info.get("previousClose")
                    or fast_info.get("previous_close")
                    or fast_info.get("regularMarketPreviousClose")
                )
                if previous_close is not None and value is not None:
                    change_value = value - previous_close
                    if previous_close:
                        change_pct = (change_value / previous_close) * 100.0
                as_of = now_iso()
    except Exception as exc:
        meta["fast_info_error"] = str(exc)

    # Fall back to history last close.
    if value is None:
        try:
            hist = yf.download(
                symbol,
                period="5d",
                interval="1d",
                progress=False,
                auto_adjust=False,
                threads=False,
            )
            if hist is not None and not hist.empty:
                if hasattr(hist.columns, "levels") and "Close" in hist.columns.get_level_values(0):
                    close_series = hist["Close"]
                    if hasattr(close_series, "columns"):
                        close_series = close_series.iloc[:, 0]
                else:
                    close_series = hist["Close"]
                close_series = close_series.dropna()
                if not close_series.empty:
                    history_last = normalize_float(close_series.iloc[-1])
                    if value is None:
                        value = history_last
                    idx = close_series.index[-1]
                    as_of = date_to_iso(idx.to_pydatetime() if hasattr(idx, "to_pydatetime") else idx)
                    meta["from_history"] = True
                    if len(close_series) >= 2:
                        previous_close = normalize_float(close_series.iloc[-2])
                        if previous_close is not None and value is not None:
                            derived_change = value - previous_close
                            change_value = change_value if change_value is not None else derived_change
                            if previous_close:
                                derived_pct = (derived_change / previous_close) * 100.0
                                change_pct = change_pct if change_pct is not None else derived_pct
        except Exception as exc:
            meta["history_error"] = str(exc)

    # Last fallback: slow info call.
    if value is None:
        try:
            info = ticker.info or {}
            value = normalize_float(info.get("regularMarketPrice") or info.get("currentPrice"))
            if value is not None:
                currency = str(info.get("currency") or currency)
                previous_close = normalize_float(
                    info.get("regularMarketPreviousClose") or info.get("previousClose")
                )
                direct_change = normalize_float(info.get("regularMarketChange"))
                direct_pct = normalize_float(info.get("regularMarketChangePercent"))
                if direct_change is not None:
                    change_value = direct_change
                elif previous_close is not None:
                    change_value = value - previous_close
                if direct_pct is not None:
                    change_pct = direct_pct
                elif previous_close is not None and previous_close:
                    change_pct = ((value - previous_close) / previous_close) * 100.0
                ts = info.get("regularMarketTime")
                if isinstance(ts, (int, float)):
                    as_of = date_to_iso(datetime.fromtimestamp(ts, tz=UTC))
                else:
                    as_of = now_iso()
                meta["market_state"] = info.get("marketState")
        except Exception as exc:
            meta["info_error"] = str(exc)

    if value is None:
        raise RuntimeError(f"Yahoo/yfinance returned no usable value for {symbol}")

    quote = build_quote(
        code=code,
        label=label,
        value=value,
        change_value=change_value,
        change_pct=change_pct,
        currency=currency,
        unit=unit,
        as_of=as_of or now_iso(),
        source="yfinance",
        delayed=True,
        provider_symbol=symbol,
        quality="delayed_or_eod",
        notes=notes,
        meta=meta,
    )
    return cache_set(cache_key, quote, DEFAULT_CACHE_TTL_SECONDS)


def get_gift_nifty() -> Quote:
    row = nseix_front_month_nifty_future()
    value = normalize_float(row.get("LASTPRICE"))
    change_value = normalize_float(row.get("DAYCHANGE_1") or row.get("DAYCHANGE"))
    change_pct = normalize_float(row.get("PERCHANGE"))
    expiry_text = str(row.get("EXPIRYDATE") or "").strip()
    timestamp_text = str(row.get("TIMESTMP") or "").strip()

    if value is None:
        raise RuntimeError("NSE IX front-month NIFTY future did not include a usable last price")

    quote = build_quote(
        code="gift_nifty",
        label="GIFT NIFTY",
        value=value,
        change_value=change_value,
        change_pct=change_pct,
        currency="USD",
        unit="index_points",
        as_of=safe_parse_human_date(timestamp_text) or timestamp_text or now_iso(),
        source="nseix",
        delayed=True,
        provider_symbol="NIFTY FUTIDX",
        quality="official_exchange_snapshot",
        notes=[
            "Near-month NIFTY futures snapshot from NSE IX public derivatives market board.",
            "Displayed as public exchange data and should be treated as delayed or website-snapshot dependent unless you hold direct market data rights.",
        ],
        meta={
            "instrument_type": row.get("INSTRUMENTTYPE"),
            "symbol": row.get("SYMBOL"),
            "expiry_date": expiry_text,
            "contracts_traded": normalize_float(row.get("CONTRACTSTRADED")),
            "token_number": row.get("TOKEN_NMBR"),
        },
    )
    return quote


# ---------------------------------------------------------------------------
# IBJA PDF scrape for India benchmark bullion
# ---------------------------------------------------------------------------
IBJA_PDF_TEMPLATE = "https://ibja.co/Upload/IBJA_Bullion%20Daily%20Report%20-%20{report_date}.pdf"



def ibja_candidate_urls(days_back: int = IBJA_LOOKBACK_DAYS) -> List[Tuple[str, date]]:
    today = datetime.now(UTC).date()
    candidates: List[Tuple[str, date]] = []
    for offset in range(days_back + 1):
        d = today - timedelta(days=offset)
        url = IBJA_PDF_TEMPLATE.format(report_date=d.strftime("%d-%m-%Y"))
        candidates.append((url, d))
    return candidates



def parse_ibja_pdf(content: bytes) -> Dict[str, Any]:
    reader = PdfReader(io.BytesIO(content))
    text = "\n".join((page.extract_text() or "") for page in reader.pages[:2])
    flat = re.sub(r"\s+", " ", text)

    report_date_match = re.search(r"Daily Bullion Physical Market Report Date:\s*([^\n]+?)\s+Description", flat, re.IGNORECASE)
    if not report_date_match:
        report_date_match = re.search(r"Daily Bullion Physical Market Report Date:\s*([^\n]+?)\s+Gold\s+999", flat, re.IGNORECASE)

    gold_match = re.search(r"Gold\s+999\s+([\d,]+)\s+([\d,]+)", flat, re.IGNORECASE)
    silver_match = re.search(r"Silver\s+999\s+([\d,]+)\s+([\d,]+)", flat, re.IGNORECASE)
    as_of_match = re.search(
        r"Rate as exclusive of GST as of\s+(.+?)\s+Gold is Rs/10 Gm\.\s*&\s*Silver in Rs/Kg",
        flat,
        re.IGNORECASE,
    )

    if not gold_match and not silver_match:
        raise RuntimeError("IBJA PDF parsed but Gold 999 / Silver 999 rows were not found")

    return {
        "report_date": safe_parse_human_date(report_date_match.group(1)) if report_date_match else None,
        "as_of": safe_parse_human_date(as_of_match.group(1)) if as_of_match else None,
        "gold_am": normalize_float(gold_match.group(1)) if gold_match else None,
        "gold_pm": normalize_float(gold_match.group(2)) if gold_match else None,
        "silver_am": normalize_float(silver_match.group(1)) if silver_match else None,
        "silver_pm": normalize_float(silver_match.group(2)) if silver_match else None,
    }



def fetch_ibja_rates() -> Dict[str, Any]:
    cache_key = "ibja:rates"
    cached = cache_get(cache_key)
    if cached:
        return cached

    last_error: Optional[str] = None
    for url, fallback_date in ibja_candidate_urls():
        try:
            response = session.get(url, timeout=REQUEST_TIMEOUT_SECONDS)
            if response.status_code != 200:
                last_error = f"HTTP {response.status_code} from {url}"
                continue
            content_type = response.headers.get("content-type", "")
            if "pdf" not in content_type.lower() and not response.content.startswith(b"%PDF"):
                last_error = f"Non-PDF response from {url}"
                continue
            parsed = parse_ibja_pdf(response.content)
            parsed["url"] = url
            parsed["fallback_report_date"] = date_to_iso(fallback_date)
            return cache_set(cache_key, parsed, IBJA_CACHE_TTL_SECONDS)
        except Exception as exc:
            last_error = str(exc)
            continue
    raise RuntimeError(last_error or "Unable to fetch IBJA daily report")


# ---------------------------------------------------------------------------
# Quote resolvers
# ---------------------------------------------------------------------------

def get_usd_inr_value() -> Quote:
    try:
        value, as_of, meta = fred_latest_observation("DEXINUS")
        return build_quote(
            code="usd_inr",
            label="USD/INR",
            value=value,
            currency="INR",
            unit="INR_per_USD",
            as_of=as_of,
            source="fred",
            delayed=True,
            quality="daily_official",
            notes=["Daily official-style reference rate from FRED H.10 series."],
            meta=meta,
        )
    except Exception as fred_exc:
        fallback = frankfurter_usd_inr()
        fallback.notes.append(f"FRED unavailable: {fred_exc}")
        if not is_reference_stale(fallback.as_of):
            return fallback

        yahoo = yahoo_latest_quote(
            "INR=X",
            code="usd_inr",
            label="USD/INR",
            currency="INR",
            unit="INR_per_USD",
        )
        yahoo.source = "yfinance"
        yahoo.quality = "delayed_or_eod"
        yahoo.notes.insert(0, f"Frankfurter daily reference stale as of {fallback.as_of}.")
        yahoo.notes.append("Fallback uses Yahoo Finance INR=X for a fresher market proxy.")
        yahoo.meta["stale_daily_reference_as_of"] = fallback.as_of
        return yahoo



def get_brent_crude() -> Quote:
    try:
        value, as_of, meta = fred_latest_observation("DCOILBRENTEU")
        return build_quote(
            code="brent_crude",
            label="Brent Crude Oil",
            value=value,
            currency="USD",
            unit="USD_per_barrel",
            as_of=as_of,
            source="fred",
            delayed=True,
            quality="daily_official",
            notes=["Daily Brent Europe series from FRED."],
            meta=meta,
        )
    except Exception as fred_exc:
        fallback = yahoo_latest_quote(
            "BZ=F",
            code="brent_crude",
            label="Brent Crude Oil Futures",
            currency="USD",
            unit="USD_per_barrel",
        )
        fallback.notes.append(f"FRED unavailable: {fred_exc}")
        return fallback



def get_dow_jones() -> Quote:
    return yahoo_latest_quote(
        "^DJI",
        code="dow_jones",
        label="Dow Jones Industrial Average",
        currency="USD",
        unit="index_points",
    )



def get_europe_natural_gas() -> Quote:
    quote = yahoo_latest_quote(
        "TTF=F",
        code="europe_natural_gas",
        label="Europe Natural Gas (TTF Futures)",
        currency="EUR",
        unit="EUR_per_MWh",
    )
    quote.notes.append("This is a TTF futures proxy for European gas, not an exchange-cleared spot API.")
    return quote



def approximate_india_metal(code: str) -> Quote:
    usd_inr = get_usd_inr_value()
    if usd_inr.value is None:
        raise RuntimeError("USD/INR value unavailable for India metal approximation")

    if code == "india_gold":
        yahoo = yahoo_latest_quote(
            "GC=F",
            code="india_gold",
            label="India Gold Approximation",
            currency="USD",
            unit="USD_per_troy_ounce",
        )
        if yahoo.value is None:
            raise RuntimeError("Gold futures value unavailable")
        inr_per_10g = yahoo.value * usd_inr.value / 31.1034768 * 10.0
        return build_quote(
            code="india_gold",
            label="India Gold Approximation",
            value=inr_per_10g,
            currency="INR",
            unit="INR_per_10g",
            as_of=yahoo.as_of or usd_inr.as_of,
            source="yfinance+fx_conversion",
            delayed=True,
            quality="approximation",
            provider_symbol="GC=F",
            notes=[
                "Approximation from COMEX gold futures converted with USD/INR.",
                "This is not the IBJA benchmark rate.",
            ],
            meta={
                "gold_usd_per_oz": yahoo.value,
                "usd_inr": usd_inr.value,
            },
        )

    if code == "india_silver":
        yahoo = yahoo_latest_quote(
            "SI=F",
            code="india_silver",
            label="India Silver Approximation",
            currency="USD",
            unit="USD_per_troy_ounce",
        )
        if yahoo.value is None:
            raise RuntimeError("Silver futures value unavailable")
        inr_per_kg = yahoo.value * usd_inr.value / 31.1034768 * 1000.0
        return build_quote(
            code="india_silver",
            label="India Silver Approximation",
            value=inr_per_kg,
            currency="INR",
            unit="INR_per_kg",
            as_of=yahoo.as_of or usd_inr.as_of,
            source="yfinance+fx_conversion",
            delayed=True,
            quality="approximation",
            provider_symbol="SI=F",
            notes=[
                "Approximation from COMEX silver futures converted with USD/INR.",
                "This is not the IBJA benchmark rate.",
            ],
            meta={
                "silver_usd_per_oz": yahoo.value,
                "usd_inr": usd_inr.value,
            },
        )

    raise RuntimeError(f"Unsupported approximate metal code: {code}")



def get_india_gold() -> Quote:
    try:
        ibja = fetch_ibja_rates()
        quote = build_quote(
            code="india_gold",
            label="India Gold (IBJA PM Rate)",
            value=ibja.get("gold_pm"),
            currency="INR",
            unit="INR_per_10g",
            as_of=ibja.get("as_of") or ibja.get("report_date") or ibja.get("fallback_report_date"),
            source="ibja_pdf",
            delayed=True,
            quality="daily_benchmark",
            notes=[
                "Benchmark PM rate parsed from IBJA public daily bulletin PDF.",
                "Rates are exclusive of GST.",
            ],
            meta={"report_url": ibja.get("url"), "report_date": ibja.get("report_date")},
        )
        if not is_reference_stale(quote.as_of):
            return quote

        fallback = approximate_india_metal("india_gold")
        fallback.notes.insert(0, f"IBJA benchmark stale as of {quote.as_of}.")
        fallback.notes.append(f"Latest bulletin URL: {ibja.get('url')}")
        fallback.meta["stale_benchmark_as_of"] = quote.as_of
        fallback.meta["benchmark_report_date"] = ibja.get("report_date")
        return fallback
    except Exception as ibja_exc:
        fallback = approximate_india_metal("india_gold")
        fallback.notes.append(f"IBJA bulletin unavailable: {ibja_exc}")
        return fallback



def get_india_silver() -> Quote:
    try:
        ibja = fetch_ibja_rates()
        quote = build_quote(
            code="india_silver",
            label="India Silver (IBJA PM Rate)",
            value=ibja.get("silver_pm"),
            currency="INR",
            unit="INR_per_kg",
            as_of=ibja.get("as_of") or ibja.get("report_date") or ibja.get("fallback_report_date"),
            source="ibja_pdf",
            delayed=True,
            quality="daily_benchmark",
            notes=[
                "Benchmark PM rate parsed from IBJA public daily bulletin PDF.",
                "Rates are exclusive of GST.",
            ],
            meta={"report_url": ibja.get("url"), "report_date": ibja.get("report_date")},
        )
        if not is_reference_stale(quote.as_of):
            return quote

        fallback = approximate_india_metal("india_silver")
        fallback.notes.insert(0, f"IBJA benchmark stale as of {quote.as_of}.")
        fallback.notes.append(f"Latest bulletin URL: {ibja.get('url')}")
        fallback.meta["stale_benchmark_as_of"] = quote.as_of
        fallback.meta["benchmark_report_date"] = ibja.get("report_date")
        return fallback
    except Exception as ibja_exc:
        fallback = approximate_india_metal("india_silver")
        fallback.notes.append(f"IBJA bulletin unavailable: {ibja_exc}")
        return fallback


RESOLVERS = {
    "gift_nifty": get_gift_nifty,
    "dow_jones": get_dow_jones,
    "brent_crude": get_brent_crude,
    "india_gold": get_india_gold,
    "india_silver": get_india_silver,
    "europe_natural_gas": get_europe_natural_gas,
    "usd_inr": get_usd_inr_value,
}


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------
app = FastAPI(title=APP_NAME, version=APP_VERSION)


@app.get("/")
def root() -> Dict[str, Any]:
    return {
        "name": APP_NAME,
        "version": APP_VERSION,
        "generated_at": now_iso(),
        "supported_codes": SUPPORTED_CODES,
        "global_indices_count": len(GLOBAL_INDICES),
        "endpoints": [
            "/health",
            "/catalog",
            "/quote/{code}",
            "/quotes?codes=dow_jones,brent_crude,india_gold,india_silver,europe_natural_gas,usd_inr",
            "/global-indices",
            "/yahoo/quote?symbol=^DJI",
        ],
    }


@app.get("/health")
def health() -> Dict[str, Any]:
    return {
        "ok": True,
        "generated_at": now_iso(),
        "service": APP_NAME,
        "version": APP_VERSION,
        "fred_key_configured": bool(FRED_API_KEY),
        "cache_entries": len(_CACHE),
    }


@app.get("/catalog")
def catalog() -> Dict[str, Any]:
    return {
        "generated_at": now_iso(),
        "supported_codes": SUPPORTED_CODES,
        "default_codes": DEFAULT_CODES,
        "global_indices": GLOBAL_INDICES,
    }


@app.get("/quote/{code}", response_model=Quote)
def quote(code: str) -> Quote:
    code = code.strip().lower()
    resolver = RESOLVERS.get(code)
    if not resolver:
        raise HTTPException(status_code=404, detail=f"Unsupported code: {code}")
    try:
        return resolver()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.get("/quotes", response_model=QuotesResponse)
def quotes(codes: str = Query(",".join(DEFAULT_CODES), description="Comma-separated supported codes")) -> QuotesResponse:
    requested_codes = [c.strip().lower() for c in codes.split(",") if c.strip()]
    if not requested_codes:
        requested_codes = DEFAULT_CODES

    items: List[Quote] = []
    errors: List[Dict[str, str]] = []

    with ThreadPoolExecutor(max_workers=min(MAX_WORKERS, max(1, len(requested_codes)))) as pool:
        futures = {}
        for code in requested_codes:
            resolver = RESOLVERS.get(code)
            if not resolver:
                errors.append({"code": code, "error": "unsupported code"})
                continue
            futures[pool.submit(resolver)] = code

        for future in as_completed(futures):
            code = futures[future]
            try:
                items.append(future.result())
            except Exception as exc:
                errors.append({"code": code, "error": str(exc)})

    order = {code: idx for idx, code in enumerate(requested_codes)}
    items.sort(key=lambda item: order.get(item.code, 9999))
    return QuotesResponse(ok=len(errors) == 0, generated_at=now_iso(), items=items, errors=errors)


@app.get("/global-indices", response_model=QuotesResponse)
def global_indices() -> QuotesResponse:
    requested = list(GLOBAL_INDICES.items())
    items: List[Quote] = []
    errors: List[Dict[str, str]] = []

    def _fetch(code: str, cfg: Dict[str, str]) -> Quote:
        return yahoo_latest_quote(
            cfg["symbol"],
            code=code,
            label=cfg["label"],
            currency=cfg["currency"],
            unit="index_points",
        )

    with ThreadPoolExecutor(max_workers=min(MAX_WORKERS, len(requested))) as pool:
        futures = {pool.submit(_fetch, code, cfg): code for code, cfg in requested}
        for future in as_completed(futures):
            code = futures[future]
            try:
                items.append(future.result())
            except Exception as exc:
                errors.append({"code": code, "error": str(exc)})

    order = {code: idx for idx, (code, _) in enumerate(requested)}
    items.sort(key=lambda item: order.get(item.code, 9999))
    return QuotesResponse(ok=len(errors) == 0, generated_at=now_iso(), items=items, errors=errors)


@app.get("/yahoo/quote")
def yahoo_quote_endpoint(
    symbol: str = Query(..., description="Yahoo Finance symbol, e.g. ^DJI, BZ=F, GC=F, TTF=F"),
    currency: str = Query("USD"),
    unit: str = Query("raw"),
) -> Quote:
    clean = symbol.strip()
    if not clean:
        raise HTTPException(status_code=400, detail="symbol is required")
    try:
        return yahoo_latest_quote(
            clean,
            code=clean,
            label=clean,
            currency=currency,
            unit=unit,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
