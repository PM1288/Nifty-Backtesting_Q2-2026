from __future__ import annotations

from datetime import date

from ...config import DatasetSpec
from ..base import DiscoveredSource


class NseBhavcopySource:
    def discover(self, dataset: DatasetSpec, market_date: date | None) -> list[DiscoveredSource]:
        if market_date is None:
            return []
        context = {
            "yyyymmdd": market_date.strftime("%Y%m%d"),
            "yyyy": market_date.strftime("%Y"),
            "mon": market_date.strftime("%b").upper(),
            "ddMONyyyybhav": market_date.strftime("%d%b%Y").upper(),
        }
        results: list[DiscoveredSource] = []
        for template in dataset.url_candidates:
            url = template.format(**context)
            results.append(
                DiscoveredSource(
                    dataset_name=dataset.dataset_name,
                    market_date=market_date,
                    source_url=url,
                    source_system=dataset.source_system,
                    file_name=url.split("/")[-1],
                )
            )
        return results
