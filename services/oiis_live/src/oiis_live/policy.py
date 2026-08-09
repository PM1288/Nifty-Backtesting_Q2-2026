from __future__ import annotations

import math
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any


LEVEL_ORDER = {"NO_CANDIDATE": 0, "LOW": 1, "MEDIUM": 2, "HIGH": 3}

LEVELS: dict[str, dict[str, Any]] = {
    "HIGH": {"o": 55, "x": 58, "mrs": 75, "siq": 70, "elq": 60, "mss": 75,
             "rsi": (45, 65), "willr": (20, 85), "ema": (-1, 8), "macd": (-0.5, 2.5),
             "atr": (1.5, 3.5), "volume": (0.5, 1.5)},
    "MEDIUM": {"o": 50, "x": 45, "mrs": 60, "siq": 50, "elq": 40, "mss": 60,
               "rsi": (42, 70), "willr": (10, 92), "ema": (-3, 12), "macd": (-1, 4),
               "atr": (1.2, 4.5), "volume": (0.35, 2.0)},
    "LOW": {"o": 45, "x": 35, "mrs": 40, "siq": 30, "elq": 20, "mss": 40,
            "rsi": (35, 78), "willr": (5, 97), "ema": (-6, 20), "macd": (-2, 6),
            "atr": (1.0, 6.0), "volume": (0.2, 3.0)},
}


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
    if ofactor < 65:
        return "RESEARCH_ONLY_NO_STANDARD_TRADE"
    if ofactor < 74:
        return "UPGRADE_OFACTOR_REQUIRED"
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
    rsi = finite(row.get("rsi_14", row.get("rsi14")))
    raw_willr = finite(row.get("willr_14", row.get("willr14")))
    directional = {
        "o": o,
        "x": x,
        "mrs": finite(row.get("selected_mrs", row.get("o_long_market_regime_support" if long else "o_short_market_regime_support"))),
        "siq": finite(row.get("selected_siq", row.get("x_long_stop_invalidation_quality" if long else "x_short_stop_invalidation_quality"))),
        "elq": finite(row.get("selected_elq", row.get("x_long_entry_location_quality" if long else "x_short_entry_location_quality"))),
        "mss": finite(row.get("selected_mss", row.get("x_long_market_sector_synchronisation" if long else "x_short_market_sector_synchronisation"))),
        "rsi": rsi if long or rsi is None else 100 - rsi,
        "willr": (100 + raw_willr) if long and raw_willr is not None else (-raw_willr if raw_willr is not None else None),
        "ema": finite(row.get("close_vs_ema61_pct")),
        "macd": finite(row.get("macd_line_pct_close")),
        "atr": None,
        "volume": finite(row.get("volume_vs_sma20", row.get("volume_ratio_20"))),
    }
    close, atr = finite(row.get("close_price")), finite(row.get("atr14"))
    directional["atr"] = None if close in (None, 0) or atr is None else 100 * atr / close
    if not long:
        directional["ema"] = None if directional["ema"] is None else -directional["ema"]
        directional["macd"] = None if directional["macd"] is None else -directional["macd"]

    results: dict[str, dict[str, bool]] = {}
    chosen = "NO_CANDIDATE"
    data_ok = finite(row.get("data_quality_score")) is not None and finite(row.get("data_quality_score")) >= 85
    permission_ok = str(row.get("data_permission") or "") == "FULL"
    hard_gate_ok = not has_unresolved_hard_gate(row.get("hard_gates"))
    for level in ("HIGH", "MEDIUM", "LOW"):
        rule = LEVELS[level]
        checks = {
            "data_quality": data_ok,
            "data_permission": permission_ok,
            "no_unresolved_hard_gate": hard_gate_ok,
            "ofactor": o is not None and o >= rule["o"],
            "xfactor_snapshot": x is not None and x >= rule["x"],
            "mrs": directional["mrs"] is not None and directional["mrs"] >= rule["mrs"],
            "siq": directional["siq"] is not None and directional["siq"] >= rule["siq"],
            "elq": directional["elq"] is not None and directional["elq"] >= rule["elq"],
            "mss": directional["mss"] is not None and directional["mss"] >= rule["mss"],
            "rsi": in_band(directional["rsi"], rule["rsi"]),
            "willr": in_band(directional["willr"], rule["willr"]),
            "ema61": in_band(directional["ema"], rule["ema"]),
            "macd": in_band(directional["macd"], rule["macd"]),
            "atr": in_band(directional["atr"], rule["atr"]),
            "volume": in_band(directional["volume"], rule["volume"]),
        }
        results[level] = checks
        if chosen == "NO_CANDIDATE" and all(checks.values()):
            chosen = level
    status = canonical_status(o, x)
    selected = chosen != "NO_CANDIDATE" and direction == "LONG" and status in {
        "QUALIFIED_FOR_INTRADAY_REVALIDATION", "UPGRADE_OFACTOR_REQUIRED", "WAIT_FOR_XFACTOR"
    }
    return DailyClassification(chosen, status, selected, results)


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
