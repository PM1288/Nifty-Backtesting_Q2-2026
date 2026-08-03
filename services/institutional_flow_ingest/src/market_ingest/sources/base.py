from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Protocol

from ..config import DatasetSpec


@dataclass(slots=True)
class DiscoveredSource:
    dataset_name: str
    market_date: date | None
    source_url: str
    source_system: str
    file_name: str
    requires_browser_fallback: bool = False


class SourceAdapter(Protocol):
    def discover(self, dataset: DatasetSpec, market_date: date | None) -> list[DiscoveredSource]:
        ...
