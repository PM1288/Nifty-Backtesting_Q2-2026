from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from enum import StrEnum


class DayClassification(StrEnum):
    TRADING = "trading"
    NON_TRADING = "non_trading"
    UNKNOWN = "unknown"


@dataclass(slots=True)
class TradingCalendar:
    holiday_overrides: set[date]

    @classmethod
    def from_strings(cls, items: list[str]) -> "TradingCalendar":
        return cls({date.fromisoformat(value) for value in items})

    def classify(self, candidate: date) -> DayClassification:
        if candidate in self.holiday_overrides:
            return DayClassification.NON_TRADING
        if candidate.weekday() >= 5:
            return DayClassification.NON_TRADING
        return DayClassification.TRADING

    def iter_expected_dates(self, start_date: date, end_date: date, frequency: str) -> list[date]:
        if frequency == "periodic":
            return []
        results: list[date] = []
        current = start_date
        while current <= end_date:
            if self.classify(current) == DayClassification.TRADING:
                results.append(current)
            current += timedelta(days=1)
        return results

    def previous_trading_day(self, anchor: date) -> date:
        cursor = anchor - timedelta(days=1)
        while self.classify(cursor) != DayClassification.TRADING:
            cursor -= timedelta(days=1)
        return cursor
