from __future__ import annotations

from datetime import date
from pathlib import Path
from typing import Any

import yaml

from nifty_stratlab.calendar.service import TradingCalendar, parse_hhmm
from nifty_stratlab.contracts import ExpiryRule, SessionProfile


def load_calendar_config(path: str | Path) -> tuple[TradingCalendar, list[ExpiryRule]]:
    with Path(path).open("r", encoding="utf-8") as stream:
        raw: dict[str, Any] = yaml.safe_load(stream) or {}

    profiles = [
        SessionProfile(
            profile_id=item["profile_id"],
            exchange=item.get("exchange", "NSE"),
            segment=item["segment"],
            timezone=item.get("timezone", "Asia/Kolkata"),
            effective_from=date.fromisoformat(str(item["effective_from"])),
            effective_to=date.fromisoformat(str(item["effective_to"])) if item.get("effective_to") else None,
            pre_open_start=parse_hhmm(item["pre_open_start"]) if item.get("pre_open_start") else None,
            regular_open=parse_hhmm(item["regular_open"]),
            regular_close=parse_hhmm(item["regular_close"]),
            expiry_close=parse_hhmm(item["expiry_close"]) if item.get("expiry_close") else None,
            bar_timestamp_semantics=item.get("bar_timestamp_semantics", "bar_start"),
            bar_close_inclusive=bool(item.get("bar_close_inclusive", False)),
        )
        for item in raw.get("session_profiles", [])
    ]
    expiry_rules = [
        ExpiryRule(
            rule_id=item["rule_id"],
            underlying_scope=item["underlying_scope"],
            frequency=item["frequency"],
            weekday=int(item["weekday"]),
            effective_from=date.fromisoformat(str(item["effective_from"])),
            effective_to=date.fromisoformat(str(item["effective_to"])) if item.get("effective_to") else None,
            holiday_adjustment=item.get("holiday_adjustment", "previous_trading_day"),
        )
        for item in raw.get("expiry_rules", [])
    ]
    holidays = {date.fromisoformat(str(value)) for value in raw.get("holidays", [])}
    special = {date.fromisoformat(str(value)) for value in raw.get("special_trading_days", [])}
    return TradingCalendar(profiles, holidays, special), expiry_rules
