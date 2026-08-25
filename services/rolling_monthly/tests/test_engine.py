from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

from rolling_monthly.engine import (
    MarketContext,
    coverage_reasons,
    prepare_series,
    scanner_checks,
    score_candidate,
)
from rolling_monthly.service import last_tuesday


CONFIG = json.loads((Path(__file__).parents[1] / "config" / "factor_v2.json").read_text())


def test_last_tuesday_matches_monthly_expiry_anchor() -> None:
    assert str(last_tuesday(2026, 2)) == "2026-02-24"
    assert str(last_tuesday(2026, 3)) == "2026-03-31"
    assert str(last_tuesday(2026, 7)) == "2026-07-28"


def evidence(side: str) -> pd.Series:
    values = {
        "m1_open": 100, "m1_close": 110, "m2_open": 105,
        "w0_open": 100, "w1_open": 105, "previous_open": 105,
        "open": 100, "close": 110,
    }
    if side == "SHORT":
        values.update(m1_open=110, m1_close=90, m2_open=95, w0_open=110, w1_open=95, previous_open=95, open=110, close=90)
    return pd.Series(values)


def scoring_row(side: str = "LONG") -> pd.Series:
    return pd.Series({
        "close": 108.0 if side == "LONG" else 92.0,
        "w0_open": 100.0,
        "ema200": 100.0,
        "ema200_lag5": 99.8,
        "vwap20": 102.0 if side == "LONG" else 96.0,
        "next_open": 108.0 if side == "LONG" else 92.0,
        "previous_open": 104.0 if side == "LONG" else 94.0,
        "ema50": 101.0 if side == "LONG" else 95.0,
        "ema50_lag5": 100.8 if side == "LONG" else 94.8,
        "macd_line": 0.2 if side == "LONG" else -0.2,
        "atr14": 3.0,
        "atr14_pct": 3.0,
        "rsi14": 65.0 if side == "LONG" else 45.0,
        "adx14": 20.0,
    })


def test_six_scanner_rules_are_side_specific_and_all_required() -> None:
    assert scanner_checks(evidence("LONG"), "LONG") == [True] * 6
    assert scanner_checks(evidence("SHORT"), "SHORT") == [True] * 6
    failed = evidence("LONG")
    failed["close"] = failed["open"]
    assert scanner_checks(failed, "LONG")[-1] is False


def test_long_high_requires_all_mandatory_gates_and_extension() -> None:
    context = MarketContext(-4.0, 25.0, 20.0, 26, 24, 50)
    result = score_candidate(scoring_row(), "LONG", context, 20, 237, CONFIG)
    assert result["quality_band"] == "HIGH"
    assert result["mandatory_gate_pass"] is True
    assert result["deployment_action"] == "SHADOW_ONLY"


def test_long_gate_boundary_is_inclusive() -> None:
    context = MarketContext(-3.6, 22.0, 20.0, 25, 25, 50)
    row = scoring_row()
    row["close"] = 103.0
    result = score_candidate(row, "LONG", context, 10, 237, CONFIG)
    assert result["mandatory_gate_pass"] is True


def test_short_high_and_direction_normalisation() -> None:
    # 15 net declines -> 30% direction-normalised breadth, 30/200 -> 15% density.
    context = MarketContext(1.0, 20.0, 25.0, 10, 25, 50)
    result = score_candidate(scoring_row("SHORT"), "SHORT", context, 30, 200, CONFIG)
    assert result["mandatory_gate_pass"] is True
    assert result["confirmation_count"] >= 5
    assert result["quality_band"] == "HIGH"
    assert result["entry_eligible"] is True


def test_missing_entry_is_rejected_without_changing_scanner() -> None:
    row = scoring_row()
    row["next_open"] = float("nan")
    context = MarketContext(-4.0, 25.0, 20.0, 26, 24, 50)
    result = score_candidate(row, "LONG", context, 20, 237, CONFIG)
    assert result["entry_eligible"] is False
    assert result["entry_rejection_reason"] == "MISSING_ENTRY"


def test_week_close_is_point_in_time_and_month_is_completed() -> None:
    dates = pd.to_datetime(["2025-11-03", "2025-11-28", "2025-12-01", "2025-12-31", "2026-01-05", "2026-01-06", "2026-01-09"])
    close = [81, 84, 92, 95, 102, 108, 120]
    frame = pd.DataFrame({"trade_date": dates, "open": [80,82,90,92,100,105,107], "high": [82,85,93,96,103,109,121], "low": [79,81,89,91,99,104,106], "close": close, "volume": [1000]*7})
    result = prepare_series(frame)
    tuesday = result[result.trade_date.eq(pd.Timestamp("2026-01-06"))].iloc[0]
    assert tuesday.close == 108
    assert tuesday.w0_open == 100
    assert tuesday.m1_open == 90
    assert tuesday.m1_close == 95


def test_partial_previous_month_is_rejected_instead_of_using_first_available_open() -> None:
    expected = pd.to_datetime([
        "2026-06-29", "2026-06-30",
        "2026-07-01", "2026-07-02", "2026-07-20", "2026-07-31",
        "2026-08-03", "2026-08-04",
    ])
    # Reproduces the research-fixture defect: an established stock disappears
    # for the first two July sessions, then reappears on 20 July.
    observed = pd.to_datetime([
        "2026-06-29", "2026-06-30", "2026-07-20", "2026-07-31",
        "2026-08-03", "2026-08-04",
    ])
    frame = pd.DataFrame({
        "trade_date": observed,
        "open": [90, 91, 110, 108, 112, 114],
        "high": [92, 93, 112, 111, 116, 117],
        "low": [89, 90, 109, 107, 111, 113],
        "close": [91, 92, 111, 110, 115, 116],
        "volume": [1000] * len(observed),
    })
    result = prepare_series(frame, expected)
    signal = result[result.trade_date.eq(pd.Timestamp("2026-08-03"))].iloc[0]
    assert signal.m1_open == 110  # first observed value remains auditable
    assert signal.m1_sessions_complete is False or not bool(signal.m1_sessions_complete)
    assert signal.scanner_inputs_complete is False or not bool(signal.scanner_inputs_complete)
    assert "PREVIOUS_MONTH_INCOMPLETE" in coverage_reasons(signal)
    assert scanner_checks(signal, "LONG") == [False] * 6


def test_complete_calendar_period_preserves_confirmed_scanner_semantics() -> None:
    expected = pd.to_datetime([
        "2026-06-29", "2026-06-30", "2026-07-01", "2026-07-02",
        "2026-07-20", "2026-07-31", "2026-08-03", "2026-08-04",
    ])
    frame = pd.DataFrame({
        "trade_date": expected,
        "open": [90, 91, 100, 101, 103, 106, 110, 114],
        "high": [92, 93, 102, 103, 105, 111, 116, 117],
        "low": [89, 90, 99, 100, 102, 105, 109, 113],
        "close": [91, 92, 101, 102, 104, 110, 115, 116],
        "volume": [1000] * len(expected),
    })
    result = prepare_series(frame, expected)
    signal = result[result.trade_date.eq(pd.Timestamp("2026-08-03"))].iloc[0]
    assert bool(signal.scanner_inputs_complete)
    assert scanner_checks(signal, "LONG") == [True] * 6
    assert signal.next_date == pd.Timestamp("2026-08-04")
    assert signal.next_open == 114


def test_missing_next_session_blocks_entry_but_not_the_confirmed_signal() -> None:
    expected = pd.to_datetime([
        "2026-06-29", "2026-06-30", "2026-07-01", "2026-07-02",
        "2026-07-20", "2026-07-31", "2026-08-03", "2026-08-04",
    ])
    observed = expected[:-1]
    frame = pd.DataFrame({
        "trade_date": observed,
        "open": [90, 91, 100, 101, 103, 106, 110],
        "high": [92, 93, 102, 103, 105, 111, 116],
        "low": [89, 90, 99, 100, 102, 105, 109],
        "close": [91, 92, 101, 102, 104, 110, 115],
        "volume": [1000] * len(observed),
    })
    result = prepare_series(frame, expected)
    signal = result.iloc[-1]
    assert bool(signal.scanner_inputs_complete)
    assert not bool(signal.entry_input_complete)
    assert scanner_checks(signal, "LONG") == [True] * 6
    assert "NEXT_SESSION_MISSING" in coverage_reasons(signal)
