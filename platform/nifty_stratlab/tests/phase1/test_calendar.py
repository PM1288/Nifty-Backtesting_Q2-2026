from datetime import date, time

from nifty_stratlab.calendar.service import TradingCalendar, resolve_expiry
from nifty_stratlab.contracts import ExpiryRule, SessionProfile


def calendar():
    return TradingCalendar(
        [
            SessionProfile(
                profile_id="cm",
                segment="NSE_CM",
                effective_from=date(2020, 1, 1),
                regular_open=time(9, 15),
                regular_close=time(15, 30),
            ),
            SessionProfile(
                profile_id="fo-old",
                segment="NSE_FO",
                effective_from=date(2020, 1, 1),
                effective_to=date(2026, 8, 2),
                regular_open=time(9, 15),
                regular_close=time(15, 30),
            ),
            SessionProfile(
                profile_id="fo-new",
                segment="NSE_FO",
                effective_from=date(2026, 8, 3),
                regular_open=time(9, 15),
                regular_close=time(15, 40),
            ),
        ],
        holidays={date(2026, 8, 25)},
    )


def test_effective_dated_sessions_and_counts():
    service = calendar()
    assert service.profile_for(date(2026, 8, 2), "NSE_FO").profile_id == "fo-old"
    assert service.profile_for(date(2026, 8, 3), "NSE_FO").profile_id == "fo-new"
    assert service.expected_bar_count(date(2026, 8, 3), "NSE_FO") == 385
    assert service.expected_bar_count(date(2026, 8, 3), "NSE_CM") == 375


def test_tuesday_expiry_moves_to_previous_trading_day_when_holiday():
    service = calendar()
    rule = ExpiryRule(
        rule_id="nifty-weekly",
        underlying_scope="NIFTY",
        frequency="weekly",
        weekday=1,
        effective_from=date(2026, 1, 1),
        holiday_adjustment="previous_trading_day",
    )
    assert resolve_expiry(date(2026, 8, 24), rule, service) == date(2026, 8, 24)
