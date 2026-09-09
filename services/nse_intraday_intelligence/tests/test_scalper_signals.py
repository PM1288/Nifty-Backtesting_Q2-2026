from datetime import datetime, timedelta, timezone

from nse_intraday_intelligence.scalper_signals import Candle, detect_paired_signals, render_whatsapp


START = datetime(2026, 9, 9, 4, 0, tzinfo=timezone.utc)


def candle(index: int, open_: float, close: float, ema: float) -> Candle:
    return Candle(START + timedelta(minutes=index * 5), open_, max(open_, close) + 1, min(open_, close) - 1, close, ema)


def test_call_requires_paired_two_red_then_body80_cross_and_next_open():
    nifty = [candle(0,100,98,101), candle(1,99,97,100), candle(2,99,109,101), candle(3,104,106,103)]
    call = [candle(0,24,22,25), candle(1,23,21,24), candle(2,22,32,24), candle(3,30,31,29)]
    result = detect_paired_signals(nifty, call, [], 5)
    assert len(result) == 1
    assert result[0]["direction"] == "CALL"
    assert result[0]["underlying_fraction"] == .8
    assert result[0]["option_fraction"] == .8
    assert "NIFTY CALL ENTRY · 5m" in render_whatsapp(result[0], "NIFTY09SEP23500CE", 5)


def test_put_requires_bearish_nifty_and_bullish_pe_reversal():
    nifty = [candle(0,100,102,99), candle(1,101,103,100), candle(2,109,99,107), candle(3,100,98,101)]
    put = [candle(0,24,22,25), candle(1,23,21,24), candle(2,22,32,24), candle(3,31,33,30)]
    result = detect_paired_signals(nifty, [], put, 5)
    assert len(result) == 1
    assert result[0]["direction"] == "PUT"


def test_missing_option_and_just_below_threshold_are_rejected():
    nifty = [candle(0,100,98,101), candle(1,99,97,100), candle(2,99,109,101), candle(3,104,106,103)]
    assert detect_paired_signals(nifty, [], [], 5) == []
    weak_call = [candle(0,24,22,25), candle(1,23,21,24), candle(2,22,32,24.001), candle(3,30,31,29)]
    assert detect_paired_signals(nifty, weak_call, [], 5) == []


def test_same_rule_operates_independently_on_all_supported_intervals():
    for interval in (1, 5, 15):
        def at(index: int, open_: float, close: float, ema: float) -> Candle:
            return Candle(START + timedelta(minutes=index * interval), open_, max(open_, close) + 1, min(open_, close) - 1, close, ema)

        nifty = [at(0,100,98,101), at(1,99,97,100), at(2,99,109,101), at(3,104,106,103)]
        call = [at(0,24,22,25), at(1,23,21,24), at(2,22,32,24), at(3,30,31,29)]
        result = detect_paired_signals(nifty, call, [], interval)
        assert len(result) == 1
        assert f"ENTRY · {interval}m" in render_whatsapp(result[0], "NIFTY09SEP23500CE", interval)
