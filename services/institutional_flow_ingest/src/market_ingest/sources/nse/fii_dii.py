from __future__ import annotations

import re
from datetime import date
from urllib.parse import urljoin

from ...config import DatasetSpec
from ...utils.html import extract_links
from ...utils.http import HttpClient
from ..base import DiscoveredSource


class NseFiiDiiSource:
    def __init__(self, client: HttpClient) -> None:
        self.client = client

    def discover(self, dataset: DatasetSpec, market_date: date | None) -> list[DiscoveredSource]:
        html = self.client.fetch_with_optional_browser(dataset.official_anchor)
        links = extract_links(html)
        discovered: list[DiscoveredSource] = []
        date_tokens = []
        if market_date is not None:
            date_tokens = [
                market_date.strftime("%d%m%Y"),
                market_date.strftime("%d-%m-%Y"),
                market_date.strftime("%d_%m_%Y"),
                market_date.strftime("%Y%m%d"),
            ]
        for link in links:
            lower = link.lower()
            if ".csv" not in lower and ".zip" not in lower and "download" not in lower:
                continue
            if "fii" not in lower and "dii" not in lower:
                continue
            full = urljoin(dataset.official_anchor, link)
            if date_tokens and not any(token in full for token in date_tokens):
                if "latest" not in full and "current" not in full and "combined" not in full and "nse" not in full:
                    continue
            if dataset.exchange_scope == "combined" and not re.search(r"combined|cm_mii|bse|msei", lower):
                continue
            if dataset.exchange_scope == "nse_only" and "combined" in lower:
                continue
            discovered.append(
                DiscoveredSource(
                    dataset_name=dataset.dataset_name,
                    market_date=market_date,
                    source_url=full,
                    source_system=dataset.source_system,
                    file_name=full.split("/")[-1] or f"{dataset.dataset_name}.csv",
                )
            )
        return discovered
