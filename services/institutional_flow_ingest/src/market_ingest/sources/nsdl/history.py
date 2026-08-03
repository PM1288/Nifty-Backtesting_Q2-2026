from __future__ import annotations

from datetime import date

from ...config import DatasetSpec
from ..base import DiscoveredSource

NSDL_BASE = "https://www.fpi.nsdl.co.in/web"


class NsdlMonthlyHistorySource:
    def discover(self, dataset: DatasetSpec, market_date: date | None) -> list[DiscoveredSource]:
        return [
            DiscoveredSource(
                dataset_name=dataset.dataset_name,
                market_date=market_date,
                source_url=f"{NSDL_BASE}/Reports/Monthly.aspx",
                source_system=dataset.source_system,
                file_name="nsdl_monthly_history.html",
            )
        ]


class NsdlYearlyHistorySource:
    def discover(self, dataset: DatasetSpec, market_date: date | None) -> list[DiscoveredSource]:
        return [
            DiscoveredSource(
                dataset_name=dataset.dataset_name,
                market_date=market_date,
                source_url=f"{NSDL_BASE}/Reports/Yearwise.aspx?RptType=6",
                source_system=dataset.source_system,
                file_name="nsdl_yearly_history.html",
            )
        ]
