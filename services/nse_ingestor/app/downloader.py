from __future__ import annotations

import logging
import hashlib
import tempfile
import json
import time
from urllib.parse import urlencode
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any

import requests

from .utils import fmt_ctx

logger = logging.getLogger(__name__)


@dataclass
class DownloadResult:
    report_name: str
    source_date: date
    file_name: str
    path: Path


class Downloader:
    def __init__(self, staging_dir: Path, timeout_seconds: int, user_agent: str) -> None:
        self.staging_dir = staging_dir
        self.timeout_seconds = timeout_seconds
        self._last_request = 0.0
        self.last_attempts: list[dict[str, Any]] = []
        self.session = requests.Session()
        self.session.headers.update(
            {
                "User-Agent": user_agent,
                "Accept": "*/*",
                "Referer": "https://www.nseindia.com/all-reports",
                "Connection": "keep-alive",
            }
        )

    def download_report(self, report_name: str, source_date: date, report_config: dict[str, Any]) -> DownloadResult | None:
        self.last_attempts = []
        file_name = report_config["filename"].format(**fmt_ctx(source_date))
        url_candidates = [
            template.format(**fmt_ctx(source_date))
            for template in report_config.get("url_candidates", [])
        ]
        if report_config.get("reports_api_name"):
            descriptor = [{"name": report_config["reports_api_name"], "type": "archives", "category": report_config.get("category", "derivatives"), "section": "equity"}]
            url_candidates.append("https://www.nseindia.com/api/reports?" + urlencode({"archives": json.dumps(descriptor, separators=(",", ":")), "date": source_date.strftime("%d-%b-%Y"), "type": "equity", "mode": "single"}))
        target_dir = self.staging_dir / source_date.isoformat()
        target_dir.mkdir(parents=True, exist_ok=True)
        target = target_dir / file_name

        if Path(file_name).name != file_name:
            raise ValueError("Report filename must not contain a directory")

        for url in url_candidates:
            partial = None
            attempt: dict[str, Any] = {"url": url}
            self.last_attempts.append(attempt)
            try:
                logger.info("Trying %s for %s", url, file_name)
                time.sleep(max(0.0, 1.0 - (time.monotonic() - self._last_request)))
                self._last_request = time.monotonic()
                with self.session.get(url, timeout=(5, min(self.timeout_seconds, 30)), stream=True) as r:
                    attempt["http_status"] = r.status_code
                    if r.status_code != 200:
                        logger.warning("Download failed status=%s url=%s", r.status_code, url)
                        continue
                    if any(kind in r.headers.get("Content-Type", "").lower() for kind in ("html", "json")):
                        raise ValueError("NSE returned an HTML/JSON response instead of a report file")
                    digest = hashlib.sha256()
                    size = 0
                    prefix = b""
                    with tempfile.NamedTemporaryFile(dir=target_dir, prefix=".report-", suffix=".part", delete=False) as f:
                        partial = Path(f.name)
                        for chunk in r.iter_content(chunk_size=1024 * 1024):
                            if chunk:
                                size += len(chunk)
                                if size > 128 * 1024 * 1024:
                                    raise ValueError("Report exceeds the 128 MiB download safety limit")
                                if len(prefix) < 512:
                                    prefix += chunk[:512-len(prefix)]
                                digest.update(chunk)
                                f.write(chunk)
                    head = prefix.lstrip().lower()
                    if not size or head.startswith((b"<!doctype html", b"<html", b"{\"error", b"access denied", b"forbidden")):
                        raise ValueError("Empty or error response is not a report")
                    if file_name.lower().endswith(".zip") and not prefix.startswith(b"PK\x03\x04"):
                        raise ValueError("Invalid ZIP report signature")
                    if file_name.lower().endswith(".gz") and not prefix.startswith(b"\x1f\x8b"):
                        raise ValueError("Invalid gzip report signature")
                    # Only a completely received, validated response replaces the
                    # staged report. A failed retry cannot destroy a good copy.
                    partial.replace(target)
                    attempt.update({"bytes": size, "sha256": digest.hexdigest(), "state": "downloaded"})
                    logger.info("Downloaded report=%s date=%s bytes=%s sha256=%s url=%s", report_name, source_date, size, digest.hexdigest(), url)
                    return DownloadResult(report_name=report_name, source_date=source_date, file_name=file_name, path=target)
            except Exception as exc:
                attempt["error"] = str(exc)[:500]
                logger.warning("Download attempt failed for %s from %s: %s", file_name, url, exc)
                continue
            finally:
                if partial is not None:
                    partial.unlink(missing_ok=True)
        return None
