from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta

from .db import execute
from .logging_utils import get_logger

log = get_logger(__name__)


@dataclass(frozen=True)
class PartitionSpec:
    schema: str
    table: str

    @property
    def parent(self) -> str:
        return f"{self.schema}.{self.table}"

    def child_name(self, part_date: date) -> str:
        return f"{self.table}_{part_date.year:04d}_{part_date.month:02d}"


PARTITIONED_TABLES = [
    PartitionSpec("nse_intraday", "raw_security_1m"),
    PartitionSpec("nse_intraday", "raw_index_1m"),
    PartitionSpec("nse_intraday", "security_minute_feature"),
    PartitionSpec("nse_intraday", "market_minute_feature"),
]


def _month_start(value: date) -> date:
    return value.replace(day=1)


def _next_month(value: date) -> date:
    if value.month == 12:
        return value.replace(year=value.year + 1, month=1, day=1)
    return value.replace(month=value.month + 1, day=1)


def ensure_monthly_partitions(start_date: date, end_date: date) -> None:
    current = _month_start(start_date)
    end = _month_start(end_date)
    while current <= end:
        for spec in PARTITIONED_TABLES:
            child = spec.child_name(current)
            next_month = _next_month(current)
            from_date = current.isoformat()
            to_date = next_month.isoformat()
            execute(
                f'''
                create table if not exists {spec.schema}.{child}
                partition of {spec.parent}
                for values from ('{from_date}') to ('{to_date}')
                '''
            )
        current = _next_month(current)


def drop_monthly_partitions_older_than(cutoff_date: date) -> None:
    cutoff_month = _month_start(cutoff_date)
    year_month_cutoff = cutoff_month.year * 100 + cutoff_month.month
    for spec in PARTITIONED_TABLES:
        for year in range(2018, cutoff_month.year + 1):
            for month in range(1, 13):
                ym = year * 100 + month
                if ym >= year_month_cutoff:
                    continue
                child = spec.child_name(date(year, month, 1))
                execute(f"drop table if exists {spec.schema}.{child}")
