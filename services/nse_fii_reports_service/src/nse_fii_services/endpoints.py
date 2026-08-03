from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
import json
from typing import Iterable
from urllib.parse import quote

DATE_FMT_INPUT = "%d-%m-%Y"
DATE_FMT_DDMMYYYY = "%d%m%Y"
DATE_FMT_DD_MON_YYYY = "%d-%b-%Y"


@dataclass(frozen=True)
class ReportSpec:
    key: str
    file_ext: str
    archive_paths: tuple[str, ...]
    reports_api_name: str
    category: str = "derivatives"
    section: str = "equity"

    def archive_urls(self, trade_date: datetime) -> list[str]:
        return [path.format(date=self._format_archive_date(trade_date)) for path in self.archive_paths]

    def reports_api_url(self, trade_date: datetime) -> str:
        payload = [{
            "name": self.reports_api_name,
            "type": "archives",
            "category": self.category,
            "section": self.section,
        }]
        encoded = quote(json.dumps(payload, separators=(",", ":")))
        date_str = trade_date.strftime(DATE_FMT_DD_MON_YYYY)
        return (
            "https://www.nseindia.com/api/reports?archives="
            f"{encoded}&date={date_str}&type=equity&mode=single"
        )

    def _format_archive_date(self, trade_date: datetime) -> str:
        if self.key == "fii_stats":
            return trade_date.strftime(DATE_FMT_DD_MON_YYYY)
        return trade_date.strftime(DATE_FMT_DDMMYYYY)


REPORT_SPECS: dict[str, ReportSpec] = {
    "participant_oi": ReportSpec(
        key="participant_oi",
        file_ext="csv",
        archive_paths=(
            "https://nsearchives.nseindia.com/content/nsccl/fao_participant_oi_{date}.csv",
            "https://archives.nseindia.com/content/nsccl/fao_participant_oi_{date}.csv",
        ),
        reports_api_name="F&O - Participant wise Open Interest(csv)",
    ),
    "participant_volume": ReportSpec(
        key="participant_volume",
        file_ext="csv",
        archive_paths=(
            "https://nsearchives.nseindia.com/content/nsccl/fao_participant_vol_{date}.csv",
            "https://archives.nseindia.com/content/nsccl/fao_participant_vol_{date}.csv",
        ),
        reports_api_name="F&O - Participant wise Trading Volumes(csv)",
    ),
    "fii_stats": ReportSpec(
        key="fii_stats",
        file_ext="xls",
        archive_paths=(
            "https://nsearchives.nseindia.com/content/fo/fii_stats_{date}.xls",
            "https://archives.nseindia.com/content/fo/fii_stats_{date}.xls",
        ),
        reports_api_name="F&O - FII Derivatives Statistics",
    ),
}


def parse_trade_date(trade_date: str | datetime) -> datetime:
    if isinstance(trade_date, datetime):
        return trade_date
    return datetime.strptime(trade_date, DATE_FMT_INPUT)


def iter_business_dates(start: datetime, end: datetime) -> Iterable[datetime]:
    cur = start.replace(hour=0, minute=0, second=0, microsecond=0)
    final = end.replace(hour=0, minute=0, second=0, microsecond=0)
    while cur <= final:
        if cur.weekday() < 5:
            yield cur
        cur = cur + timedelta(days=1)
