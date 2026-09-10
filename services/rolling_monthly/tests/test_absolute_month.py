from __future__ import annotations

import pandas as pd

from rolling_monthly.absolute_month import (
    OPEN_STRATEGY_VERSION,
    STRATEGY_VERSION,
    evaluate_absolute_months,
    evaluate_absolute_open_months,
)


def fixture_frame() -> pd.DataFrame:
    rows = [
        # January red, February green and closes above the January open.
        ("2026-01-02", 100, 102, 88, 90),
        ("2026-01-30", 91, 93, 79, 80),
        ("2026-02-02", 82, 91, 81, 90),
        ("2026-02-27", 91, 112, 90, 110),
        # Previous week for the first March signal.
        ("2026-03-02", 105, 108, 103, 104),
        ("2026-03-03", 107, 110, 103, 104),
        ("2026-03-09", 109, 111, 107, 108),
        # First seven-condition match: 112 > current week open 109,
        # previous week open 105, previous day open 109 and today's open 110.
        ("2026-03-10", 110, 114, 109, 112),
        ("2026-03-11", 113, 120, 106, 118),
        ("2026-03-31", 117, 119, 115, 116),
    ]
    return pd.DataFrame(
        [
            {
                "trade_date": date,
                "symbol": "TEST",
                "open": open_,
                "high": high,
                "low": low,
                "close": close,
                "volume": 1000,
                "source": "NSE_EOD_BHAVCOPY",
                "source_priority": 0,
            }
            for date, open_, high, low, close in rows
        ]
    )


def test_absolute_month_uses_first_match_and_excludes_signal_day_extremes() -> None:
    frame = fixture_frame()
    result = evaluate_absolute_months(
        frame,
        {"TEST"},
        {"TEST": "Test Sector"},
        list(pd.to_datetime(frame.trade_date)),
        "2026-03",
        "2026-03",
        "2026-04-01",
    )
    assert result.runs[0]["strategy_version"] == STRATEGY_VERSION
    assert result.runs[0]["qualified_count"] == 1
    candidate = result.candidates[0]
    assert candidate["signal_date"].isoformat() == "2026-03-10"
    assert candidate["entry_price"] == 112
    assert candidate["evaluation_end_date"].isoformat() == "2026-03-31"
    assert round(candidate["end_return_pct"], 6) == round((116 / 112 - 1) * 100, 6)
    assert candidate["max_profit_price"] == 120
    assert candidate["max_drawdown_price"] == 106
    assert candidate["max_profit_date"].isoformat() == "2026-03-11"
    assert candidate["max_drawdown_date"].isoformat() == "2026-03-11"
    assert all(condition["pass"] for condition in candidate["conditions"] if not condition.get("informational"))
    assert candidate["data_quality"]["same_day_extremes_excluded"] is True


def test_absolute_month_marks_current_month_developing() -> None:
    frame = fixture_frame()
    result = evaluate_absolute_months(
        frame,
        {"TEST"},
        {},
        list(pd.to_datetime(frame.trade_date)),
        "2026-03",
        "2026-03",
        "2026-03-11",
    )
    assert result.runs[0]["maturity_state"] == "DEVELOPING"
    assert result.candidates[0]["evaluation_status"] == "DEVELOPING"


def test_absolute_month_rejects_missing_red_to_green_transition() -> None:
    frame = fixture_frame()
    frame.loc[frame.trade_date == "2026-01-30", "close"] = 101
    result = evaluate_absolute_months(
        frame,
        {"TEST"},
        {},
        list(pd.to_datetime(frame.trade_date)),
        "2026-03",
        "2026-03",
        "2026-04-01",
    )
    assert result.runs[0]["qualified_count"] == 0
    assert result.candidates == []


def test_absolute_month_quarantines_unresolved_price_scale_break() -> None:
    frame = fixture_frame()
    frame[["open", "high", "low", "close"]] = frame[["open", "high", "low", "close"]].astype(float)
    frame.loc[frame.trade_date >= "2026-03-11", ["open", "high", "low", "close"]] /= 5
    result = evaluate_absolute_months(
        frame,
        {"TEST"},
        {},
        list(pd.to_datetime(frame.trade_date)),
        "2026-03",
        "2026-03",
        "2026-04-01",
    )
    assert result.runs[0]["qualified_count"] == 0
    assert result.runs[0]["incomplete_symbol_count"] == 1
    assert result.candidates == []


def test_absolute_open_month_uses_open_references_and_same_session_path() -> None:
    frame = fixture_frame()
    # Make the prior monthly open advance while retaining the red-to-green
    # candle transition, then create a Tuesday open above all known references.
    frame.loc[frame.trade_date == "2026-02-02", "open"] = 102
    frame.loc[frame.trade_date == "2026-02-27", ["high", "close"]] = [116, 115]
    frame.loc[frame.trade_date == "2026-03-03", "open"] = 103
    frame.loc[frame.trade_date == "2026-03-09", ["open", "high", "low", "close"]] = [109, 111, 107, 108]
    frame.loc[frame.trade_date == "2026-03-10", ["open", "high", "low", "close"]] = [110, 114, 106, 107]
    result = evaluate_absolute_open_months(
        frame,
        {"TEST"},
        {"TEST": "Test Sector"},
        list(pd.to_datetime(frame.trade_date)),
        "2026-03",
        "2026-03",
        "2026-04-01",
    )
    assert result.runs[0]["strategy_version"] == OPEN_STRATEGY_VERSION
    assert result.runs[0]["methodology"]["comparison_basis"] == "OPEN"
    assert result.runs[0]["qualified_count"] == 1
    candidate = result.candidates[0]
    assert candidate["signal_date"].isoformat() == "2026-03-10"
    assert candidate["entry_price"] == 110
    assert candidate["max_profit_price"] == 120
    assert candidate["max_drawdown_price"] == 106
    assert candidate["observed_post_entry_sessions"] == 3
    assert candidate["data_quality"]["same_day_extremes_included"] is True
    assert all(condition["pass"] for condition in candidate["conditions"] if not condition.get("informational"))


def test_absolute_open_month_does_not_use_signal_close_for_selection() -> None:
    frame = fixture_frame()
    frame.loc[frame.trade_date == "2026-02-02", "open"] = 102
    frame.loc[frame.trade_date == "2026-02-27", ["high", "close"]] = [116, 115]
    frame.loc[frame.trade_date == "2026-03-03", "open"] = 103
    frame.loc[frame.trade_date == "2026-03-09", ["open", "close"]] = [109, 108]
    frame.loc[frame.trade_date == "2026-03-10", ["open", "high", "low", "close"]] = [110, 111, 90, 91]
    result = evaluate_absolute_open_months(
        frame, {"TEST"}, {}, list(pd.to_datetime(frame.trade_date)),
        "2026-03", "2026-03", "2026-04-01",
    )
    assert result.runs[0]["qualified_count"] == 1
    assert result.candidates[0]["entry_price"] == 110
    assert not any(condition["code"] == "D0_OPEN_ABOVE_D1_CLOSE" for condition in result.candidates[0]["conditions"])


def test_absolute_open_month_does_not_require_open_above_previous_close() -> None:
    frame = fixture_frame()
    frame.loc[frame.trade_date == "2026-02-02", "open"] = 102
    frame.loc[frame.trade_date == "2026-02-27", ["high", "close"]] = [116, 115]
    frame.loc[frame.trade_date == "2026-03-03", "open"] = 103
    # The previous session closes above the signal open. Every retained open
    # condition passes, so v2 must qualify without the removed close gate.
    frame.loc[frame.trade_date == "2026-03-09", ["open", "high", "close"]] = [109, 113, 112]
    frame.loc[frame.trade_date == "2026-03-10", ["open", "high", "low", "close"]] = [110, 114, 106, 107]
    result = evaluate_absolute_open_months(
        frame, {"TEST"}, {}, list(pd.to_datetime(frame.trade_date)),
        "2026-03", "2026-03", "2026-04-01",
    )
    assert result.runs[0]["qualified_count"] == 1
    assert result.runs[0]["methodology"]["eligibility_condition_count"] == 6
    assert result.runs[0]["methodology"]["previous_session_close_gate"] is False
    candidate = result.candidates[0]
    assert candidate["signal_date"].isoformat() == "2026-03-10"
    assert candidate["signal_day_open"] == 110
    assert candidate["previous_day_close"] == 112
    assert not any(condition["code"] == "D0_OPEN_ABOVE_D1_CLOSE" for condition in candidate["conditions"])


def test_absolute_month_rejects_unknown_comparison_basis() -> None:
    frame = fixture_frame()
    try:
        evaluate_absolute_months(
            frame, {"TEST"}, {}, list(pd.to_datetime(frame.trade_date)),
            "2026-03", "2026-03", "2026-04-01", comparison_basis="median",
        )
    except ValueError as error:
        assert str(error) == "comparison_basis must be close or open"
    else:
        raise AssertionError("unknown comparison basis must fail")
