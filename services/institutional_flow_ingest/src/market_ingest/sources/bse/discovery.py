from __future__ import annotations

from datetime import UTC, datetime

from ...config import DatasetSpec
from ...registry import Registry
from ...utils.html import extract_links
from ...utils.http import HttpClient
from ..base import DiscoveredSource


class BseDiscoverySource:
    def __init__(self, client: HttpClient, registry: Registry | None = None) -> None:
        self.client = client
        self.registry = registry

    def discover(self, dataset: DatasetSpec, market_date) -> list[DiscoveredSource]:
        html = self.client.fetch_with_optional_browser(dataset.official_anchor)
        links = extract_links(html)
        lower_links = [link.lower() for link in links]
        verified = any("download" in link or "csv" in link or "xls" in link for link in lower_links)
        if self.registry:
            self.registry.write_capability(
                {
                    "dataset_name": dataset.dataset_name,
                    "source_system": dataset.source_system,
                    "public_endpoint_verified": verified,
                    "requires_browser_fallback": False,
                    "is_paid_only": False,
                    "notes": "Automatic BSE discovery probe",
                    "last_verified_at": datetime.now(UTC),
                }
            )
        return []
