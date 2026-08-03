from __future__ import annotations

from datetime import date

from market_ingest.calendar import DayClassification, TradingCalendar


def test_calendar_skips_weekends_and_holidays() -> None:
    calendar = TradingCalendar.from_strings(["2026-01-26"])
    assert calendar.classify(date(2026, 1, 24)) == DayClassification.NON_TRADING
    assert calendar.classify(date(2026, 1, 26)) == DayClassification.NON_TRADING
    assert calendar.classify(date(2026, 1, 27)) == DayClassification.TRADING
