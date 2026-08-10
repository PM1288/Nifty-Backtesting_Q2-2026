from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import numpy as np
import pandas as pd


TOOL = Path(__file__).resolve().parents[1] / "tools" / "export_fno_daily_technical_dataset.py"
SPEC = importlib.util.spec_from_file_location("fno_daily_export", TOOL)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


def sample_frame(symbol: str = "TEST") -> pd.DataFrame:
    close = np.linspace(100, 140, 80)
    return pd.DataFrame(
        {
            "trade_date": pd.date_range("2025-01-01", periods=80, freq="B").date,
            "symbol": symbol,
            "sector": "TEST_SECTOR",
            "open": close - 0.5,
            "high": close + 1.0,
            "low": close - 1.0,
            "close": close,
            "adjusted_close": close,
            "volume": np.arange(1_000, 1_080),
        }
    )


def test_indicator_columns_are_point_in_time_and_finite_after_warmup() -> None:
    result = MODULE.calculate_indicators(sample_frame())
    required = {
        "rsi_14", "willr_14", "macd_line_12_26", "macd_signal_9", "macd_histogram",
        "bb_upper_20_2", "bb_lower_20_2", "atr_14", "adx_14", "stoch_fast_k_14",
        "rolling_vwap_20_proxy", "anchored_vwap_ytd_proxy", "volume_ema_60", "obv",
    }
    assert required.issubset(result.columns)
    last = result.iloc[-1]
    assert last.rsi_14 == 100
    assert -100 <= last.willr_14 <= 0
    assert last.bb_lower_20_2 < last.close < last.bb_upper_20_2
    assert np.isfinite(last.macd_histogram)
    assert np.isfinite(last.rolling_vwap_20_proxy)


def test_breadth_counts_all_states_and_scopes() -> None:
    base = sample_frame("AAA").iloc[:2].copy()
    other = sample_frame("BBB").iloc[:2].copy()
    base["change"] = [np.nan, 2]
    other["change"] = [np.nan, -1]
    equities = pd.concat([base, other], ignore_index=True)
    result = MODULE.calculate_breadth(equities, {"AAA"})
    all_fno = result[(result.scope_type == "FNO") & (result.scope_name == "ALL_FNO")]
    second = all_fno.sort_values("trade_date").iloc[-1]
    assert second.advances == 1
    assert second.declines == 1
    assert second.unchanged == 0
    assert second.total == 2
