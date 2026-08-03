from __future__ import annotations

import re
from datetime import date
from urllib.parse import urljoin

from ...config import DatasetSpec
from ...utils.html import extract_links
from ...utils.http import HttpClient
from ..base import DiscoveredSource


class NseShareholdingSource:
    def __init__(self, client: HttpClient) -> None:
        self.client = client

    def discover(self, dataset: DatasetSpec, market_date: date | None) -> list[DiscoveredSource]:
        html = self.client.fetch_with_optional_browser(dataset.official_anchor)
        links = extract_links(html)
        results: list[DiscoveredSource] = []
        for link in links:
            lower = link.lower()
            if "shareholding" not in lower and "shp" not in lower and "ixbrl" not in lower and "xbrl" not in lower:
                continue
            if not any(ext in lower for ext in [".csv", ".xml", ".xbrl", ".html"]):
                continue
            full = urljoin(dataset.official_anchor, link)
            filing_date = None
            match = re.search(r"(\d{8})", full)
            if match:
                value = match.group(1)
                filing_date = date(int(value[4:]), int(value[2:4]), int(value[:2]))
            if market_date and filing_date and filing_date < market_date:
                continue
            results.append(
                DiscoveredSource(
                    dataset_name=dataset.dataset_name,
                    market_date=filing_date,
                    source_url=full,
                    source_system=dataset.source_system,
                    file_name=full.split("/")[-1] or f"{dataset.dataset_name}.xml",
                )
            )
        return results
