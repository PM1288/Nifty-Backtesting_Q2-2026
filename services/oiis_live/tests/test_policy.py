from oiis_live.policy import (
    DIRECTIONAL_EDGE_THRESHOLDS,
    OFACTOR_THRESHOLDS,
    VOLUME_PERCENTILE_THRESHOLDS,
    canonical_status,
    classify_daily,
    extension_level,
    intraday_entry_eligible,
    price_momentum_entry_evaluation,
    minimum_level,
    wilder_rsi,
    williams_r,
)


def high_row() -> dict:
    return {
        "selected_direction": "LONG", "selected_ofactor": 82, "selected_xfactor": 84,
        "data_quality_score": 95, "data_permission": "FULL", "selected_mrs": 80,
        "selected_siq": 75, "selected_elq": 70, "selected_mss": 80, "rsi_14": 55,
        "willr_14": -40, "close_vs_ema61_pct": 3, "macd_line_pct_close": 1,
        "atr14": 2.5, "close_price": 100, "volume_vs_sma20": 1.1,
        "directional_edge": 9, "volume_percentile_90": 0.6, "extension_atr": 1.1,
        "blocking_reasons": [],
    }


def test_daily_high_is_separate_from_canonical_permission() -> None:
    row = high_row(); result = classify_daily(row)
    assert result.level == "HIGH" and result.selected
    row["selected_ofactor"] = 60
    result = classify_daily(row)
    assert result.level == "LOW"
    assert result.canonical_status == "SCREENING_COHORT_BELOW_CANONICAL_PERMISSION"
    assert not result.selected


def test_unresolved_daily_hard_gate_blocks_screening() -> None:
    row = high_row()
    row["blocking_reasons"] = ["NO_VALID_SETUP"]
    result = classify_daily(row)
    assert result.level == "HIGH"
    assert not result.selected


def test_canonical_boundaries() -> None:
    assert canonical_status(53.99, 100) == "RESEARCH_ONLY_NO_STANDARD_TRADE"
    assert canonical_status(54, 76) == "SCREENING_COHORT_BELOW_CANONICAL_PERMISSION"
    assert canonical_status(73.99, 100) == "SCREENING_COHORT_BELOW_CANONICAL_PERMISSION"
    assert canonical_status(74, 75.99) == "WAIT_FOR_XFACTOR"
    assert canonical_status(74, 76) == "QUALIFIED_FOR_INTRADAY_REVALIDATION"


def test_requested_tier_boundaries() -> None:
    assert minimum_level(54, OFACTOR_THRESHOLDS) == "LOW"
    assert minimum_level(64, OFACTOR_THRESHOLDS) == "MEDIUM"
    assert minimum_level(74, OFACTOR_THRESHOLDS) == "HIGH"
    assert minimum_level(6, DIRECTIONAL_EDGE_THRESHOLDS) == "LOW"
    assert minimum_level(7, DIRECTIONAL_EDGE_THRESHOLDS) == "MEDIUM"
    assert minimum_level(8, DIRECTIONAL_EDGE_THRESHOLDS) == "HIGH"
    assert minimum_level(0.2, VOLUME_PERCENTILE_THRESHOLDS) == "LOW"
    assert minimum_level(0.3, VOLUME_PERCENTILE_THRESHOLDS) == "MEDIUM"
    assert minimum_level(0.5, VOLUME_PERCENTILE_THRESHOLDS) == "HIGH"
    assert extension_level(1.2) == "LOW"
    assert extension_level(1.4) == "MEDIUM"
    assert extension_level(1.5) == "HIGH"
    assert extension_level(1.51) == "ABOVE_MAXIMUM"


def test_intraday_entry_is_strict_and_independent() -> None:
    assert intraday_entry_eligible(29.99, -80.01)
    assert not intraday_entry_eligible(30, -81)
    assert not intraday_entry_eligible(29, -80)


def test_indicator_calculations() -> None:
    closes = [100,99,98,97,96,95,94,93,92,91,90,89,88,87,86]
    assert wilder_rsi(closes) == 0
    highs = [value + 1 for value in closes]
    lows = [value - 1 for value in closes]
    result = williams_r(highs, lows, closes)
    assert result is not None and result < -80


def momentum_bars(hourly_closes: tuple[float, float], fifteen_closes: tuple[float, float]) -> list[dict]:
    ist = ZoneInfo("Asia/Kolkata")
    start = datetime(2026,8,17,9,15,tzinfo=ist)
    bars = []
    for index in range(120):
        hour = index // 60
        value = hourly_closes[hour]
        if index >= 105:
            value = fifteen_closes[1]
        elif index >= 90:
            value = fifteen_closes[0]
        bars.append({"ts":start+timedelta(minutes=index),"close":value})
    return bars


def test_price_momentum_requires_all_three_strict_confirmations() -> None:
    bars = momentum_bars((101,103),(102,103))
    result = price_momentum_entry_evaluation(bars,100)
    assert result["eligible"] is True
    assert all(result["checks"].values())
    assert result["current_hour_close"] == 103
    assert result["previous_hour_close"] == 101


def test_price_momentum_rejects_equal_close_and_incomplete_hour() -> None:
    equal = price_momentum_entry_evaluation(momentum_bars((101,101),(101,101)),100)
    assert equal["eligible"] is False
    assert equal["checks"]["current_hour_above_previous_hour"] is False
    incomplete = price_momentum_entry_evaluation(momentum_bars((101,103),(102,103))[:-1],100)
    assert incomplete["eligible"] is False
    assert incomplete["state"] == "WAIT_CANDLES"


def test_price_momentum_requires_previous_official_close() -> None:
    result = price_momentum_entry_evaluation(momentum_bars((101,103),(102,103)),None)
    assert result == {"eligible":False,"state":"WAIT_DATA","reason":"PREVIOUS_CLOSE_OR_BARS_MISSING"}
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
