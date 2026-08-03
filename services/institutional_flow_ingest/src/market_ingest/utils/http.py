from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Callable
from urllib.parse import urlparse

import httpx
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

logger = logging.getLogger(__name__)

NSDL_HOSTS = {"www.fpi.nsdl.co.in", "fpi.nsdl.co.in"}
NSE_HOSTS = {"www.nseindia.com", "nseindia.com"}


class DownloadValidationError(RuntimeError):
    """Raised when a downloaded file is obviously invalid."""


@dataclass(slots=True)
class HttpDownload:
    source_url: str
    content: bytes
    content_type: str
    status_code: int


class HttpClient:
    def __init__(
        self,
        user_agent: str,
        timeout_seconds: int,
        max_retries: int,
        polite_pause_seconds: float,
        browser_fetcher: Callable[[str], str] | None = None,
    ) -> None:
        self.browser_fetcher = browser_fetcher
        self.polite_pause_seconds = polite_pause_seconds
        self.session = httpx.Client(
            timeout=timeout_seconds,
            headers={
                "User-Agent": user_agent,
                "Accept": "*/*",
                "Accept-Language": "en-US,en;q=0.9",
                "Referer": "https://www.nseindia.com/",
                "Connection": "keep-alive",
            },
            follow_redirects=True,
        )
        self._retry = retry(
            reraise=True,
            retry=retry_if_exception_type((httpx.HTTPError, DownloadValidationError)),
            stop=stop_after_attempt(max_retries),
            wait=wait_exponential(multiplier=1, min=1, max=20),
        )
        self._retry_text = retry(
            reraise=True,
            retry=retry_if_exception_type(httpx.HTTPError),
            stop=stop_after_attempt(max_retries),
            wait=wait_exponential(multiplier=1, min=1, max=20),
        )

    def _request_headers(self, url: str) -> dict[str, str]:
        host = (urlparse(url).hostname or "").lower()
        if host in NSDL_HOSTS:
            return {
                "Referer": "https://www.fpi.nsdl.co.in/",
                "Origin": "https://www.fpi.nsdl.co.in",
            }
        if host in NSE_HOSTS:
            return {"Referer": "https://www.nseindia.com/"}
        return {}

    def _fetch_text_impl(self, url: str) -> str:
        response = self.session.get(url, headers=self._request_headers(url))
        response.raise_for_status()
        time.sleep(self.polite_pause_seconds)
        return response.text

    def fetch_text(self, url: str) -> str:
        wrapped = self._retry_text(self._fetch_text_impl)
        return wrapped(url)

    def fetch_with_optional_browser(self, url: str) -> str:
        try:
            return self.fetch_text(url)
        except httpx.HTTPError:
            if self.browser_fetcher is None:
                raise
            logger.info("browser_fallback", extra={"source_url": url, "step": "browser_bootstrap"})
            return self.browser_fetcher(url)

    def _download_impl(self, url: str, allow_html: bool = False) -> HttpDownload:
        response = self.session.get(url, headers=self._request_headers(url))
        if response.status_code != 200:
            raise DownloadValidationError(f"unexpected status {response.status_code}")
        content = response.content
        content_type = response.headers.get("Content-Type", "")
        if not content:
            raise DownloadValidationError("zero-byte payload")
        sample = content[:512].lower()
        if not allow_html and b"<html" in sample and b"csv" not in sample and b"json" not in sample:
            raise DownloadValidationError("html error page downloaded instead of file")
        time.sleep(self.polite_pause_seconds)
        return HttpDownload(url, content, content_type, response.status_code)

    def download(self, url: str, allow_html: bool = False) -> HttpDownload:
        wrapped = self._retry(self._download_impl)
        return wrapped(url, allow_html)
