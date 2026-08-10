from __future__ import annotations

import math
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any


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
