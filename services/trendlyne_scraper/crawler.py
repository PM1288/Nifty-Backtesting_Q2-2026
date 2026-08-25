"""
crawler.py
==========
Handles all HTTP concerns for the PUBLIC Trendlyne listing pages:
  - session persistence + cookie support (a normal requests.Session)
  - User-Agent rotation
  - rate limiting (see utils.RateLimiter)
  - retry with exponential backoff
  - pagination by following the site's own "more" link (never guessing
    internal query params such as `qstime`)
  - checkpointing so a run can be resumed after an interruption
  - optional best-effort enrichment of stock pages (sector/industry/etc.)

Everything here only ever requests the public, unauthenticated listing
and stock-overview pages. It never submits credentials, never touches
`/get-document/...` binary content, and never attempts to work around
the `/visitor/loginmodal` gate.
"""
from __future__ import annotations

import json
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Iterator, List, Optional, Set
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests
from tqdm import tqdm

from bs4 import BeautifulSoup

from config import SETTINGS
from models import ReportRecord, synthetic_report_id
from nifty100 import Nifty100Universe, get_nifty100_universe, normalize_name_for_match
from parser import parse_listing_page, parse_stock_overview_page, find_next_page_url, STOCK_HREF_RE
from utils import LOGGER, RATE_LIMITER, random_user_agent, retry_with_backoff


class TrendlyneSession:
    """A rate-limited, retrying, cookie-persisting HTTP client."""

    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
        })

    @retry_with_backoff(retry_on=(requests.RequestException,))
    def get(self, url: str) -> requests.Response:
        RATE_LIMITER.wait()
        self.session.headers["User-Agent"] = random_user_agent()
        LOGGER.debug("GET %s", url)
        resp = self.session.get(url, timeout=SETTINGS.request_timeout_sec)
        if resp.status_code == 429:
            raise requests.RequestException(f"429 Too Many Requests for {url}")
        resp.raise_for_status()
        return resp


class Checkpoint:
    """Persists crawl progress so a run can be resumed after interruption."""

    def __init__(self, path: Path):
        self.path = path
        self.next_url: Optional[str] = None
        self.page_number: int = 0
        self.seen_report_ids: Set[str] = set()
        self.reached_cutoff: bool = False
        self._load()

    def _load(self):
        if self.path.exists():
            try:
                data = json.loads(self.path.read_text())
                self.next_url = data.get("next_url")
                self.page_number = data.get("page_number", 0)
                self.seen_report_ids = set(data.get("seen_report_ids", []))
                self.reached_cutoff = data.get("reached_cutoff", False)
                LOGGER.info(
                    "Loaded checkpoint: page %d, %d ids seen, next_url=%s",
                    self.page_number, len(self.seen_report_ids), self.next_url,
                )
            except (json.JSONDecodeError, OSError) as exc:
                LOGGER.warning("Could not load checkpoint (%s); starting fresh.", exc)

    def save(self):
        payload = {
            "next_url": self.next_url,
            "page_number": self.page_number,
            "seen_report_ids": list(self.seen_report_ids),
            "reached_cutoff": self.reached_cutoff,
            "saved_at": datetime.now(timezone.utc).isoformat(),
        }
        self.path.write_text(json.dumps(payload, indent=2))

    def reset(self):
        self.next_url = None
        self.page_number = 0
        self.seen_report_ids = set()
        self.reached_cutoff = False
        if self.path.exists():
            self.path.unlink()


class Crawler:
    def __init__(
        self,
        resume: bool = True,
        nifty100_only: Optional[bool] = None,
        nifty100_symbols_file: Optional[Path] = None,
        nifty100_refresh: bool = False,
        cutoff_date: Optional[datetime] = None,
        max_pages: Optional[int] = None,
        existing_report_ids: Optional[Set[str]] = None,
        stop_after_known_pages: int = 0,
    ):
        self.http = TrendlyneSession()
        self.checkpoint = Checkpoint(SETTINGS.checkpoint_path)
        if not resume:
            self.checkpoint.reset()

        # Explicit crawl window (--cutoff-date / --years) overrides the
        # default env-driven cutoff.
        self.cutoff_date = cutoff_date or SETTINGS.cutoff_date
        # Explicit safety-valve override (--max-pages).
        self.max_pages_per_run = max_pages or SETTINGS.max_pages_per_run
        self.existing_report_ids = set(existing_report_ids or set())
        self.stop_after_known_pages = max(0, stop_after_known_pages)

        self.stats = {
            "pages_scraped": 0,
            "reports_scraped": 0,
            "duplicates_removed": 0,
            "database_known_skipped": 0,
            "nifty100_filtered_out": 0,
            "errors": 0,
            "retries": 0,
            "started_at": time.time(),
        }
        self.stock_url_map: Dict[str, str] = {}

        # ---- NIFTY 100 universe (symbol + name matching) ------------------
        self.nifty100_only = SETTINGS.nifty100_only if nifty100_only is None else nifty100_only
        self.nifty100_universe: Optional[Nifty100Universe] = None
        self._nifty100_symbols: Set[str] = set()
        self._nifty100_names: Set[str] = set()
        if self.nifty100_only:
            self.nifty100_universe = get_nifty100_universe(
                session=self.http.session,
                manual_file=nifty100_symbols_file,
                force_refresh=nifty100_refresh,
                max_cache_age_days=SETTINGS.nifty100_cache_max_age_days,
            )
            self._nifty100_symbols = self.nifty100_universe.normalized_symbols()
            self._nifty100_names = self.nifty100_universe.normalized_names()
            LOGGER.info(
                "NIFTY 100 filter ON: %d symbols loaded (source=%s).",
                len(self._nifty100_symbols), self.nifty100_universe.source,
            )
        else:
            LOGGER.info("NIFTY 100 filter OFF: crawling all stocks.")

    def _is_nifty100(self, record: ReportRecord) -> bool:
        if not self.nifty100_only:
            return True
        if record.nse_symbol and record.nse_symbol.strip().upper() in self._nifty100_symbols:
            return True
        name = normalize_name_for_match(record.company_name or record.stock_name)
        return bool(name and name in self._nifty100_names)

    # ------------------------------------------------------------------
    def crawl(self) -> Iterator[List[ReportRecord]]:
        """Yields batches of ReportRecord, one batch per page, until the
        cutoff date is reached, the site runs out of pages, or the hard
        safety-valve max_pages_per_run is hit."""
        cutoff = self.cutoff_date
        url = self.checkpoint.next_url or (SETTINGS.base_url + SETTINGS.listing_path)
        page_num = self.checkpoint.page_number

        if self.checkpoint.reached_cutoff:
            LOGGER.info("Checkpoint indicates cutoff already reached; nothing to do.")
            return

        pbar = tqdm(desc="Crawling pages", unit="page")
        consecutive_known_pages = 0
        try:
            while url and page_num < self.max_pages_per_run:
                try:
                    resp = self.http.get(url)
                except Exception as exc:  # retries already exhausted inside .get
                    self.stats["errors"] += 1
                    LOGGER.error("Giving up on %s: %s", url, exc)
                    break

                page_num += 1
                self.stats["pages_scraped"] += 1
                records, stock_url_map = parse_listing_page(resp.text, url)
                self.stock_url_map.update(stock_url_map)

                new_records = []
                oldest_date_on_page = None
                for r in records:
                    # Date-cutoff tracking below must see every row on the
                    # page (including non-NIFTY100 ones), so filtering
                    # happens after that, not by skipping rows outright.
                    if r.report_date:
                        if oldest_date_on_page is None or r.report_date < oldest_date_on_page:
                            oldest_date_on_page = r.report_date

                    if not r.report_id:
                        r.report_id = synthetic_report_id(r.as_dict())
                    if r.report_id in self.checkpoint.seen_report_ids:
                        self.stats["duplicates_removed"] += 1
                        continue
                    self.checkpoint.seen_report_ids.add(r.report_id)

                    if r.report_id in self.existing_report_ids:
                        self.stats["database_known_skipped"] += 1
                        continue

                    if not self._is_nifty100(r):
                        self.stats["nifty100_filtered_out"] += 1
                        continue

                    new_records.append(r)

                self.stats["reports_scraped"] += len(new_records)
                pbar.update(1)
                pbar.set_postfix(reports=self.stats["reports_scraped"], page=page_num)

                if new_records:
                    yield new_records

                if records and not new_records:
                    consecutive_known_pages += 1
                else:
                    consecutive_known_pages = 0
                if self.stop_after_known_pages and consecutive_known_pages >= self.stop_after_known_pages:
                    LOGGER.info(
                        "Reached %d consecutive pages containing only existing report IDs; stopping incremental crawl.",
                        consecutive_known_pages,
                    )
                    break

                # Decide whether to keep going: stop once every report on
                # the page is older than the cutoff.
                if oldest_date_on_page and oldest_date_on_page < cutoff.strftime("%Y-%m-%d"):
                    LOGGER.info(
                        "Oldest report on page %d (%s) is before cutoff (%s); stopping.",
                        page_num, oldest_date_on_page, cutoff.strftime("%Y-%m-%d"),
                    )
                    self.checkpoint.reached_cutoff = True
                    self.checkpoint.page_number = page_num
                    self.checkpoint.next_url = None
                    self.checkpoint.save()
                    break

                next_url = find_next_page_url(resp.text, url)
                self.checkpoint.page_number = page_num
                self.checkpoint.next_url = next_url
                self.checkpoint.save()

                if not next_url or next_url == url:
                    LOGGER.info("No further pagination link found; stopping at page %d.", page_num)
                    break
                url = next_url
        finally:
            pbar.close()

        self.stats["elapsed_sec"] = time.time() - self.stats["started_at"]

    # ------------------------------------------------------------------
    def enrich_stock_pages(self, records: List[ReportRecord]) -> None:
        """Best-effort enrichment: fetch each unique stock's public
        overview page once and try to fill sector/industry/market cap.
        Off by default (config.ENRICH_STOCK_PAGES). Silently leaves
        fields as None if a page doesn't expose them publicly."""
        if not SETTINGS.enrich_stock_pages:
            return

        unique_symbols = {r.nse_symbol for r in records if r.nse_symbol and r.nse_symbol in self.stock_url_map}
        LOGGER.info("Enriching %d unique stock symbols (best effort)...", len(unique_symbols))

        cache: Dict[str, dict] = {}

        def fetch_one(symbol: str) -> Optional[dict]:
            stock_url = self.stock_url_map.get(symbol)
            if not stock_url:
                return None
            try:
                resp = self.http.get(stock_url)
            except Exception as exc:
                LOGGER.debug("Enrichment fetch failed for %s (%s): %s", symbol, stock_url, exc)
                return None
            return parse_stock_overview_page(resp.text)

        with ThreadPoolExecutor(max_workers=SETTINGS.max_workers) as pool:
            futures = {pool.submit(fetch_one, s): s for s in unique_symbols}
            for fut in as_completed(futures):
                symbol = futures[fut]
                try:
                    data = fut.result()
                except Exception as exc:
                    LOGGER.debug("Enrichment failed for %s: %s", symbol, exc)
                    data = None
                if data:
                    cache[symbol] = data

        if cache:
            for r in records:
                extra = cache.get(r.nse_symbol)
                if extra:
                    r.sector = r.sector or extra.get("sector")
                    r.industry = r.industry or extra.get("industry")
                    r.market_cap = r.market_cap or extra.get("market_cap")
                    r.bse_symbol = r.bse_symbol or extra.get("bse_symbol")
                    r.isin = r.isin or extra.get("isin")
