from __future__ import annotations

import hashlib
from dataclasses import dataclass
from datetime import date
from typing import Any

import pandas as pd


STRATEGY_VERSION = "rolling_5_30_60_bullish_long_v1"


@dataclass(frozen=True)
class RollingWindowResult:
    candidates: list[dict[str, Any]]
    evaluations: list[dict[str, Any]]
    source_end_date: date


CONDITION_META = (
    ("OLDER_30_RED", "Older 30-session candle close < open"),
    ("RECENT_30_GREEN", "Recent 30-session candle close > open"),
    ("RECENT_CLOSE_ABOVE_OLDER_OPEN", "Recent close > older 60-session open"),
    ("CLOSE_ABOVE_5_SESSION_OPEN", "Signal close > 5-session open"),
    ("CLOSE_ABOVE_10_SESSION_OPEN", "Signal close > 10-session open"),
    ("CLOSE_ABOVE_PREVIOUS_DAY_OPEN", "Signal close > previous-session open"),
    ("SIGNAL_DAY_GREEN", "Signal close > signal-session open"),
)


def _checks(values: pd.DataFrame, index: int) -> tuple[dict[str, bool], dict[str, float]]:
    row = values.iloc[index]
    factors = {
        "older_block_open": float(values.iloc[index - 59].open),
        "older_block_close": float(values.iloc[index - 30].close),
        "recent_block_open": float(values.iloc[index - 29].open),
        "prior_week_open": float(values.iloc[index - 9].open),
        "current_week_open": float(values.iloc[index - 4].open),
        "previous_day_open": float(values.iloc[index - 1].open),
        "signal_day_open": float(row.open),
        "signal_close": float(row.close),
    }
    checks = {
        "OLDER_30_RED": factors["older_block_close"] < factors["older_block_open"],
        "RECENT_30_GREEN": factors["signal_close"] > factors["recent_block_open"],
        "RECENT_CLOSE_ABOVE_OLDER_OPEN": factors["signal_close"] > factors["older_block_open"],
        "CLOSE_ABOVE_5_SESSION_OPEN": factors["signal_close"] > factors["current_week_open"],
        "CLOSE_ABOVE_10_SESSION_OPEN": factors["signal_close"] > factors["prior_week_open"],
        "CLOSE_ABOVE_PREVIOUS_DAY_OPEN": factors["signal_close"] > factors["previous_day_open"],
        "SIGNAL_DAY_GREEN": factors["signal_close"] > factors["signal_day_open"],
    }
    return checks, factors


def evaluate_rolling_windows(
    frame: pd.DataFrame,
    universe: set[str],
    source_end_date: date,
    years: int = 3,
) -> RollingWindowResult:
    """Evaluate calendar-independent 5/30/60-session signals.

    A row is emitted only on the first session of a qualifying run. Entry is
    the next observed session open and evidence is tracked for at most 30
    subsequent exchange sessions. No future observation is used by the signal.
    """
    required = {"trade_date", "symbol", "open", "high", "low", "close"}
    missing = required - set(frame.columns)
    if missing:
        raise ValueError(f"rolling-window frame missing columns: {sorted(missing)}")
    cutoff = pd.Timestamp(source_end_date) - pd.DateOffset(years=years)
    candidates: list[dict[str, Any]] = []
    prepared: dict[str, pd.DataFrame] = {}
    for symbol in sorted(universe):
        values = frame.loc[frame.symbol.eq(symbol), list(required)].copy()
        values["trade_date"] = pd.to_datetime(values["trade_date"]).dt.normalize()
        values = values.sort_values("trade_date").drop_duplicates("trade_date", keep="last").reset_index(drop=True)
        if len(values) < 61:
            continue
        for column in ("open", "high", "low", "close"):
            values[column] = pd.to_numeric(values[column], errors="coerce")
        prepared[symbol] = values
        qualifies_previous = False
        for index in range(59, len(values) - 1):
            row = values.iloc[index]
            checks, factors = _checks(values, index)
            qualifies = all(checks.values())
            signal_date = pd.Timestamp(row.trade_date)
            if qualifies and not qualifies_previous and signal_date >= cutoff:
                entry = values.iloc[index + 1]
                path = values.iloc[index + 1 : index + 31]
                if path.empty or not float(entry.open) > 0:
                    qualifies_previous = qualifies
                    continue
                entry_price = float(entry.open)
                path_end = path.iloc[-1]
                max_index = path.high.astype(float).idxmax()
                min_index = path.low.astype(float).idxmin()
                max_row = values.loc[max_index]
                min_row = values.loc[min_index]
                max_profit_pct = 100 * (float(max_row.high) / entry_price - 1)
                max_drawdown_pct = 100 * (float(min_row.low) / entry_price - 1)
                end_return_pct = 100 * (float(path_end.close) / entry_price - 1)
                quantity = int(10000 // entry_price)
                stable = f"{STRATEGY_VERSION}:{symbol}:{signal_date.date()}"
                candidates.append({
                    "candidate_id": hashlib.sha256(stable.encode()).hexdigest()[:32],
                    "strategy_version": STRATEGY_VERSION,
                    "symbol": symbol,
                    "signal_date": signal_date.date(),
                    "entry_date": pd.Timestamp(entry.trade_date).date(),
                    "entry_price": entry_price,
                    "signal_close": float(row.close),
                    **{key: factors[key] for key in ("older_block_open", "older_block_close", "recent_block_open", "prior_week_open", "current_week_open", "previous_day_open", "signal_day_open")},
                    "path_end_date": pd.Timestamp(path_end.trade_date).date(),
                    "path_end_price": float(path_end.close),
                    "observed_sessions": len(path),
                    "evaluation_status": "MATURED" if len(path) >= 30 else "DEVELOPING",
                    "end_return_pct": end_return_pct,
                    "max_profit_pct": max_profit_pct,
                    "max_drawdown_pct": max_drawdown_pct,
                    "max_profit_date": pd.Timestamp(max_row.trade_date).date(),
                    "max_drawdown_date": pd.Timestamp(min_row.trade_date).date(),
                    "profit_per_share": float(path_end.close) - entry_price,
                    "quantity_10000": quantity,
                    "pnl_10000": quantity * (float(path_end.close) - entry_price),
                    "max_profit_10000": quantity * (float(max_row.high) - entry_price),
                    "max_drawdown_10000": quantity * (float(min_row.low) - entry_price),
                    "hit_1_pct": max_profit_pct >= 1,
                    "hit_3_pct": max_profit_pct >= 3,
                    "hit_5_pct": max_profit_pct >= 5,
                    "conditions": {
                        "older_30_session_candle_red": checks["OLDER_30_RED"],
                        "recent_30_session_candle_green": checks["RECENT_30_GREEN"],
                        "recent_close_above_older_open": checks["RECENT_CLOSE_ABOVE_OLDER_OPEN"],
                        "close_above_5_session_open": checks["CLOSE_ABOVE_5_SESSION_OPEN"],
                        "close_above_10_session_open": checks["CLOSE_ABOVE_10_SESSION_OPEN"],
                        "close_above_previous_day_open": checks["CLOSE_ABOVE_PREVIOUS_DAY_OPEN"],
                        "close_above_signal_day_open": checks["SIGNAL_DAY_GREEN"],
                    },
                    "signal_source": "YFINANCE_SPLIT_ADJUSTED_WITH_NSE_EOD_FALLBACK",
                })
            qualifies_previous = qualifies

    global_dates = sorted(pd.to_datetime(frame.trade_date).dt.normalize().drop_duplicates())
    latest_signal = global_dates[-2] if len(global_dates) >= 2 else pd.Timestamp(source_end_date)
    candidate_by_symbol = {
        item["symbol"]: item for item in candidates
        if pd.Timestamp(item["signal_date"]) == latest_signal
    }
    evaluations: list[dict[str, Any]] = []
    for symbol in sorted(universe):
        values = prepared.get(symbol)
        index_matches = [] if values is None else values.index[values.trade_date.eq(latest_signal)].tolist()
        reasons: list[str] = []
        conditions: list[dict[str, Any]] = []
        factors: dict[str, float] = {}
        selected_candidate = candidate_by_symbol.get(symbol)
        if values is None or not index_matches:
            status = "INCOMPLETE"; reasons = ["SIGNAL_SESSION_MISSING"]
        else:
            index = int(index_matches[-1])
            has_entry = index + 1 < len(values)
            if index < 59 or not has_entry or values.iloc[index - 59:index + 2][["open", "high", "low", "close"]].isna().any().any():
                status = "INCOMPLETE"; reasons = ["INSUFFICIENT_60_SESSION_HISTORY" if index < 59 else "NEXT_SESSION_OR_PRICE_DATA_MISSING"]
            else:
                checks, factors = _checks(values, index)
                operands = (
                    (factors["older_block_close"], "<", factors["older_block_open"]),
                    (factors["signal_close"], ">", factors["recent_block_open"]),
                    (factors["signal_close"], ">", factors["older_block_open"]),
                    (factors["signal_close"], ">", factors["current_week_open"]),
                    (factors["signal_close"], ">", factors["prior_week_open"]),
                    (factors["signal_close"], ">", factors["previous_day_open"]),
                    (factors["signal_close"], ">", factors["signal_day_open"]),
                )
                conditions = [{"code": code, "label": label, "left": operands[i][0], "operator": operands[i][1], "right": operands[i][2], "pass": checks[code]} for i, (code, label) in enumerate(CONDITION_META)]
                reasons = [code for code, passed in checks.items() if not passed]
                if selected_candidate:
                    status = "SELECTED"
                elif not reasons:
                    status = "QUALIFIED_CONTINUATION"; reasons = ["ALREADY_QUALIFIED_PREVIOUS_SESSION_NO_NEW_ENTRY"]
                else:
                    status = "REJECTED"
        stable = f"{STRATEGY_VERSION}:evaluation:{symbol}:{latest_signal.date()}"
        evaluations.append({
            "evaluation_id": hashlib.sha256(stable.encode()).hexdigest()[:32], "strategy_version": STRATEGY_VERSION,
            "symbol": symbol, "signal_date": latest_signal.date(), "selection_status": status,
            "selected_candidate_id": selected_candidate["candidate_id"] if selected_candidate else None,
            "evaluated_condition_count": len(conditions), "passed_condition_count": sum(item["pass"] for item in conditions),
            "failed_condition_codes": reasons, "conditions": conditions, "rejection_reasons": reasons,
            "factor_values": factors, "data_quality": {"status": "VALID" if status != "INCOMPLETE" else "INCOMPLETE", "source_end_date": str(source_end_date)},
        })
    return RollingWindowResult(candidates, evaluations, source_end_date)
