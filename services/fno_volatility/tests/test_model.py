from datetime import date, datetime
from zoneinfo import ZoneInfo

import pandas as pd
import pytest

from fno_volatility.model import (
    black_scholes,
    choose_decision,
    daily_features,
    direction_entropy,
    implied_volatility,
    simulate_structure,
    years_to_expiry,
)
from fno_volatility.service import market_session_status


IST = ZoneInfo("Asia/Kolkata")


def test_direction_entropy_is_maximum_at_even_odds() -> None:
    assert direction_entropy(0.5) == pytest.approx(1.0)
    assert direction_entropy(0.9) < direction_entropy(0.7) < direction_entropy(0.5)


def test_black_scholes_iv_round_trip() -> None:
    price = black_scholes(1000, 1000, 7 / 365, 0.06, 0.25, "CE")
    assert implied_volatility(price, 1000, 1000, 7 / 365, 0.06, "CE") == pytest.approx(0.25, abs=1e-7)


def test_entry_uses_asks_and_scenarios_are_deterministic() -> None:
    kwargs = dict(
        spot=1000,
        call_strike=1000,
        put_strike=1000,
        call_ask=9,
        put_ask=10,
        call_iv=0.20,
        put_iv=0.21,
        years_entry=5 / 365,
        years_exit=4.75 / 365,
        predicted_abs_move_p50=0.02,
        predicted_iv_change=0.005,
        rate=0.06,
        dividend_yield=0,
        costs_fraction=0.01,
        scenario_count=1000,
        seed=42,
    )
    first = simulate_structure(**kwargs)
    second = simulate_structure(**kwargs)
    assert first == second
    assert 0 <= first.probability_profit <= 1


def test_no_trade_when_quotes_are_stale_even_with_large_edge() -> None:
    policy = {
        "forecast_implied_ratio_min": 1.15,
        "expected_return_min": 0.05,
        "probability_profit_min": 0.55,
        "direction_entropy_min": 0.90,
        "combined_spread_pct_max": 0.05,
    }
    decision, reasons = choose_decision(
        structure_type="ATM_STRADDLE",
        forecast_implied_ratio=2,
        expected_return=0.20,
        probability_profit=0.70,
        entropy=0.98,
        combined_spread_pct=0.01,
        data_status="OPTION_QUOTE_STALE",
        policy=policy,
    )
    assert decision == "NO_TRADE"
    assert "OPTION_QUOTE_STALE" in reasons


def test_all_gates_select_structure() -> None:
    policy = {
        "forecast_implied_ratio_min": 1.15,
        "expected_return_min": 0.05,
        "probability_profit_min": 0.55,
        "direction_entropy_min": 0.90,
        "combined_spread_pct_max": 0.05,
    }
    decision, reasons = choose_decision(
        structure_type="NARROW_STRANGLE",
        forecast_implied_ratio=1.5,
        expected_return=0.08,
        probability_profit=0.59,
        entropy=0.95,
        combined_spread_pct=0.03,
        data_status="FULL",
        policy=policy,
    )
    assert (decision, reasons) == ("BUY_STRANGLE", [])


def test_daily_features_require_completed_history() -> None:
    frame = pd.DataFrame(
        {
            "trade_date": pd.date_range("2026-01-01", periods=40),
            "open": range(100, 140),
            "high": range(102, 142),
            "low": range(98, 138),
            "close": range(101, 141),
            "volume": range(1000, 1040),
        }
    )
    result = daily_features(frame)
    assert result.iloc[-1]["atr_pct"] > 0
    assert result.iloc[-1]["bb_width_pct"] > 0
    assert result.iloc[-1]["volume_sma20"] == pytest.approx(1029.5)
    assert result.iloc[-1]["volume_ratio"] == pytest.approx(1039 / 1029.5)


def test_market_session_and_expiry_are_timezone_aware() -> None:
    assert market_session_status(date(2026, 8, 10), datetime(2026, 8, 10, 9, 30, tzinfo=IST)) == "OPEN"
    assert market_session_status(date(2026, 8, 10), datetime(2026, 8, 10, 16, 0, tzinfo=IST)) == "CLOSED"
    assert years_to_expiry(date(2026, 8, 25), datetime(2026, 8, 10, 9, 30, tzinfo=IST)) > 0
