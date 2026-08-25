from __future__ import annotations

import math
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import time
from typing import Any
from zoneinfo import ZoneInfo


LEVEL_ORDER = {"BELOW_MINIMUM": 0, "NO_CANDIDATE": 0, "LOW": 1, "MEDIUM": 2, "HIGH": 3}

OFACTOR_THRESHOLDS = {"LOW": 54.0, "MEDIUM": 64.0, "HIGH": 74.0}
DIRECTIONAL_EDGE_THRESHOLDS = {"LOW": 6.0, "MEDIUM": 7.0, "HIGH": 8.0}
VOLUME_PERCENTILE_THRESHOLDS = {"LOW": 0.20, "MEDIUM": 0.30, "HIGH": 0.50}
EXTENSION_ATR_THRESHOLDS = {"LOW": 1.20, "MEDIUM": 1.40, "HIGH": 1.50}


def minimum_level(value: float | None, thresholds: Mapping[str, float]) -> str:
    """Classify a higher-is-better measurement into the governed tiers."""
    if value is None or value < thresholds["LOW"]:
        return "BELOW_MINIMUM"
    if value >= thresholds["HIGH"]:
        return "HIGH"
    if value >= thresholds["MEDIUM"]:
        return "MEDIUM"
    return "LOW"


def extension_level(value: float | None) -> str:
    """Record the requested extension profile without making it a hard gate."""
    if value is None or value > EXTENSION_ATR_THRESHOLDS["HIGH"]:
        return "ABOVE_MAXIMUM"
    if value <= EXTENSION_ATR_THRESHOLDS["LOW"]:
        return "LOW"
    if value <= EXTENSION_ATR_THRESHOLDS["MEDIUM"]:
        return "MEDIUM"
    return "HIGH"


def finite(value: Any) -> float | None:
    try:
        result = float(value)
    except (TypeError, ValueError):
        return None
    return result if math.isfinite(result) else None


def in_band(value: float | None, limits: tuple[float, float]) -> bool:
    return value is not None and limits[0] <= value <= limits[1]


def has_unresolved_hard_gate(value: Any) -> bool:
    """Return whether the persisted OIIS gate field contains any rejection.

    Historical captures store gates as a pipe-delimited string, while the live
    engine returns a list.  Missing means that an older caller did not supply
    the optional field; production callers are required to supply it.
    """
    if value is None:
        return False
    if isinstance(value, float) and math.isnan(value):
        return False
    if isinstance(value, str):
        return value.strip() not in {"", "[]", "null", "None"}
    if isinstance(value, Sequence) and not isinstance(value, (str, bytes)):
        return len(value) > 0
    return bool(value)


def canonical_status(ofactor: float | None, xfactor: float | None) -> str:
    if ofactor is None or xfactor is None:
        return "WAIT_FOR_DATA"
    if ofactor < OFACTOR_THRESHOLDS["LOW"]:
        return "RESEARCH_ONLY_NO_STANDARD_TRADE"
    if ofactor < OFACTOR_THRESHOLDS["HIGH"]:
        return "SCREENING_COHORT_BELOW_CANONICAL_PERMISSION"
    if xfactor < 76:
        return "WAIT_FOR_XFACTOR"
    return "QUALIFIED_FOR_INTRADAY_REVALIDATION"


@dataclass(frozen=True)
class DailyClassification:
    level: str
    canonical_status: str
    selected: bool
    conditions: dict[str, dict[str, bool]]


def classify_daily(row: Mapping[str, Any]) -> DailyClassification:
    direction = str(row.get("selected_direction") or "LONG").upper()
    long = direction == "LONG"
    o = finite(row.get("selected_ofactor", row.get("ofactor_long" if long else "ofactor_short")))
    x = finite(row.get("selected_xfactor", row.get("xfactor_long" if long else "xfactor_short", row.get("xfactor_score"))))
    edge = abs(finite(row.get("directional_edge")) or 0.0)
    volume_percentile = finite(row.get("volume_percentile_90"))
    extension = finite(row.get("extension_atr"))
    data_ok = finite(row.get("data_quality_score")) is not None and finite(row.get("data_quality_score")) >= 85
    permission_ok = str(row.get("data_permission") or "") == "FULL"
    blocking_reasons = [str(value) for value in row.get("blocking_reasons", [])]
    o_level = minimum_level(o, OFACTOR_THRESHOLDS)
    edge_level = minimum_level(edge, DIRECTIONAL_EDGE_THRESHOLDS)
    volume_level = minimum_level(volume_percentile, VOLUME_PERCENTILE_THRESHOLDS)
    extension_band = extension_level(extension)
    results = {
        "LOW": {
            "ofactor": o_level != "BELOW_MINIMUM",
            "directional_edge": edge_level != "BELOW_MINIMUM",
            "volume_percentile": volume_level != "BELOW_MINIMUM",
            "extension_atr": extension is not None and extension <= EXTENSION_ATR_THRESHOLDS["LOW"],
        },
        "MEDIUM": {
            "ofactor": o is not None and o >= OFACTOR_THRESHOLDS["MEDIUM"],
            "directional_edge": edge >= DIRECTIONAL_EDGE_THRESHOLDS["MEDIUM"],
            "volume_percentile": volume_percentile is not None and volume_percentile >= VOLUME_PERCENTILE_THRESHOLDS["MEDIUM"],
            "extension_atr": extension is not None and extension <= EXTENSION_ATR_THRESHOLDS["MEDIUM"],
        },
        "HIGH": {
            "ofactor": o is not None and o >= OFACTOR_THRESHOLDS["HIGH"],
            "directional_edge": edge >= DIRECTIONAL_EDGE_THRESHOLDS["HIGH"],
            "volume_percentile": volume_percentile is not None and volume_percentile >= VOLUME_PERCENTILE_THRESHOLDS["HIGH"],
            "extension_atr": extension is not None and extension <= EXTENSION_ATR_THRESHOLDS["HIGH"],
        },
    }
    status = canonical_status(o, x)
    selected = data_ok and permission_ok and direction == "LONG" and status == "QUALIFIED_FOR_INTRADAY_REVALIDATION" and not blocking_reasons
    return DailyClassification(o_level if o_level != "BELOW_MINIMUM" else "NO_CANDIDATE", status, selected, results)


def wilder_rsi(closes: Sequence[float], period: int = 14) -> float | None:
    if len(closes) < period + 1:
        return None
    gains, losses = [], []
    for previous, current in zip(closes[-period - 1:-1], closes[-period:], strict=True):
        change = current - previous
        gains.append(max(change, 0.0)); losses.append(max(-change, 0.0))
    average_gain, average_loss = sum(gains) / period, sum(losses) / period
    if average_loss == 0:
        return 100.0
    return 100.0 - 100.0 / (1.0 + average_gain / average_loss)


def williams_r(highs: Sequence[float], lows: Sequence[float], closes: Sequence[float], period: int = 14) -> float | None:
    if min(len(highs), len(lows), len(closes)) < period:
        return None
    highest, lowest = max(highs[-period:]), min(lows[-period:])
    return 0.0 if highest == lowest else -100.0 * (highest - closes[-1]) / (highest - lowest)


def intraday_entry_eligible(rsi: float | None, willr: float | None, rsi_max: float = 30, willr_max: float = -80) -> bool:
    return rsi is not None and willr is not None and rsi < rsi_max and willr < willr_max


IST = ZoneInfo("Asia/Kolkata")


def _completed_exchange_bucket_closes(
    bars: Sequence[Mapping[str, Any]], bucket_minutes: int
) -> list[dict[str, Any]]:
    """Return complete NSE-session-aligned candle closes from one-minute bars.

    Buckets are anchored at 09:15 IST. A 15-minute candle therefore closes with
    the 09:29 bar, and an hourly candle closes with the 10:14 bar. Incomplete or
    gapped buckets are intentionally unavailable rather than inferred.
    """
    buckets: dict[tuple[Any, int], list[Mapping[str, Any]]] = {}
    for bar in bars:
        timestamp = bar.get("ts")
        if timestamp is None:
            continue
        local = timestamp.astimezone(IST)
        session_open = local.replace(hour=9, minute=15, second=0, microsecond=0)
        elapsed = int((local - session_open).total_seconds() // 60)
        if elapsed < 0 or local.time() > time(15, 30):
            continue
        bucket_index = elapsed // bucket_minutes
        buckets.setdefault((local.date(), bucket_index), []).append(bar)

    completed: list[dict[str, Any]] = []
    for (session_date, bucket_index), values in sorted(buckets.items()):
        ordered = sorted(values, key=lambda item: item["ts"])
        expected_last_minute = bucket_index * bucket_minutes + bucket_minutes - 1
        last_local = ordered[-1]["ts"].astimezone(IST)
        session_open = last_local.replace(hour=9, minute=15, second=0, microsecond=0)
        actual_last_minute = int((last_local - session_open).total_seconds() // 60)
        unique_minutes = {value["ts"].replace(second=0, microsecond=0) for value in ordered}
        if len(unique_minutes) != bucket_minutes or actual_last_minute < expected_last_minute:
            continue
        completed.append(
            {
                "session_date": session_date,
                "bucket_index": bucket_index,
                "close": float(ordered[-1]["close"]),
                "closed_at": ordered[-1]["ts"],
            }
        )
    return completed


def price_momentum_entry_evaluation(
    bars: Sequence[Mapping[str, Any]], previous_daily_close: float | None
) -> dict[str, Any]:
    """Evaluate the point-in-time LONG 1D/1H/15M confirmation entry.

    Only complete exchange-anchored 15-minute and hourly candles are used. The
    current-price comparison uses the newest available completed one-minute bar.
    """
    if not bars or previous_daily_close is None or previous_daily_close <= 0:
        return {"eligible": False, "state": "WAIT_DATA", "reason": "PREVIOUS_CLOSE_OR_BARS_MISSING"}
    ordered = sorted(bars, key=lambda item: item["ts"])
    hourly = _completed_exchange_bucket_closes(ordered, 60)
    fifteen = _completed_exchange_bucket_closes(ordered, 15)
    if len(hourly) < 2 or len(fifteen) < 2:
        return {
            "eligible": False,
            "state": "WAIT_CANDLES",
            "reason": "TWO_COMPLETED_1H_AND_15M_CANDLES_REQUIRED",
            "hourly_completed": len(hourly),
            "fifteen_minute_completed": len(fifteen),
        }
    current_price = float(ordered[-1]["close"])
    current_hour, previous_hour = hourly[-1], hourly[-2]
    current_fifteen, previous_fifteen = fifteen[-1], fifteen[-2]
    checks = {
        "current_above_previous_daily_close": current_price > previous_daily_close,
        "current_hour_above_previous_hour": current_hour["close"] > previous_hour["close"],
        "current_15m_above_previous_15m": current_fifteen["close"] > previous_fifteen["close"],
    }
    return {
        "eligible": all(checks.values()),
        "state": "ENTRY_READY" if all(checks.values()) else "WAIT_PRICE_CONFIRMATION",
        "reason": None if all(checks.values()) else "ONE_OR_MORE_PRICE_CONFIRMATIONS_FAILED",
        "checks": checks,
        "current_price": current_price,
        "previous_daily_close": float(previous_daily_close),
        "current_hour_close": current_hour["close"],
        "previous_hour_close": previous_hour["close"],
        "current_hour_closed_at": current_hour["closed_at"],
        "current_15m_close": current_fifteen["close"],
        "previous_15m_close": previous_fifteen["close"],
        "current_15m_closed_at": current_fifteen["closed_at"],
    }
