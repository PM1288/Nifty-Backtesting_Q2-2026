from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Tuple


@dataclass(frozen=True)
class RegimeResult:
    regime: str
    direction: str
    accent_token: str
    score: float
    features: Dict[str, Any]


def _direction_from_index_ret(index_ret_pct: float) -> str:
    if index_ret_pct > 0.05:
        return "up"
    if index_ret_pct < -0.05:
        return "down"
    return "neutral"


def classify_regime(
    *,
    index_ret_from_open_pct: float,
    opening_gap_pct: float | None,
    first15_range_expansion_pct: float | None,
    breadth_up_pct: float,
    breadth_above_vwap_pct: float,
    dispersion_pctile: float,
    realized_vol_pctile: float,
    thresholds: Dict[str, Any],
) -> RegimeResult:
    r = thresholds["regime"]
    broad_breadth = breadth_up_pct >= r["breadth_up_pct"]["broad"] and breadth_above_vwap_pct >= r["breadth_above_vwap_pct"]["broad"]
    narrowish = breadth_up_pct < r["breadth_up_pct"]["narrow"]

    high_disp = dispersion_pctile >= r["dispersion_pctile"]["high"]
    low_disp = dispersion_pctile <= r["dispersion_pctile"]["low"]
    high_vol = realized_vol_pctile >= r["realized_vol_pctile"]["high"]
    low_vol = realized_vol_pctile <= r["realized_vol_pctile"]["low"]

    direction = _direction_from_index_ret(index_ret_from_open_pct)
    accent_token = "white" if direction == "neutral" else ("green" if direction == "up" else "red")

    # Score is an interpretable confidence-ish value (0..100)
    score = 50.0
    if broad_breadth:
        score += 18.0
    if high_vol or high_disp:
        score -= 8.0
    if low_vol and low_disp:
        score += 6.0
    if narrowish:
        score -= 6.0

    # Regime classification
    if broad_breadth and direction == "up":
        regime = "broad_bullish_expansion"
    elif broad_breadth and direction == "down":
        regime = "broad_bearish_expansion"
    elif (high_vol or high_disp) and not broad_breadth:
        regime = "high_volatility_chop"
    elif low_vol and low_disp and abs(index_ret_from_open_pct) < 0.25:
        regime = "low_volatility_compression"
    elif narrowish and abs(index_ret_from_open_pct) >= 0.25:
        regime = "mixed_rotation"
    else:
        regime = "uncertain"

    features = {
        "index_ret_from_open_pct": float(index_ret_from_open_pct),
        "opening_gap_pct": None if opening_gap_pct is None else float(opening_gap_pct),
        "first15_range_expansion_pct": None if first15_range_expansion_pct is None else float(first15_range_expansion_pct),
        "breadth_up_pct": float(breadth_up_pct),
        "breadth_above_vwap_pct": float(breadth_above_vwap_pct),
        "dispersion_pctile": float(dispersion_pctile),
        "realized_vol_pctile": float(realized_vol_pctile),
    }

    # clamp
    score = max(0.0, min(100.0, score))
    return RegimeResult(regime=regime, direction=direction, accent_token=accent_token, score=score, features=features)


def regime_signal_fit(regime: str, signal_family: str) -> float:
    """Points added/subtracted based on how well a signal fits the current regime."""
    # Positive fit matrix
    if regime == "broad_bullish_expansion":
        if signal_family in {"breakout_continuation", "quiet_accumulation", "squeeze_watch"}:
            return 10.0
        if signal_family in {"mean_reversion"}:
            return 2.0
        return -4.0
    if regime == "broad_bearish_expansion":
        if signal_family in {"breakdown_risk"}:
            return 10.0
        if signal_family in {"mean_reversion"}:
            return 1.0
        return -5.0
    if regime == "high_volatility_chop":
        if signal_family in {"mean_reversion"}:
            return 8.0
        if signal_family in {"breakout_continuation"}:
            return -6.0
        return -2.0
    if regime == "low_volatility_compression":
        if signal_family in {"quiet_accumulation"}:
            return 6.0
        if signal_family in {"breakout_continuation"}:
            return 2.0
        return 0.0
    if regime == "mixed_rotation":
        if signal_family in {"residual_leader", "quiet_accumulation", "event_watch"}:
            return 5.0
        return 0.0
    return 0.0
