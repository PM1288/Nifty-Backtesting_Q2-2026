"""
parser.py
=========
Parses the PUBLIC, unauthenticated HTML of
https://trendlyne.com/research-reports/all/ (and its ?page=N successors)
into ReportRecord objects.

Design notes
------------
Rather than hard-coding brittle CSS class names (which this site, like
most, can and does change), the parser:

  1. Locates the results table by finding the header row that contains
     "Date" and "Stock" (semantic anchor, more stable than class names).
  2. Maps header text -> column index dynamically, so a reordering of
     columns doesn't silently misalign data.
  3. For links, scans every <a> in a row and matches by *href pattern*
     (e.g. "/research-reports/stock/", "/research-reports/broker/",
     "/posts/", "/get-document/", "/visitor/loginmodal") rather than by
     position - hrefs are far more stable than nesting/markup.

This was verified against a live fetch of the listing page on
2026-08-04. If Trendlyne changes their markup, update the HEADER_ALIASES
/ href-pattern constants below rather than rewriting the whole parser.
"""
from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import List, Optional
from urllib.parse import urljoin

from bs4 import BeautifulSoup, Tag

from models import ReportRecord
from utils import (
    LOGGER,
    clean_text,
    extract_recommendation,
    normalize_broker_name,
    normalize_company_name,
    normalize_date,
    normalize_percent,
    normalize_price,
    normalize_report_type,
)
from config import SETTINGS

STOCK_HREF_RE = re.compile(r"/research-reports/stock/(\d+)/([A-Za-z0-9\-\.&]+)/")
BROKER_HREF_RE = re.compile(r"/research-reports/broker/")
POST_HREF_RE = re.compile(r"/posts/(\d+)/")
PDF_DOC_HREF_RE = re.compile(r"/get-document/")
LOGIN_WALL_HREF_RE = re.compile(r"/visitor/loginmodal")
NEXT_PAGE_HREF_RE = re.compile(r"[?&]page=(\d+)")

PRICE_CHANGE_RE = re.compile(r"([\-\d,\.]+)\s*\(\s*(-?[\d,\.]+)\s*%\s*\)")


def _find_results_table(soup: BeautifulSoup) -> Optional[Tag]:
    for table in soup.find_all("table"):
        header_text = " ".join(th.get_text(" ", strip=True) for th in table.find_all("th"))
        if "Date" in header_text and "Stock" in header_text:
            return table
    return None


def _header_index_map(table: Tag) -> dict:
    headers = table.find_all("th")
    idx = {}
    for i, th in enumerate(headers):
        label = clean_text(th.get_text(" ", strip=True)) or ""
        idx[label.lower()] = i
    return idx


def _col(cells: List[Tag], header_map: dict, *aliases: str) -> Optional[Tag]:
    for alias in aliases:
        i = header_map.get(alias.lower())
        if i is not None and i < len(cells):
            return cells[i]
    return None


def _extract_price_and_change(text: Optional[str]):
    """'949.20 (2.49%)' -> (949.20, 2.49)"""
    if not text:
        return None, None
    m = PRICE_CHANGE_RE.search(text)
    if not m:
        return normalize_price(text), None
    return normalize_price(m.group(1)), normalize_percent(m.group(2))


def parse_listing_page(html: str, page_url: str):
    """Parse one listing page's HTML.

    Returns (records, stock_url_map) where stock_url_map maps
    nse_symbol -> absolute stock-overview URL, collected as a side
    effect so an optional enrichment pass can fetch each unique stock
    page without re-deriving its URL.
    """
    soup = BeautifulSoup(html, "html.parser")
    table = _find_results_table(soup)
    stock_url_map: dict = {}
    if table is None:
        LOGGER.warning("No results table found on %s", page_url)
        return [], stock_url_map

    header_map = _header_index_map(table)
    body = table.find("tbody") or table
    rows = body.find_all("tr")

    records: List[ReportRecord] = []
    scraped_at = datetime.now(timezone.utc).isoformat()

    for row in rows:
        cells = row.find_all("td")
        if not cells:
            continue  # header row

        record = ReportRecord()
        record.scraped_timestamp = scraped_at
        record.source = SETTINGS.source_name
        record.exchange = SETTINGS.default_exchange
        record.currency = SETTINGS.default_currency

        # ---- Date ------------------------------------------------------
        date_cell = _col(cells, header_map, "date")
        record.report_date = normalize_date(date_cell.get_text(" ", strip=True) if date_cell else None)
        record.published_date = record.report_date

        # ---- Stock -------------------------------------------------------
        stock_cell = _col(cells, header_map, "stock")
        stock_link = None
        if stock_cell is not None:
            stock_link = stock_cell.find("a", href=STOCK_HREF_RE)
        if stock_link is not None:
            record.stock_name = normalize_company_name(stock_link.get_text(" ", strip=True))
            record.company_name = record.stock_name
            m = STOCK_HREF_RE.search(stock_link["href"])
            if m:
                record.nse_symbol = m.group(2).upper()
                stock_url_map[record.nse_symbol] = urljoin(SETTINGS.base_url, stock_link["href"])

        # ---- Broker --------------------------------------------------------
        author_cell = _col(cells, header_map, "author")
        broker_link = None
        if author_cell is not None:
            broker_link = author_cell.find("a", href=BROKER_HREF_RE)
        else:
            broker_link = row.find("a", href=BROKER_HREF_RE)
        if broker_link is not None:
            record.broker_name = normalize_broker_name(broker_link.get_text(" ", strip=True))
            record.research_house = record.broker_name

        # Trendlyne shows small "Reco" / "Target" change badges next to the
        # broker name when this report changed the recommendation and/or
        # target vs. the broker's previous report on the same stock.
        author_text = author_cell.get_text(" ", strip=True) if author_cell else ""
        record.rating_change = "reco" in author_text.lower().split(record.broker_name or " ")[0].lower() \
            if record.broker_name else None
        # More robust: check sibling text nodes around the broker link.
        badge_text = clean_text(author_cell.get_text(" ", strip=True)) if author_cell else None
        if badge_text and record.broker_name:
            remainder = badge_text.replace(record.broker_name, "").lower()
            record.rating_change = "reco" in remainder or None
            record.target_change = "target" in remainder or None

        # ---- Prices ------------------------------------------------------
        ltp_cell = _col(cells, header_map, "ltp")
        record.cmp = normalize_price(ltp_cell.get_text(strip=True)) if ltp_cell else None

        target_cell = _col(cells, header_map, "target")
        record.target_price = normalize_price(target_cell.get_text(strip=True)) if target_cell else None

        reco_price_cell = _col(cells, header_map, "price at reco   (change since reco%)",
                                "price at reco", "price at reco (change since reco%)")
        if reco_price_cell is not None:
            price_at_reco, change_pct = _extract_price_and_change(reco_price_cell.get_text(" ", strip=True))
            record.price_at_recommendation = price_at_reco
            # "change since reco%" is price drift, not upside - keep separate,
            # it is not one of the requested fields so we don't overwrite upside.

        upside_cell = _col(cells, header_map, "upside(%)", "upside")
        record.upside_pct = normalize_percent(upside_cell.get_text(strip=True)) if upside_cell else None
        if record.upside_pct is not None and record.upside_pct < 0:
            record.downside_pct = abs(record.upside_pct)

        if record.target_price is not None and record.price_at_recommendation is not None:
            record.absolute_gain_potential = round(
                record.target_price - record.price_at_recommendation, 4
            )

        # ---- Type / Recommendation ------------------------------------------
        type_cell = _col(cells, header_map, "type")
        type_text = type_cell.get_text(strip=True) if type_cell else None
        record.report_type = normalize_report_type(type_text)
        record.recommendation = extract_recommendation(type_text)

        # ---- Report title / urls / summary (scan whole row for hrefs) --------
        post_link = row.find("a", href=POST_HREF_RE)
        if post_link is not None:
            record.report_url = urljoin(SETTINGS.base_url, post_link["href"])
            m = POST_HREF_RE.search(post_link["href"])
            if m:
                record.report_id = m.group(1)

        # Title is usually the anchor whose href points at the pdf/document
        # endpoint; its visible text is the report's headline.
        doc_link = row.find("a", href=PDF_DOC_HREF_RE)
        if doc_link is not None:
            title_text = clean_text(doc_link.get_text(" ", strip=True))
            if title_text:
                record.report_title = title_text
            record.pdf_url = urljoin(SETTINGS.base_url, doc_link["href"])
            if not record.report_id:
                m = re.search(r"/pdf/(\d+)/", doc_link["href"])
                if m:
                    record.report_id = m.group(1)

        if not record.pdf_url:
            login_wall_link = row.find("a", href=LOGIN_WALL_HREF_RE)
            if login_wall_link is not None:
                # Explicitly gated - we record the href as-is (it is public
                # markup on the page) but do not attempt to authenticate,
                # log in, or fetch the gated document.
                record.pdf_url = urljoin(SETTINGS.base_url, login_wall_link["href"])

        report_col = _col(cells, header_map, "report")
        if report_col is not None:
            # Work on a copy so we don't mutate the tree other extraction
            # steps might still rely on. Strip every <a> (title/pdf/post/
            # cache/share links) so only plain boilerplate + the free-text
            # summary remains, then strip the known boilerplate phrases.
            import copy
            col_copy = copy.copy(report_col)
            for a in col_copy.find_all("a"):
                a.decompose()
            remainder = clean_text(col_copy.get_text(" ", strip=True))
            if remainder:
                for chunk in ("Broker Report", record.broker_name or "", "Copy Link", "Alert"):
                    if chunk:
                        remainder = remainder.replace(chunk, " ")
                remainder = clean_text(remainder)
            record.summary = remainder
            record.description = remainder

        if not record.report_id and record.report_url:
            m = re.search(r"(\d+)", record.report_url)
            if m:
                record.report_id = m.group(1)

        # Skip fully empty rows (defensive: e.g. ad rows, spacer rows).
        if not any([record.report_date, record.stock_name, record.broker_name, record.report_title]):
            continue

        records.append(record)

    return records, stock_url_map


def parse_stock_overview_page(html: str) -> dict:
    """Best-effort extraction of sector/industry/market cap/BSE symbol/ISIN
    from a stock's public overview page. Trendlyne renders this
    information as label/value pairs in varying markup (definition
    lists, spans, table cells) depending on the page template, so this
    looks for a label's text and takes the next sibling-ish value rather
    than a single fixed selector. Any field not found stays None -
    nothing here is guessed or fabricated.
    """
    soup = BeautifulSoup(html, "html.parser")
    result = {"sector": None, "industry": None, "market_cap": None,
              "bse_symbol": None, "isin": None}

    label_map = {
        "sector": "sector",
        "industry": "industry",
        "market cap": "market_cap",
        "bse code": "bse_symbol",
        "bse symbol": "bse_symbol",
        "isin": "isin",
    }

    # Strategy A: <dt>Label</dt><dd>Value</dd>
    for dt in soup.find_all("dt"):
        label = clean_text(dt.get_text(" ", strip=True) or "").lower()
        key = label_map.get(label)
        if key and not result[key]:
            dd = dt.find_next_sibling("dd")
            if dd:
                result[key] = clean_text(dd.get_text(" ", strip=True))

    # Strategy B: generic "<label-ish tag>Label</...><value-ish tag>Value</...>"
    # pairs inside a common parent (covers span/div-based layouts).
    for label_text, key in label_map.items():
        if result[key]:
            continue
        node = soup.find(string=re.compile(rf"^\s*{re.escape(label_text)}\s*$", re.I))
        if node and node.parent:
            parent = node.parent
            sib = parent.find_next_sibling()
            if sib:
                val = clean_text(sib.get_text(" ", strip=True))
                if val and val.lower() != label_text.lower():
                    result[key] = val

    return result


def find_next_page_url(html: str, current_url: str) -> Optional[str]:
    """Follow the site's own 'more'/next-page link rather than guessing
    query parameters ourselves - Trendlyne's pagination link includes a
    'qstime' token that we do not want to fabricate."""
    soup = BeautifulSoup(html, "html.parser")
    candidates = soup.find_all("a", href=NEXT_PAGE_HREF_RE)
    for a in candidates:
        text = (a.get_text(" ", strip=True) or "").lower()
        if "more" in text or "next" in text:
            return urljoin(current_url, a["href"])
    # Fallback: any pagination-looking link with a higher page number.
    if candidates:
        return urljoin(current_url, candidates[0]["href"])
    return None
