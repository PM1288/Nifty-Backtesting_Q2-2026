from __future__ import annotations

from datetime import date, timedelta
from urllib.parse import quote

from ...config import DatasetSpec
from ...utils.dates import enumerate_fortnight_dates, format_fortnight_code
from ..base import DiscoveredSource

NSDL_BASE = "https://www.fpi.nsdl.co.in/web"
CDSL_BASE = "https://www.cdslindia.com/publications/FII/FortnightlySecWisePages"
MONTH_NAMES = {
    1: "January",
    2: "February",
    3: "March",
    4: "April",
    5: "May",
    6: "June",
    7: "July",
    8: "August",
    9: "September",
    10: "October",
    11: "November",
    12: "December",
}


def build_fortnight_url(candidate: date) -> str:
    return (
        f"{NSDL_BASE}/StaticReports/Fortnightly_Sector_wise_FII_Investment_Data/"
        f"FIIInvestSector_{format_fortnight_code(candidate)}.html"
    )


def build_fortnight_url_long_month(candidate: date) -> str:
    label = f"{MONTH_NAMES[candidate.month]}{candidate.day:02d}{candidate.year}"
    return (
        f"{NSDL_BASE}/StaticReports/Fortnightly_Sector_wise_FII_Investment_Data/"
        f"FIIInvestSector_{label}.html"
    )


def build_cdsl_fortnight_url(candidate: date) -> str:
    label = f"{MONTH_NAMES[candidate.month]} {candidate.day:02d},{candidate.year}"
    return f"{CDSL_BASE}/{quote(label, safe=',')}.html"


def discovered_sources(dataset: DatasetSpec, candidate: date) -> list[DiscoveredSource]:
    code = format_fortnight_code(candidate)
    return [
        DiscoveredSource(
            dataset_name=dataset.dataset_name,
            market_date=candidate,
            source_url=build_fortnight_url(candidate),
            source_system=dataset.source_system,
            file_name=f"nsdl_fortnightly_{code}.html",
        ),
        DiscoveredSource(
            dataset_name=dataset.dataset_name,
            market_date=candidate,
            source_url=build_fortnight_url_long_month(candidate),
            source_system=dataset.source_system,
            file_name=f"nsdl_fortnightly_long_{code}.html",
        ),
        DiscoveredSource(
            dataset_name=dataset.dataset_name,
            market_date=candidate,
            source_url=build_cdsl_fortnight_url(candidate),
            source_system="CDSL",
            file_name=f"cdsl_fortnightly_{code}.html",
        ),
    ]


def latest_fortnight_cutoff(anchor: date) -> date:
    month_end = (anchor.replace(day=28) + timedelta(days=4)).replace(day=1) - timedelta(days=1)
    if anchor.day >= month_end.day:
        return month_end
    if anchor.day >= 15:
        return anchor.replace(day=15)
    previous_month_end = anchor.replace(day=1) - timedelta(days=1)
    return previous_month_end


class NsdlFortnightlyLatestSource:
    def discover(self, dataset: DatasetSpec, market_date: date | None) -> list[DiscoveredSource]:
        normalized_anchor = latest_fortnight_cutoff(market_date or date.today())
        window_start = normalized_anchor - timedelta(days=45)
        candidates = list(reversed(enumerate_fortnight_dates(window_start, normalized_anchor)))
        discovered: list[DiscoveredSource] = []
        for candidate in candidates:
            discovered.extend(discovered_sources(dataset, candidate))
        return discovered


class NsdlFortnightlyHistorySource:
    def discover(self, dataset: DatasetSpec, market_date: date | None) -> list[DiscoveredSource]:
        if market_date is None:
            return []
        return discovered_sources(dataset, market_date)
