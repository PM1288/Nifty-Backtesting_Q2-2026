from oiis_live.policy import canonical_status, classify_daily, intraday_entry_eligible, wilder_rsi, williams_r


def high_row() -> dict:
    return {
        "selected_direction": "LONG", "selected_ofactor": 82, "selected_xfactor": 84,
        "data_quality_score": 95, "data_permission": "FULL", "selected_mrs": 80,
        "selected_siq": 75, "selected_elq": 70, "selected_mss": 80, "rsi_14": 55,
        "willr_14": -40, "close_vs_ema61_pct": 3, "macd_line_pct_close": 1,
        "atr14": 2.5, "close_price": 100, "volume_vs_sma20": 1.1,
    }


def test_daily_high_is_separate_from_canonical_permission() -> None:
    row = high_row(); result = classify_daily(row)
    assert result.level == "HIGH" and result.selected
    row["selected_ofactor"] = 60
    result = classify_daily(row)
    assert result.level == "HIGH"
    assert result.canonical_status == "RESEARCH_ONLY_NO_STANDARD_TRADE"
    assert not result.selected


def test_unresolved_daily_hard_gate_blocks_screening() -> None:
    row = high_row()
    row["hard_gates"] = ["TRIGGER_CONFIRMATION_MISSING"]
    result = classify_daily(row)
    assert result.level == "NO_CANDIDATE"
    assert not result.selected
    assert not result.conditions["HIGH"]["no_unresolved_hard_gate"]


def test_canonical_boundaries() -> None:
    assert canonical_status(64.99, 100) == "RESEARCH_ONLY_NO_STANDARD_TRADE"
    assert canonical_status(73.99, 100) == "UPGRADE_OFACTOR_REQUIRED"
    assert canonical_status(74, 75.99) == "WAIT_FOR_XFACTOR"
    assert canonical_status(74, 76) == "QUALIFIED_FOR_INTRADAY_REVALIDATION"


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
