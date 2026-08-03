from __future__ import annotations

import importlib.util
from pathlib import Path

import pandas as pd


SCRIPT = Path(__file__).resolve().parents[2] / "tools/import_nifty_minute_csv.py"
SPEC = importlib.util.spec_from_file_location("csv_minute_import", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


def test_qualifier_keeps_only_valid_regular_session_ist_rows(tmp_path):
    csv_path = tmp_path / "AAA.csv"
    pd.DataFrame(
        [
            {"date": "2025-01-02 09:14:00", "open": 100, "high": 101, "low": 99, "close": 100, "volume": 10},
            {"date": "2025-01-02 09:15:00", "open": 100, "high": 101, "low": 99, "close": 100.5, "volume": 10},
            {"date": "2025-01-02 15:29:00", "open": 101, "high": 102, "low": 100, "close": 101.5, "volume": 20},
            {"date": "2025-01-02 15:30:00", "open": 101, "high": 102, "low": 100, "close": 101, "volume": 20},
            {"date": "2025-01-04 10:00:00", "open": 101, "high": 102, "low": 100, "close": 101, "volume": 20},
        ]
    ).to_csv(csv_path, index=False)
    frame, diagnostics = MODULE.load_and_qualify(csv_path, "AAA", None, None)
    assert len(frame) == 3
    assert diagnostics["accepted_rows"] == 3
    assert diagnostics["rejected_rows"] == 2
    assert str(frame.iloc[0]["event_ts"]) == "2025-01-02 03:45:00+00:00"
    assert diagnostics["session_filter"].endswith("special weekend sessions retained")


def test_qualifier_rejects_bad_ohlc_and_deduplicates(tmp_path):
    csv_path = tmp_path / "AAA.csv"
    pd.DataFrame(
        [
            {"date": "2025-01-02 09:15:00", "open": 100, "high": 99, "low": 98, "close": 100, "volume": 10},
            {"date": "2025-01-02 09:16:00", "open": 100, "high": 101, "low": 99, "close": 100, "volume": 10},
            {"date": "2025-01-02 09:16:00", "open": 100, "high": 102, "low": 99, "close": 101, "volume": 20},
        ]
    ).to_csv(csv_path, index=False)
    frame, diagnostics = MODULE.load_and_qualify(csv_path, "AAA", None, None)
    assert len(frame) == 1
    assert frame.iloc[0]["close"] == 101
    assert diagnostics["invalid_ohlcv_rows"] == 1
    assert diagnostics["duplicate_timestamp_rows"] == 1
