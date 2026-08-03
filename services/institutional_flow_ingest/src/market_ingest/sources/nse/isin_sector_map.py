from __future__ import annotations

from datetime import date

from ...config import DatasetSpec
from ..base import DiscoveredSource

NSE_NIFTY500_CSV = "https://archives.nseindia.com/content/indices/ind_nifty500list.csv"


class NseIsinSectorMapSource:
    def discover(self, dataset: DatasetSpec, market_date: date | None) -> list[DiscoveredSource]:
        return [
            DiscoveredSource(
                dataset_name=dataset.dataset_name,
                market_date=market_date,
                source_url=NSE_NIFTY500_CSV,
                source_system="NSE",
                file_name="ind_nifty500list.csv",
            )
        ]
