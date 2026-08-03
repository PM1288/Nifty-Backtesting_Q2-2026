from __future__ import annotations

from datetime import date, datetime, timedelta


class TradingCalendar:
    def __init__(self, holiday_overrides: set[str]) -> None:
        self._holidays = {date.fromisoformat(item) for item in holiday_overrides}

    def is_trading_day(self, value: date) -> bool:
        return value.weekday() < 5 and value not in self._holidays

    def previous_trading_day(self, anchor: date) -> date:
        cursor = anchor - timedelta(days=1)
        while not self.is_trading_day(cursor):
            cursor -= timedelta(days=1)
        return cursor


def parse_time_of_day(value: str) -> tuple[int, int]:
    hour_str, minute_str = value.strip().split(":", 1)
    hour = int(hour_str)
    minute = int(minute_str)
    if not (0 <= hour <= 23 and 0 <= minute <= 59):
        raise ValueError(f"invalid time {value!r}")
    return hour, minute


def scheduled_today(now: datetime, hour: int, minute: int) -> datetime:
    return now.replace(hour=hour, minute=minute, second=0, microsecond=0)
