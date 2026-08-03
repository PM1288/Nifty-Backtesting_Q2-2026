from __future__ import annotations

from datetime import date

from ...config import DatasetSpec
from ...utils.http import HttpClient
from ..base import DiscoveredSource

NSE_HOME = "https://www.nseindia.com/"
NSE_CASH_API = "https://www.nseindia.com/api/fiidiiTradeReact"
NSE_CASH_REFERER = "https://www.nseindia.com/reports/fii-dii"


class NseCashApiSource:
    def __init__(self, client: HttpClient) -> None:
        self.client = client

    def discover(self, dataset: DatasetSpec, market_date: date | None) -> list[DiscoveredSource]:
        # Bootstraps session cookies into the shared HTTP client before the API call.
        self.client.session.headers.update({"Referer": NSE_CASH_REFERER})
        self.client.fetch_with_optional_browser(NSE_HOME)
        return [
            DiscoveredSource(
                dataset_name=dataset.dataset_name,
                market_date=market_date,
                source_url=NSE_CASH_API,
                source_system=dataset.source_system,
                file_name=f"{dataset.dataset_name}.json",
            )
        ]
