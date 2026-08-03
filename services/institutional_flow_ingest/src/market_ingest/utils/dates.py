from __future__ import annotations

from calendar import monthrange
from datetime import UTC, date, datetime

from dateutil.relativedelta import relativedelta


def today_utc() -> date:
    return datetime.now(UTC).date()


def years_ago(anchor: date, years: int) -> date:
    return anchor - relativedelta(years=years)


def parse_market_date(value: str | None) -> date | None:
    if not value:
        return None
    return date.fromisoformat(value)


MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def parse_nse_date(value: str | None) -> date | None:
    if not value or not isinstance(value, str):
        return None
    parts = value.split("-")
    if len(parts) != 3:
        return None
    day, mon, year = parts
    try:
        month = MONTH_ABBR.index(mon) + 1
    except ValueError:
        return None
    return date(int(year), month, int(day))


def enumerate_month_starts(start_date: date, end_date: date) -> list[date]:
    current = date(start_date.year, start_date.month, 1)
    items: list[date] = []
    while current <= end_date:
        if current >= start_date:
            items.append(current)
        current = current + relativedelta(months=1)
    return items


def enumerate_year_starts(start_date: date, end_date: date) -> list[date]:
    current = date(start_date.year, 1, 1)
    items: list[date] = []
    while current <= end_date:
        if current >= start_date:
            items.append(current)
        current = date(current.year + 1, 1, 1)
    return items


def enumerate_fortnight_dates(start_date: date, end_date: date) -> list[date]:
    results: list[date] = []
    for month_start in enumerate_month_starts(start_date, end_date):
        mid_month = date(month_start.year, month_start.month, 15)
        end_month = date(month_start.year, month_start.month, monthrange(month_start.year, month_start.month)[1])
        for candidate in (mid_month, end_month):
            if start_date <= candidate <= end_date:
                results.append(candidate)
    return results


def format_fortnight_code(candidate: date) -> str:
    return f"{MONTH_ABBR[candidate.month - 1]}{candidate.day:02d}{candidate.year}"


def month_label(candidate: date) -> str:
    return f"{MONTH_ABBR[candidate.month - 1]} {candidate.year}"
