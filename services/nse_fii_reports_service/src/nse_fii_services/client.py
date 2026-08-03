from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
import logging
from typing import Any

import requests
from requests import Response, Session
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from .endpoints import REPORT_SPECS, ReportSpec, parse_trade_date

LOGGER = logging.getLogger(__name__)

DEFAULT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/136.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Connection": "keep-alive",
}


class NSEReportNotFound(FileNotFoundError):
    """Raised when the requested report does not exist for a date."""


@dataclass(frozen=True)
class DownloadedReport:
    report_key: str
    trade_date: str
    source_url: str
    filename: str
    content: bytes


class NSEFIIReportsClient:
    """Small HTTP client for the three F&O reports used by the workbook.

    The client prefers direct archive URLs because they are the least moving parts.
    It can also try the general NSE reports endpoint as a secondary fallback.
    """

    def __init__(
        self,
        timeout: int = 30,
        session: Session | None = None,
        enable_reports_api_fallback: bool = True,
    ) -> None:
        self.timeout = timeout
        self.session = session or self._build_session()
        self.enable_reports_api_fallback = enable_reports_api_fallback
        self._cookie_primed = False

    @staticmethod
    def _build_session() -> Session:
        session = requests.Session()
        session.headers.update(DEFAULT_HEADERS)
        retry = Retry(
            total=3,
            connect=3,
            read=3,
            backoff_factor=0.8,
            status_forcelist=(429, 500, 502, 503, 504),
            allowed_methods=("GET",),
            raise_on_status=False,
        )
        adapter = HTTPAdapter(max_retries=retry)
        session.mount("https://", adapter)
        session.mount("http://", adapter)
        return session

    def _prime_cookie(self) -> None:
        if self._cookie_primed:
            return
        # This mirrors the usual public-site workflow for NSE pages.
        for url in (
            "https://www.nseindia.com",
            "https://www.nseindia.com/all-reports-derivatives",
        ):
            try:
                self.session.get(url, timeout=self.timeout)
            except requests.RequestException:
                # Direct archive files often work without cookie priming, so this
                # is best-effort rather than fatal.
                LOGGER.debug("Cookie priming request failed for %s", url, exc_info=True)
        self._cookie_primed = True

    def _get(self, url: str, *, referer: str | None = None) -> Response:
        headers = dict(DEFAULT_HEADERS)
        if referer:
            headers["Referer"] = referer
        return self.session.get(url, headers=headers, timeout=self.timeout)

    def fetch_report(self, report_key: str, trade_date: str | datetime) -> DownloadedReport:
        spec = REPORT_SPECS[report_key]
        trade_dt = parse_trade_date(trade_date)

        for url in spec.archive_urls(trade_dt):
            LOGGER.info("Trying archive URL %s", url)
            response = self._get(url)
            if response.status_code == 200 and response.content:
                return DownloadedReport(
                    report_key=report_key,
                    trade_date=trade_dt.strftime("%d-%m-%Y"),
                    source_url=url,
                    filename=url.rsplit("/", 1)[-1],
                    content=response.content,
                )
            if response.status_code not in (403, 404):
                LOGGER.debug(
                    "Unexpected status %s for %s: %s",
                    response.status_code,
                    url,
                    response.text[:200],
                )

        if self.enable_reports_api_fallback:
            self._prime_cookie()
            api_url = spec.reports_api_url(trade_dt)
            LOGGER.info("Trying reports API URL %s", api_url)
            response = self._get(api_url, referer="https://www.nseindia.com/all-reports-derivatives")
            content_type = (response.headers.get("Content-Type") or "").lower()
            if response.status_code == 200 and response.content and "html" not in content_type:
                return DownloadedReport(
                    report_key=report_key,
                    trade_date=trade_dt.strftime("%d-%m-%Y"),
                    source_url=api_url,
                    filename=self._fallback_filename(spec, trade_dt),
                    content=response.content,
                )

        raise NSEReportNotFound(
            f"No {report_key!r} report found for {trade_dt.strftime('%d-%m-%Y')}"
        )

    def fetch_all_reports(self, trade_date: str | datetime) -> dict[str, DownloadedReport]:
        return {key: self.fetch_report(key, trade_date) for key in REPORT_SPECS}

    @staticmethod
    def _fallback_filename(spec: ReportSpec, trade_dt: datetime) -> str:
        if spec.key == "fii_stats":
            return f"fii_stats_{trade_dt.strftime('%d-%b-%Y')}.{spec.file_ext}"
        stem = {
            "participant_oi": "fao_participant_oi",
            "participant_volume": "fao_participant_vol",
        }[spec.key]
        return f"{stem}_{trade_dt.strftime('%d%m%Y')}.{spec.file_ext}"
