"""Deterministic inventory of immutable stock-minute CSV evidence."""

from __future__ import annotations

import hashlib
from collections import Counter
from pathlib import Path
from typing import Iterable

import pandas as pd

EXPECTED_COLUMNS = ("date", "open", "high", "low", "close", "volume")


def sha256_file(path: Path, block_size: int = 8 * 1024 * 1024) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(block_size), b""):
            digest.update(block)
    return digest.hexdigest()


def load_calendar(path: Path) -> set:
    frame = pd.read_csv(path, usecols=["date"])
    return set(pd.to_datetime(frame["date"], errors="coerce").dropna().dt.date)


def inspect_minute_csv(path: Path, calendar: set, chunksize: int = 250_000) -> dict:
    row_count = invalid_timestamp_count = duplicate_timestamp_count = 0
    out_of_session_rows = ohlc_failures = 0
    timestamps_seen: set[int] = set()
    session_counts: Counter = Counter()
    minimum = maximum = None
    columns = list(pd.read_csv(path, nrows=0).columns)
    missing_columns = sorted(set(EXPECTED_COLUMNS) - set(columns))
    if missing_columns:
        return {
            "path": str(path.resolve()), "symbol": path.stem, "sha256": sha256_file(path),
            "row_count": 0, "minimum_timestamp": None, "maximum_timestamp": None,
            "invalid_timestamp_count": 0, "duplicate_timestamp_count": 0,
            "expected_sessions": 0, "present_sessions": 0, "partial_sessions": 0,
            "missing_minute_ranges": "NOT_EVALUATED_MISSING_COLUMNS",
            "out_of_session_rows": 0, "ohlc_consistency_failures": 0,
            "corporate_action_reconciliation_status": "NOT_EVALUATED",
            "research_admission_status": "REJECT", "research_admission_reason": f"MISSING_COLUMNS:{'|'.join(missing_columns)}",
        }
    for chunk in pd.read_csv(path, usecols=list(EXPECTED_COLUMNS), chunksize=chunksize):
        row_count += len(chunk)
        ts = pd.to_datetime(chunk["date"], errors="coerce")
        invalid_timestamp_count += int(ts.isna().sum())
        valid = ts.notna()
        ts_valid = ts[valid]
        if not ts_valid.empty:
            chunk_min, chunk_max = ts_valid.min(), ts_valid.max()
            minimum = chunk_min if minimum is None else min(minimum, chunk_min)
            maximum = chunk_max if maximum is None else max(maximum, chunk_max)
            encoded = ts_valid.astype("int64")
            for value in encoded:
                numeric = int(value)
                if numeric in timestamps_seen:
                    duplicate_timestamp_count += 1
                else:
                    timestamps_seen.add(numeric)
            dates = ts_valid.dt.date
            times = ts_valid.dt.hour * 60 + ts_valid.dt.minute
            market = (times >= 9 * 60 + 15) & (times <= 15 * 60 + 30) & (ts_valid.dt.weekday < 5)
            out_of_session_rows += int((~market).sum())
            for session, count in dates[market].value_counts().items():
                session_counts[session] += int(count)
        numeric = chunk[["open", "high", "low", "close"]].apply(pd.to_numeric, errors="coerce")
        consistent = (
            numeric.notna().all(axis=1) & (numeric["low"] > 0)
            & (numeric["low"] <= numeric[["open", "close"]].min(axis=1))
            & (numeric["high"] >= numeric[["open", "close"]].max(axis=1))
            & (numeric["high"] >= numeric["low"])
        )
        ohlc_failures += int((~consistent).sum())
    present_dates = set(session_counts)
    expected_dates = {day for day in calendar if minimum and maximum and minimum.date() <= day <= maximum.date()}
    partial = sum(count < 370 for count in session_counts.values())
    missing_sessions = sorted(expected_dates - present_dates)
    reason_parts = []
    if invalid_timestamp_count: reason_parts.append("INVALID_TIMESTAMPS")
    if ohlc_failures: reason_parts.append("OHLC_FAILURES")
    if duplicate_timestamp_count: reason_parts.append("DUPLICATES_FILTER_REQUIRED")
    if out_of_session_rows: reason_parts.append("MARKET_SESSION_FILTER_REQUIRED")
    if partial: reason_parts.append("PARTIAL_SESSIONS_ENTRY_GATED")
    # Isolated malformed bars are excluded by the execution loader. Rejecting
    # an otherwise usable decade-long symbol because of one malformed row is
    # unnecessarily destructive; only a material (>=1%) OHLC defect rate or
    # an unparseable timestamp estate blocks research admission.
    ohlc_failure_rate = ohlc_failures / row_count if row_count else 1.0
    status = (
        "REJECT"
        if invalid_timestamp_count or ohlc_failure_rate >= 0.01
        else "PASS_WITH_FILTERS" if reason_parts else "PASS"
    )
    return {
        "path": str(path.resolve()), "symbol": path.stem, "sha256": sha256_file(path),
        "row_count": row_count, "minimum_timestamp": minimum.isoformat() if minimum is not None else None,
        "maximum_timestamp": maximum.isoformat() if maximum is not None else None,
        "invalid_timestamp_count": invalid_timestamp_count,
        "duplicate_timestamp_count": duplicate_timestamp_count,
        "expected_sessions": len(expected_dates), "present_sessions": len(present_dates),
        "partial_sessions": partial, "missing_minute_ranges": _compress_dates(missing_sessions),
        "out_of_session_rows": out_of_session_rows, "ohlc_consistency_failures": ohlc_failures,
        "ohlc_consistency_failure_rate": ohlc_failure_rate,
        "corporate_action_reconciliation_status": "REQUIRES_POINT_IN_TIME_ACTION_FEED",
        "research_admission_status": status,
        "research_admission_reason": "|".join(reason_parts) if reason_parts else "QUALIFIED",
    }


def _compress_dates(values: Iterable) -> str:
    values = list(values)
    if not values:
        return ""
    if len(values) <= 20:
        return "|".join(value.isoformat() for value in values)
    return "|".join(value.isoformat() for value in values[:10]) + f"|...{len(values)-20}_MORE...|" + "|".join(value.isoformat() for value in values[-10:])


def inventory_directory(directory: Path, calendar_path: Path) -> pd.DataFrame:
    calendar = load_calendar(calendar_path)
    rows = [inspect_minute_csv(path, calendar) for path in sorted(directory.glob("*.csv"))]
    return pd.DataFrame(rows)
