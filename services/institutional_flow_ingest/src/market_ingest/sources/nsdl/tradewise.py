from __future__ import annotations

from datetime import date

from ...config import DatasetSpec
from ..base import DiscoveredSource

NSDL_BASE = "https://www.fpi.nsdl.co.in/web"
MONTH_ABBR = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")


def build_tradewise_url(candidate: date) -> str:
    year = candidate.year
    month = candidate.month
    month_name = MONTH_ABBR[month - 1]
    if year >= 2022:
        return f"{NSDL_BASE}/StaticReports/statistics/zip/{month_name}_{year}.zip"
    return f"{NSDL_BASE}/StaticReports/statistics/zip/{year}_{month:02d}.zip"


class NsdlTradewiseMonthlySource:
    def discover(self, dataset: DatasetSpec, market_date: date | None) -> list[DiscoveredSource]:
        if market_date is None:
            return []
        return [
            DiscoveredSource(
                dataset_name=dataset.dataset_name,
                market_date=market_date,
                source_url=build_tradewise_url(market_date),
                source_system=dataset.source_system,
                file_name=f"nsdl_tradewise_{market_date:%Y_%m}.zip",
            )
        ]
