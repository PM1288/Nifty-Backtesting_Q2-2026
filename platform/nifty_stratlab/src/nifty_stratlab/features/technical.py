from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

import numpy as np
import pandas as pd


REQUIRED_OHLC_COLUMNS = ("symbol", "event_ts", "open", "high", "low", "close", "volume")


@dataclass(frozen=True)
class FeatureDefinition:
    slug: str
    version: str
    lookback_bars: int
    description: str


FEATURE_DEFINITIONS = (
    FeatureDefinition("rsi_14", "1", 15, "Wilder RSI over 14 completed bars"),
    FeatureDefinition("willr_14", "1", 14, "Williams %R over 14 completed bars"),
    FeatureDefinition("sma20", "1", 20, "20-bar simple moving average"),
    FeatureDefinition("sma50", "1", 50, "50-bar simple moving average"),
    FeatureDefinition("macd_12_26_9", "1", 35, "EMA 12/26 MACD and EMA 9 signal"),
    FeatureDefinition("vwap_session", "1", 1, "Cumulative session VWAP using typical price"),
)


def _wilder_rsi(close: pd.Series, period: int = 14) -> pd.Series:
    """Return ``rsi_wilder_sma_seed_v1`` without library seed ambiguity.

    Pandas ``ewm(adjust=False)`` starts its hidden recursive state at the first
    delta.  Merely hiding the first ``period`` results is therefore not the
    Wilder convention frozen by the Strategy Lab contract.  This implementation
    explicitly seeds with the simple mean of the first ``period`` gains/losses
    and applies Wilder's recursion thereafter.
    """

    values = pd.to_numeric(close, errors="coerce").to_numpy(dtype=float)
    output = np.full(len(values), np.nan, dtype=float)
    if len(values) <= period:
        return pd.Series(output, index=close.index, dtype=float)
    if np.isnan(values).any():
        raise ValueError("RSI input contains missing or non-numeric closes")

    deltas = np.diff(values)
    seed = deltas[:period]
    average_gain = float(np.maximum(seed, 0.0).mean())
    average_loss = float(np.maximum(-seed, 0.0).mean())

    def value(gain: float, loss: float) -> float:
        if gain == 0 and loss == 0:
            return 50.0
        if loss == 0:
            return 100.0
        if gain == 0:
            return 0.0
        return 100.0 - (100.0 / (1.0 + gain / loss))

    output[period] = value(average_gain, average_loss)
    for index in range(period + 1, len(values)):
        delta = values[index] - values[index - 1]
        average_gain = (average_gain * (period - 1) + max(delta, 0.0)) / period
        average_loss = (average_loss * (period - 1) + max(-delta, 0.0)) / period
        output[index] = value(average_gain, average_loss)
    return pd.Series(output, index=close.index, dtype=float)


def _willr(high: pd.Series, low: pd.Series, close: pd.Series, period: int = 14) -> pd.Series:
    highest = high.rolling(period, min_periods=period).max()
    lowest = low.rolling(period, min_periods=period).min()
    span = (highest - lowest).replace(0, np.nan)
    return -100 * (highest - close) / span


def compute_technical_features(frame: pd.DataFrame) -> pd.DataFrame:
    """Compute features per symbol using only current and previous rows.

    The input is never sorted across symbols.  This explicitly prevents the
    invalid cross-sectional RSI/Williams calculation found in the legacy
    bhavcopy script.
    """

    missing = sorted(set(REQUIRED_OHLC_COLUMNS) - set(frame.columns))
    if missing:
        raise ValueError(f"missing columns: {', '.join(missing)}")
    working = frame.copy()
    working["event_ts"] = pd.to_datetime(working["event_ts"], utc=True)
    working = working.sort_values(["symbol", "event_ts"], kind="mergesort").reset_index(drop=True)
    for column in ("open", "high", "low", "close", "volume"):
        working[column] = pd.to_numeric(working[column], errors="coerce")
    if working[["open", "high", "low", "close"]].isna().any().any():
        raise ValueError("OHLC contains non-numeric or missing values")

    pieces: list[pd.DataFrame] = []
    for symbol, group in working.groupby("symbol", sort=False, group_keys=False):
        group = group.copy()
        close = group["close"]
        high = group["high"]
        low = group["low"]
        group["rsi_14"] = _wilder_rsi(close, 14)
        group["willr_14"] = _willr(high, low, close, 14)
        group["sma20"] = close.rolling(20, min_periods=20).mean()
        group["sma50"] = close.rolling(50, min_periods=50).mean()
        ema12 = close.ewm(span=12, adjust=False, min_periods=12).mean()
        ema26 = close.ewm(span=26, adjust=False, min_periods=26).mean()
        group["macd_line"] = ema12 - ema26
        group["macd_signal"] = group["macd_line"].ewm(span=9, adjust=False, min_periods=9).mean()
        group["macd_hist"] = group["macd_line"] - group["macd_signal"]
        group["prev_close"] = close.shift(1)
        group["return_1"] = close.pct_change(fill_method=None)
        group["range_pct"] = (high - low) / group["prev_close"] * 100
        group["close_location_pct"] = np.where(
            high > low,
            (close - low) / (high - low) * 100,
            50.0,
        )
        session_key = group["event_ts"].dt.tz_convert("Asia/Kolkata").dt.date
        typical = (high + low + close) / 3.0
        cumulative_value = (typical * group["volume"]).groupby(session_key).cumsum()
        cumulative_volume = group["volume"].groupby(session_key).cumsum().replace(0, np.nan)
        group["session_vwap"] = cumulative_value / cumulative_volume
        group["above_vwap"] = close > group["session_vwap"]
        group["symbol"] = symbol
        pieces.append(group)
    return pd.concat(pieces, ignore_index=True) if pieces else working


def attach_prior_completed_daily_rsi(frame: pd.DataFrame, period: int = 14) -> pd.DataFrame:
    """Attach daily RSI known before each intraday session starts.

    The close for a session is reduced to one daily observation, RSI is computed
    per symbol, and the result is shifted by one session before it is joined back
    to intraday bars.  Therefore no bar can observe its own day's closing price.
    """

    if period <= 0:
        raise ValueError("period must be positive")
    required = {"symbol", "event_ts", "close"}
    missing = sorted(required - set(frame.columns))
    if missing:
        raise ValueError(f"missing columns: {', '.join(missing)}")
    working = frame.copy()
    working["event_ts"] = pd.to_datetime(working["event_ts"], utc=True)
    working = working.sort_values(["symbol", "event_ts"], kind="mergesort").reset_index(drop=True)
    working["session_date"] = working["event_ts"].dt.tz_convert("Asia/Kolkata").dt.date
    daily = (
        working.groupby(["symbol", "session_date"], sort=False, as_index=False)
        .agg(daily_close=("close", "last"))
        .sort_values(["symbol", "session_date"], kind="mergesort")
    )
    daily["daily_rsi_14"] = daily.groupby("symbol", sort=False)["daily_close"].transform(
        lambda values: _wilder_rsi(pd.to_numeric(values), period)
    )
    daily["daily_rsi_14_prior"] = daily.groupby("symbol", sort=False)["daily_rsi_14"].shift(1)
    return working.merge(
        daily[["symbol", "session_date", "daily_rsi_14_prior"]],
        on=["symbol", "session_date"],
        how="left",
        validate="many_to_one",
    )


def assert_point_in_time_feature_parity(full: pd.DataFrame, prefixes: Iterable[int]) -> None:
    """Raise when computing a prefix changes a feature already visible at its end.

    This detects many accidental future-data dependencies.  It is deliberately
    expensive and intended for tests/qualification, not every production bar.
    """

    complete = compute_technical_features(full)
    feature_columns = [
        "rsi_14",
        "willr_14",
        "sma20",
        "sma50",
        "macd_line",
        "macd_signal",
        "macd_hist",
        "session_vwap",
    ]
    for length in prefixes:
        if length <= 0 or length > len(full):
            raise ValueError(f"invalid prefix length {length}")
        prefix = compute_technical_features(full.iloc[:length])
        left = prefix.iloc[-1][feature_columns]
        right = complete.iloc[length - 1][feature_columns]
        for name in feature_columns:
            a, b = left[name], right[name]
            if pd.isna(a) and pd.isna(b):
                continue
            if not np.isclose(float(a), float(b), rtol=1e-10, atol=1e-10, equal_nan=True):
                raise AssertionError(f"future-data dependency detected for {name} at prefix {length}: {a} != {b}")
