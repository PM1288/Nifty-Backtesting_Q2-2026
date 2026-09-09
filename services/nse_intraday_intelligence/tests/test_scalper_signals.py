from datetime import datetime, timedelta, timezone

from nse_intraday_intelligence.scalper_signals import BODY_THRESHOLD, MIN_SIGNAL_CANDLES, Candle, _excursion, detect_paired_signals, render_whatsapp


START = datetime(2026, 9, 9, 4, 0, tzinfo=timezone.utc)


def test_live_evaluator_requires_complete_ema_pattern_and_next_open_history():
    assert MIN_SIGNAL_CANDLES == 12
    assert BODY_THRESHOLD == .70


def candle(index: int, open_: float, close: float, ema: float) -> Candle:
    return Candle(START + timedelta(minutes=index * 5), open_, max(open_, close) + 1, min(open_, close) - 1, close, ema)


def test_call_requires_both_underlying_and_ce_bodies_below_ema_then_paired_70pct_cross():
    nifty = [candle(0,100,98,101), candle(1,97,99,100), candle(2,99,109,102), candle(3,104,106,103)]
    call = [candle(0,22,20,23), candle(1,19,21,22), candle(2,22,32,25), candle(3,30,31,29)]
    result = detect_paired_signals(nifty, call, [], 5)
    assert len(result) == 1
    assert result[0]["direction"] == "CALL"
    assert result[0]["underlying_fraction"] == .7
    assert result[0]["option_fraction"] == .7
    assert [row["colour"] for row in result[0]["option_precursors"]] == ["RED", "GREEN"]
    assert result[0]["conditions"]["option_precursors_required"] is True
    assert result[0]["conditions"]["precursor_colour_required"] is False
    assert "NIFTY CALL ENTRY · 5m" in render_whatsapp(result[0], "NIFTY09SEP23500CE", 5)


def test_put_requires_bearish_nifty_and_bullish_pe_reversal():
    nifty = [candle(0,100,102,99), candle(1,103,101,100), candle(2,109,99,106), candle(3,100,98,101)]
    put = [candle(0,24,22,25), candle(1,21,23,24), candle(2,22,32,25), candle(3,31,33,30)]
    result = detect_paired_signals(nifty, [], put, 5)
    assert len(result) == 1
    assert result[0]["direction"] == "PUT"


def test_missing_option_and_just_below_threshold_are_rejected():
    nifty = [candle(0,100,98,101), candle(1,99,97,100), candle(2,99,109,102), candle(3,104,106,103)]
    assert detect_paired_signals(nifty, [], [], 5) == []
    weak_call = [candle(0,24,22,25), candle(1,23,21,24), candle(2,22,32,25.001), candle(3,30,31,29)]
    assert detect_paired_signals(nifty, weak_call, [], 5) == []


def test_precursor_open_and_close_must_both_be_on_required_ema_side():
    # The close is below EMA9, but the first open is above it: reject.
    nifty = [candle(0,102,98,101), candle(1,99,97,100), candle(2,99,109,102), candle(3,104,106,103)]
    call = [candle(0,22,20,23), candle(1,21,19,22), candle(2,22,32,25), candle(3,30,31,29)]
    assert detect_paired_signals(nifty, call, [], 5) == []


def test_selected_option_precursor_position_is_a_hard_gate():
    nifty = [candle(0,100,98,101), candle(1,99,97,100), candle(2,99,109,102), candle(3,104,106,103)]
    # First CE body sits above EMA9 even though its setup crosses correctly.
    invalid_call = [candle(0,22,24,21), candle(1,21,19,22), candle(2,22,32,25), candle(3,30,31,29)]
    assert detect_paired_signals(nifty, invalid_call, [], 5) == []


def test_same_rule_operates_independently_on_all_supported_intervals():
    for interval in (1, 5, 15):
        def at(index: int, open_: float, close: float, ema: float) -> Candle:
            return Candle(START + timedelta(minutes=index * interval), open_, max(open_, close) + 1, min(open_, close) - 1, close, ema)

        nifty = [at(0,100,98,101), at(1,99,97,100), at(2,99,109,102), at(3,104,106,103)]
        call = [at(0,24,22,25), at(1,21,23,24), at(2,22,32,25), at(3,30,31,29)]
        result = detect_paired_signals(nifty, call, [], interval)
        assert len(result) == 1
        assert f"ENTRY · {interval}m" in render_whatsapp(result[0], "NIFTY09SEP23500CE", interval)


def test_whatsapp_uses_the_evaluated_stock_identity_not_a_fixed_index():
    underlying = [candle(0,100,98,101), candle(1,99,97,100), candle(2,99,109,102), candle(3,104,106,103)]
    call = [candle(0,24,22,25), candle(1,21,23,24), candle(2,22,32,25), candle(3,30,31,29)]
    signal = detect_paired_signals(underlying, call, [], 5)[0]
    message = render_whatsapp(signal, "RELIANCE30SEP3000CE", 5, "RELIANCE")
    assert message.startswith("RELIANCE CALL ENTRY · 5m")
    assert "| RELIANCE 104.00" in message
    assert "Confirmed: RELIANCE 70.0% above EMA9" in message
    assert "two full precursor bodies beyond EMA9" in message


def test_forward_excursion_uses_entry_open_and_preserves_missing():
    rows = [
        {"ts": START, "high": 12, "low": 9, "close": 11},
        {"ts": START + timedelta(minutes=1), "high": 15, "low": 8, "close": 12},
    ]
    result = _excursion(rows, START, START + timedelta(minutes=15), 10)
    assert result["max"] == 15
    assert result["max_change"] == 5
    assert result["max_change_pct"] == 50
    assert result["min"] == 8
    assert result["endpoint"] == 12
    assert result["endpoint_change"] == 2
    assert result["trend"] == "BULLISH"
    missing = _excursion([], START, START + timedelta(minutes=15), 10)
    assert missing["state"] == "DATA_INSUFFICIENT"
    assert missing["trend"] == "DATA_INSUFFICIENT"


def test_forward_excursion_labels_bearish_and_flat_from_latest_close():
    bearish = [{"ts": START, "high": 11, "low": 8, "close": 9}]
    flat = [{"ts": START, "high": 11, "low": 9, "close": 10}]
    assert _excursion(bearish, START, START + timedelta(minutes=1), 10)["trend"] == "BEARISH"
    assert _excursion(flat, START, START + timedelta(minutes=1), 10)["trend"] == "FLAT"
