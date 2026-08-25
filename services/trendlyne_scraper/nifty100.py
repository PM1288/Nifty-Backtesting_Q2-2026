"""
nifty100.py
===========
Resolves the current NIFTY 100 constituent list (symbol + company name)
so the crawler can filter Trendlyne's research-reports listing down to
just those ~100 stocks.

Why this isn't a hard-coded list
---------------------------------
NIFTY 100 (NIFTY 50 + NIFTY Next 50) is reconstituted twice a year
(reviews effective ~end of January and ~end of July), and individual
names can also change between reviews on corporate actions. Baking a
symbol list into source code would silently go stale and start
under/over-filtering with no warning. Instead this module, in order:

  1. Uses a locally cached copy (`data/nifty100_constituents.csv`) if
     it was refreshed within `NIFTY100_CACHE_MAX_AGE_DAYS` (default 7).
  2. Otherwise tries to fetch NSE's own official constituent CSV
     (the same file NSE publishes for anyone to download) and refreshes
     the cache.
  3. Falls back to a stale cache (with a loud warning) if the fetch
     fails, e.g. no network access to nseindia.com from this machine.
  4. If nothing is available at all, raises a clear error rather than
     silently crawling every stock or an empty set - it's better to
     stop than to quietly produce wrong "Nifty100-only" data.

You can always bypass all of this with `--symbols-file path.csv`
(main.py) if you already have a constituent file you trust (e.g.
downloaded by hand from https://www.niftyindices.com/indices/equity/broad-based-indices/nifty-100).
"""
from __future__ import annotations

import csv
import io
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Optional, Set

import requests

from config import SETTINGS
from utils import LOGGER, clean_text

# NSE has moved this archive between a couple of hostnames over time;
# try each in order and use whichever responds.
NSE_NIFTY100_CSV_URLS = (
    "https://nsearchives.nseindia.com/content/indices/ind_nifty100list.csv",
    "https://archives.nseindia.com/content/indices/ind_nifty100list.csv",
)

# NSE's site blocks requests that don't look like a real browser session;
# a plain GET to the CSV usually 403s without first "visiting" nseindia.com
# to pick up cookies. This mirrors a normal browser, nothing adversarial.
_NSE_WARMUP_URL = "https://www.nseindia.com/market-data/live-equity-market"
_NSE_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}


@dataclass
class Nifty100Universe:
    """symbol (upper-cased, as NSE publishes it) -> company name"""
    symbols: Dict[str, str]
    source: str            # "cache" / "nse-live" / "manual-file"
    fetched_at: Optional[str]

    def normalized_symbols(self) -> Set[str]:
        return {s.strip().upper() for s in self.symbols if s}

    def normalized_names(self) -> Set[str]:
        return {normalize_name_for_match(n) for n in self.symbols.values() if n}


def normalize_name_for_match(name: Optional[str]) -> Optional[str]:
    if not name:
        return None
    n = name.upper().strip()
    for suffix in (" LIMITED", " LTD.", " LTD"):
        if n.endswith(suffix):
            n = n[: -len(suffix)]
    for junk in (".", ",", "'"):
        n = n.replace(junk, "")
    return " ".join(n.split())


def _parse_nse_csv(text: str) -> Dict[str, str]:
    """NSE's ind_nifty100list.csv has columns:
    'Company Name','Industry','Symbol','Series','ISIN Code'
    """
    out: Dict[str, str] = {}
    reader = csv.DictReader(io.StringIO(text))
    for row in reader:
        symbol = clean_text(row.get("Symbol") or row.get("SYMBOL") or "")
        company = clean_text(row.get("Company Name") or row.get("COMPANY NAME") or "")
        if symbol:
            out[symbol.upper()] = company or symbol
    return out


def fetch_from_nse(session: Optional[requests.Session] = None) -> Dict[str, str]:
    """Best-effort live fetch of NSE's official NIFTY 100 constituent CSV.
    Raises on failure (caller decides how to fall back)."""
    sess = session or requests.Session()
    sess.headers.update(_NSE_HEADERS)

    # Warm-up request so nseindia.com sets its usual cookies; ignore
    # failures here and just try the CSV directly if this doesn't work.
    try:
        sess.get(_NSE_WARMUP_URL, timeout=SETTINGS.request_timeout_sec)
    except requests.RequestException:
        pass

    last_exc: Optional[Exception] = None
    for url in NSE_NIFTY100_CSV_URLS:
        try:
            resp = sess.get(url, timeout=SETTINGS.request_timeout_sec)
            resp.raise_for_status()
            data = _parse_nse_csv(resp.text)
            if len(data) >= 90:  # sanity check - should be ~100 rows
                LOGGER.info("Fetched %d NIFTY 100 constituents from %s", len(data), url)
                return data
            LOGGER.warning("NSE CSV from %s parsed to only %d rows; trying next URL.", url, len(data))
        except requests.RequestException as exc:
            last_exc = exc
            LOGGER.debug("NIFTY 100 fetch failed for %s: %s", url, exc)
    raise RuntimeError(f"Could not fetch NIFTY 100 list from NSE: {last_exc}")


def load_cache(path: Path) -> Optional[Nifty100Universe]:
    if not path.exists():
        return None
    try:
        with path.open("r", newline="", encoding="utf-8") as f:
            first_line = f.readline()
            fetched_at = None
            if first_line.startswith("#"):
                fetched_at = first_line.lstrip("#").strip()
            else:
                f.seek(0)
            reader = csv.DictReader(f)
            data = {
                row["symbol"].upper(): row["company_name"]
                for row in reader
                if row.get("symbol")
            }
        if not data:
            return None
        return Nifty100Universe(symbols=data, source="cache", fetched_at=fetched_at)
    except (OSError, csv.Error, KeyError) as exc:
        LOGGER.warning("Could not read NIFTY 100 cache at %s: %s", path, exc)
        return None


def save_cache(path: Path, data: Dict[str, str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as f:
        f.write(f"# fetched_at={time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}\n")
        writer = csv.writer(f)
        writer.writerow(["symbol", "company_name"])
        for symbol, company in sorted(data.items()):
            writer.writerow([symbol, company])


def load_manual_file(path: Path) -> Nifty100Universe:
    """Load a user-supplied CSV (columns: symbol[,company_name]) via
    --symbols-file. This always wins over cache/live fetch."""
    with path.open("r", newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        fieldnames = [c.lower() for c in (reader.fieldnames or [])]
        data: Dict[str, str] = {}
        if "symbol" in fieldnames:
            for row in reader:
                sym = clean_text(row.get("symbol") or row.get("Symbol") or "")
                if sym:
                    data[sym.upper()] = clean_text(
                        row.get("company_name") or row.get("Company Name") or sym
                    )
        else:
            # No header - treat as one symbol per line.
            f.seek(0)
            for line in f:
                sym = clean_text(line.strip().strip(","))
                if sym:
                    data[sym.upper()] = sym
    if not data:
        raise ValueError(f"No symbols parsed from {path}")
    return Nifty100Universe(symbols=data, source=f"manual-file:{path}", fetched_at=None)


def get_nifty100_universe(
    session: Optional[requests.Session] = None,
    manual_file: Optional[Path] = None,
    force_refresh: bool = False,
    max_cache_age_days: int = 7,
) -> Nifty100Universe:
    """Resolve the NIFTY 100 universe using the priority described in
    the module docstring."""
    if manual_file is not None:
        universe = load_manual_file(manual_file)
        LOGGER.info("Loaded %d NIFTY 100 symbols from %s", len(universe.symbols), manual_file)
        return universe

    cache_path = SETTINGS.nifty100_cache_path
    cached = None if force_refresh else load_cache(cache_path)
    if cached is not None:
        age_days = None
        if cached.fetched_at:
            try:
                fetched_ts = time.strptime(cached.fetched_at.split("=", 1)[-1], "%Y-%m-%dT%H:%M:%SZ")
                age_days = (time.time() - time.mktime(fetched_ts)) / 86400.0
            except ValueError:
                age_days = None
        if age_days is not None and age_days <= max_cache_age_days:
            LOGGER.info(
                "Using cached NIFTY 100 list (%d symbols, %.1f days old).",
                len(cached.symbols), age_days,
            )
            return cached

    try:
        data = fetch_from_nse(session)
        save_cache(cache_path, data)
        return Nifty100Universe(symbols=data, source="nse-live", fetched_at="just now")
    except Exception as exc:
        LOGGER.warning("Live NIFTY 100 fetch failed (%s).", exc)
        if cached is not None:
            LOGGER.warning(
                "Falling back to STALE cached NIFTY 100 list (%d symbols, fetched %s). "
                "Run with --refresh-nifty100 once you have network access to nseindia.com "
                "to update it, or pass --symbols-file with your own list.",
                len(cached.symbols), cached.fetched_at,
            )
            return cached
        raise RuntimeError(
            "Could not resolve a NIFTY 100 constituent list: no live fetch, no cache, "
            "no --symbols-file supplied. Pass --symbols-file <path.csv> with a symbol "
            "list (e.g. downloaded by hand from niftyindices.com) to proceed, or run "
            "with --all-stocks to crawl without filtering."
        ) from exc
