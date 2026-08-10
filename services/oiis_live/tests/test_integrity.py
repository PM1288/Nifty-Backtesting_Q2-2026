from datetime import date, datetime
from zoneinfo import ZoneInfo

import pytest

from oiis_live.main import resolve_decision_as_of


IST = ZoneInfo("Asia/Kolkata")


@pytest.mark.parametrize(
    ("slot", "hour", "minute"),
    [
        ("PREOPEN_0830",8,30),
        ("OPEN_0930",9,30),
        ("AFTERNOON_1500",15,0),
    ],
)
def test_scheduled_slot_uses_market_decision_time_not_execution_time(slot: str, hour: int, minute: int) -> None:
    execution = datetime(2026,8,10,20,11,tzinfo=IST)
    result = resolve_decision_as_of(date(2026,8,10),slot,execution)
    assert (result.hour,result.minute) == (hour,minute)
    assert result.tzinfo == IST


def test_manual_historical_run_defaults_to_session_close() -> None:
    execution = datetime(2026,8,11,10,0,tzinfo=IST)
    result = resolve_decision_as_of(date(2026,8,10),"MANUAL_CORRECTED",execution)
    assert (result.hour,result.minute) == (15,30)


def test_explicit_decision_cutoff_must_match_trade_date() -> None:
    with pytest.raises(ValueError):
        resolve_decision_as_of(
            date(2026,8,10),
            "MANUAL_CORRECTED",
            requested=datetime(2026,8,9,15,0,tzinfo=IST),
        )
