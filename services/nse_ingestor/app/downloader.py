from __future__ import annotations

import logging
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
        file_name = report_config["filename"].format(**fmt_ctx(source_date))
        url_candidates = [
            template.format(**fmt_ctx(source_date))
            for template in report_config.get("url_candidates", [])
        ]
        target_dir = self.staging_dir / source_date.isoformat()
        target_dir.mkdir(parents=True, exist_ok=True)
        target = target_dir / file_name

        for url in url_candidates:
            try:
                logger.info("Trying %s for %s", url, file_name)
                with self.session.get(url, timeout=self.timeout_seconds, stream=True) as r:
                    if r.status_code != 200:
                        logger.warning("Download failed status=%s url=%s", r.status_code, url)
                        continue
                    with target.open("wb") as f:
                        for chunk in r.iter_content(chunk_size=1024 * 1024):
                            if chunk:
                                f.write(chunk)
                    logger.info("Downloaded %s -> %s", file_name, target)
                    return DownloadResult(report_name=report_name, source_date=source_date, file_name=file_name, path=target)
            except Exception as exc:
                logger.warning("Download attempt failed for %s from %s: %s", file_name, url, exc)
                continue
        return None
