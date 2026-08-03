from __future__ import annotations

from datetime import date

from ...config import DatasetSpec
from ...utils.html import extract_links
from ...utils.http import HttpClient
from ..base import DiscoveredSource


class NseBulkBlockSource:
    def __init__(self, client: HttpClient) -> None:
        self.client = client

    def discover(self, dataset: DatasetSpec, market_date: date | None) -> list[DiscoveredSource]:
        html = self.client.fetch_with_optional_browser(dataset.official_anchor)
        links = extract_links(html)
        results: list[DiscoveredSource] = []
        token = dataset.deal_kind or ""
        date_token = market_date.strftime("%d%m%Y") if market_date else ""
        for link in links:
            lower = link.lower()
            if token not in lower:
                continue
            if market_date and date_token not in lower and market_date.strftime("%Y%m%d") not in lower:
                continue
            if ".csv" not in lower and ".zip" not in lower and ".xls" not in lower and ".xlsx" not in lower:
                continue
            results.append(
                DiscoveredSource(
                    dataset_name=dataset.dataset_name,
                    market_date=market_date,
                    source_url=link if link.startswith("http") else f"https://www.nseindia.com{link}",
                    source_system=dataset.source_system,
                    file_name=link.split("/")[-1] or f"{dataset.dataset_name}.csv",
                )
            )
        return results
