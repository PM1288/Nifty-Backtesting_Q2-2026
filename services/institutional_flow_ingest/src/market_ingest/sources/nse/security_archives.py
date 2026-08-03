from __future__ import annotations

from datetime import date

from ...config import DatasetSpec
from ..base import DiscoveredSource


ARCHIVE_URLS = {
    "shortselling": "https://nsearchives.nseindia.com/content/equities/shortselling_{ddmmyyyy}.csv",
    "sec_bhavdata_full": "https://nsearchives.nseindia.com/content/equities/sec_bhavdata_full_{ddmmyyyy}.csv",
}


class NseSecurityArchivesSource:
    def discover(self, dataset: DatasetSpec, market_date: date | None) -> list[DiscoveredSource]:
        if market_date is None or not dataset.archive_key:
            return []
        template = ARCHIVE_URLS.get(dataset.archive_key)
        if not template:
            return []
        context = {"ddmmyyyy": market_date.strftime("%d%m%Y")}
        url = template.format(**context)
        return [
            DiscoveredSource(
                dataset_name=dataset.dataset_name,
                market_date=market_date,
                source_url=url,
                source_system=dataset.source_system,
                file_name=url.split("/")[-1],
            )
        ]
