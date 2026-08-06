from datetime import date, datetime, timedelta
from decimal import Decimal

from nifty_stratlab.evaluation.common_exit import PathBar, evaluate_long_target_only


DAY = date(2026, 1, 5)
START = datetime(2026, 1, 5, 9, 16)


def bar(minutes: int, session: date, open_: str, high: str, low: str, close: str) -> PathBar:
    return PathBar(
        ts=START + timedelta(days=(session - DAY).days, minutes=minutes), session=session,
        open=Decimal(open_), high=Decimal(high), low=Decimal(low), close=Decimal(close),
    )


def evaluate(bars: list[PathBar]) -> dict:
    return evaluate_long_target_only(
        symbol="AAA", signal_date=DAY - timedelta(days=1), entry_price=Decimal("100"),
        quantity=2000, bars=bars,
    )


def test_same_session_target_exits_at_point_three_percent_without_stop() -> None:
    result = evaluate([bar(0, DAY, "100", "100.35", "92", "99")])
    assert result["status"] == "CLOSED"
    assert result["exit_reason"] == "TARGET_INTRADAY_0_3"
    assert result["exit_price"] == 100.3
    assert result["mae_pct"] == -8.0
    assert result["stop_exit_enabled"] is False


def test_intraday_miss_promotes_to_one_percent_from_original_buy_price() -> None:
    next_day = DAY + timedelta(days=1)
    result = evaluate([
        bar(0, DAY, "100", "100.25", "98", "99.5"),
        bar(0, next_day, "99.5", "101.2", "97", "101"),
    ])
    assert result["exit_reason"] == "TARGET_SWING_1_0"
    assert result["exit_price"] == 101.0
    assert result["holding_sessions"] == 2


def test_adverse_thresholds_record_risk_but_never_exit() -> None:
    next_day = DAY + timedelta(days=1)
    result = evaluate([
        bar(0, DAY, "100", "100.1", "89", "91"),
        bar(0, next_day, "91", "101.1", "90", "101"),
    ])
    assert result["exit_reason"] == "TARGET_SWING_1_0"
    assert result["mae_pct"] == -11.0
    assert all(event["exit_triggered"] is False for event in result["adverse_events"])
    assert next(e for e in result["adverse_events"] if e["threshold_id"] == "A1000")["touched"] is True


def test_unresolved_position_remains_open_and_capital_is_not_released() -> None:
    result = evaluate([bar(0, DAY, "100", "100.2", "80", "90")])
    assert result["status"] == "OPEN_AS_OF_END"
    assert result["exit_date"] is None
    assert result["after_tax_net_pnl"] == 0.0
    assert result["unrealized_net_liquidation_pnl"] < 0
    assert result["capital_released"] is False


def test_long_target_tick_rounds_up_not_below_declared_percentage() -> None:
    result = evaluate([bar(0, DAY, "100", "100.35", "100", "100.3")])
    i030 = next(event for event in result["target_events"] if event["target_id"] == "I030")
    assert i030["target_price"] == 100.3
