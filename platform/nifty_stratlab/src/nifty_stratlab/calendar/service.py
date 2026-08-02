from __future__ import annotations

import calendar as _calendar
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from nifty_stratlab.contracts import ExpiryRule, SessionProfile


class CalendarError(ValueError):
    pass


@dataclass(frozen=True)
class SessionBounds:
    profile_id: str
    trade_date: date
    open_at: datetime
    close_at: datetime


class TradingCalendar:
    """Effective-dated exchange calendar with configurable holidays and sessions.

    Weekends and holidays are data, not strategy constants. Special sessions can
    be represented by a date-specific SessionProfile with the narrowest effective
    range.
    """

    def __init__(
        self,
        profiles: list[SessionProfile],
        holidays: set[date] | None = None,
        special_trading_days: set[date] | None = None,
    ) -> None:
        if not profiles:
            raise CalendarError("at least one session profile is required")
        self._profiles = tuple(profiles)
        self._holidays = frozenset(holidays or set())
        self._special = frozenset(special_trading_days or set())

    def is_trading_day(self, value: date) -> bool:
        if value in self._special:
            return True
        return value.weekday() < 5 and value not in self._holidays

    def next_trading_day(self, value: date, include_self: bool = False) -> date:
        current = value if include_self else value + timedelta(days=1)
        for _ in range(370):
            if self.is_trading_day(current):
                return current
            current += timedelta(days=1)
        raise CalendarError("no next trading day found within 370 days")

    def previous_trading_day(self, value: date, include_self: bool = False) -> date:
        current = value if include_self else value - timedelta(days=1)
        for _ in range(370):
            if self.is_trading_day(current):
                return current
            current -= timedelta(days=1)
        raise CalendarError("no previous trading day found within 370 days")

    def profile_for(self, trade_date: date, segment: str) -> SessionProfile:
        candidates = [
            profile
            for profile in self._profiles
            if profile.segment == segment
            and profile.effective_from <= trade_date
            and (profile.effective_to is None or trade_date <= profile.effective_to)
        ]
        if not candidates:
            raise CalendarError(f"no session profile for {segment=} {trade_date=}")
        # A date-specific override wins over a long-lived profile.
        candidates.sort(
            key=lambda profile: (
                profile.effective_from,
                -(profile.effective_to - profile.effective_from).days
                if profile.effective_to is not None
                else -999_999,
            ),
            reverse=True,
        )
        return candidates[0]

    def session_bounds(
        self,
        trade_date: date,
        segment: str,
        *,
        expiry_session: bool = False,
    ) -> SessionBounds:
        if not self.is_trading_day(trade_date):
            raise CalendarError(f"{trade_date} is not a trading day")
        profile = self.profile_for(trade_date, segment)
        tz = ZoneInfo(profile.timezone)
        close_time = profile.expiry_close if expiry_session and profile.expiry_close else profile.regular_close
        return SessionBounds(
            profile_id=profile.profile_id,
            trade_date=trade_date,
            open_at=datetime.combine(trade_date, profile.regular_open, tzinfo=tz),
            close_at=datetime.combine(trade_date, close_time, tzinfo=tz),
        )

    def expected_bar_count(
        self,
        trade_date: date,
        segment: str,
        interval_minutes: int = 1,
        *,
        expiry_session: bool = False,
    ) -> int:
        if interval_minutes <= 0:
            raise CalendarError("interval_minutes must be positive")
        bounds = self.session_bounds(trade_date, segment, expiry_session=expiry_session)
        minutes = int((bounds.close_at - bounds.open_at).total_seconds() // 60)
        profile = self.profile_for(trade_date, segment)
        if profile.bar_close_inclusive:
            minutes += interval_minutes
        return max(0, minutes // interval_minutes)


def _last_weekday(year: int, month: int, weekday: int) -> date:
    last_day = _calendar.monthrange(year, month)[1]
    candidate = date(year, month, last_day)
    while candidate.weekday() != weekday:
        candidate -= timedelta(days=1)
    return candidate


def _next_weekday(reference: date, weekday: int) -> date:
    return reference + timedelta(days=(weekday - reference.weekday()) % 7)


def resolve_expiry(reference: date, rule: ExpiryRule, trading_calendar: TradingCalendar) -> date:
    if reference < rule.effective_from or (rule.effective_to and reference > rule.effective_to):
        raise CalendarError(f"expiry rule {rule.rule_id} is not effective on {reference}")

    if rule.frequency == "weekly":
        nominal = _next_weekday(reference, rule.weekday)
    elif rule.frequency == "monthly":
        nominal = _last_weekday(reference.year, reference.month, rule.weekday)
        if nominal < reference:
            year = reference.year + (1 if reference.month == 12 else 0)
            month = 1 if reference.month == 12 else reference.month + 1
            nominal = _last_weekday(year, month, rule.weekday)
    else:  # pragma: no cover - protected by pydantic
        raise CalendarError(f"unsupported frequency {rule.frequency}")

    if trading_calendar.is_trading_day(nominal):
        return nominal
    if rule.holiday_adjustment == "previous_trading_day":
        return trading_calendar.previous_trading_day(nominal)
    return trading_calendar.next_trading_day(nominal)


def parse_hhmm(value: str) -> time:
    try:
        hour, minute = (int(part) for part in value.strip().split(":"))
        return time(hour=hour, minute=minute)
    except (TypeError, ValueError) as exc:
        raise CalendarError(f"invalid HH:MM time: {value!r}") from exc
