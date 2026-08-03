from __future__ import annotations

from datetime import date

from ...config import DatasetSpec
from ..base import DiscoveredSource

NSE_FAO_BASE = "https://nsearchives.nseindia.com/content/nsccl"


class NseParticipantOiSource:
    def discover(self, dataset: DatasetSpec, market_date: date | None) -> list[DiscoveredSource]:
        if market_date is None:
            return []
        token = market_date.strftime("%d%m%Y")
        candidates = [
            f"{NSE_FAO_BASE}/fao_participant_oi_{token}_b.csv",
            f"{NSE_FAO_BASE}/fao_participant_oi_{token}.csv",
        ]
        return [
            DiscoveredSource(
                dataset_name=dataset.dataset_name,
                market_date=market_date,
                source_url=url,
                source_system=dataset.source_system,
                file_name=url.rsplit("/", 1)[-1],
            )
            for url in candidates
        ]
