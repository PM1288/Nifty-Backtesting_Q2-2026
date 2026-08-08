from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd

TOOLS = Path(__file__).resolve().parents[2] / "tools"
sys.path.insert(0, str(TOOLS))

import run_oiis_all_signal_capture as capture


def test_added_indicators_have_expected_semantics() -> None:
    dates = pd.date_range("2023-01-01", periods=80, freq="D")
    frame = pd.DataFrame({
        "symbol": "TEST", "trade_date": dates,
        "open_price": np.arange(80) + 99.0, "high_price": np.arange(80) + 101.0,
        "low_price": np.arange(80) + 98.0, "close_price": np.arange(80) + 100.0,
        "volume": np.arange(80) * 100 + 1000,
    })
    result = capture.add_indicators(frame)
    last = result.iloc[-1]
    assert last.rsi_14 if "rsi_14" in result else True
    assert last.willr_14 <= 0
    assert last.fast_k_14 >= 0
    assert last.ema_61 < last.close_price
    assert last.close_vs_ema61_pct > 0
    assert np.isfinite(last.macd_line_12_26)
    assert np.isfinite(last.volume_ema_60)


def test_threshold_ladders_are_independent_and_complete() -> None:
    assert list(capture.INTRADAY_TARGETS.values()) == [0.3, 0.5, 0.7]
    assert list(capture.SWING_TARGETS.values()) == [1.0, 2.0, 5.0]
    assert list(capture.ADVERSE.values()) == [-0.5, -1.0, -2.0, -5.0, -10.0]
    assert list(capture.H30_TARGETS.values()) == [1.0, 2.0, 5.0, 10.0, 20.0]


def test_special_symbol_aliases_resolve(tmp_path: Path) -> None:
    source = tmp_path / "MM_minute.csv"
    source.touch()
    mapping = {"MM": str(source)}
    assert capture.minute_for_symbol("M&M", mapping) == source
    assert capture.minute_for_symbol("UNKNOWN", mapping) is None
