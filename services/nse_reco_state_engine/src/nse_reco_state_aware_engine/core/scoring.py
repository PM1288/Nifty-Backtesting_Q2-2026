from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Tuple

from nse_reco_state_aware_engine.core.regime import regime_signal_fit


@dataclass(frozen=True)
class SignalResult:
    signal_family: str
    signal_quality: float
    flags: Dict[str, bool]
    reasons: List[str]


def _clamp(x: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, x))


def infer_signal(features: Dict[str, Any], thresholds: Dict[str, Any], event_count: int | None = None) -> SignalResult:
    s = thresholds["signal"]
    rr15 = float(features.get("residual_ret_15m_pct", 0.0))
    rr30 = float(features.get("residual_ret_30m_pct", 0.0))
    rr5 = float(features.get("residual_ret_5m_pct", 0.0))
    tav = float(features.get("time_above_vwap_pct", 50.0))
    volz = float(features.get("volume_surprise_z", 0.0))
    eff = float(features.get("range_efficiency", 0.5))
    cl = float(features.get("close_location", 0.5))
    vwap_dev = abs(float(features.get("vwap_deviation_pct", 0.0)))

    flags: Dict[str, bool] = {}
    reasons: List[str] = []

    # compute a general signal quality (0..100)
    # weight residual, VWAP control, volume support, path quality, close quality
    residual_component = _clamp(50.0 + rr30 * 40.0, 0.0, 100.0)
    vwap_component = _clamp(tav, 0.0, 100.0)
    volume_component = _clamp(50.0 + volz * 12.0, 0.0, 100.0)
    efficiency_component = _clamp(50.0 + (eff - 0.5) * 120.0, 0.0, 100.0)
    close_component = _clamp(50.0 + (cl - 0.5) * 120.0, 0.0, 100.0)

    signal_quality = 0.30 * residual_component + 0.20 * vwap_component + 0.15 * volume_component + 0.20 * efficiency_component + 0.15 * close_component

    # families
    strong_up_30 = rr30 >= s["residual_ret_30m_pct"]["strong_up"]
    strong_down_30 = rr30 <= s["residual_ret_30m_pct"]["strong_down"]
    strong_up_15 = rr15 >= s["residual_ret_15m_pct"]["strong_up"]
    strong_down_15 = rr15 <= s["residual_ret_15m_pct"]["strong_down"]

    strong_vwap = tav >= s["time_above_vwap_pct"]["strong"]
    weak_vwap = tav <= s["time_above_vwap_pct"]["weak"]
    burst_vol = volz >= s["volume_surprise_z"]["burst"]
    elevated_vol = volz >= s["volume_surprise_z"]["elevated"]

    trending = eff >= s["range_efficiency"]["trend"]
    noisy = eff <= s["range_efficiency"]["noisy"]
    strong_close = cl >= s["close_location"]["strong"]
    weak_close = cl <= s["close_location"]["weak"]
    extreme_vwap_dev = vwap_dev >= s["vwap_deviation_abs_pct"]["extreme"]

    # headline spike flag: burst volume + noisy path
    headline_spike = burst_vol and noisy and not strong_close
    flags["headline_spike"] = headline_spike

    if strong_up_30 and strong_vwap and trending:
        signal_family = "breakout_continuation"
        reasons += ["residual_strength", "vwap_control", "trend_path"]
    elif (rr30 > 0.15 and strong_vwap and elevated_vol and eff > 0.5):
        signal_family = "quiet_accumulation"
        reasons += ["vwap_control", "volume_support"]
    elif (rr5 < -0.20 and strong_close and (tav > 45.0 or not weak_vwap)):
        signal_family = "mean_reversion"
        reasons += ["pullback", "closing_strength"]
    elif strong_down_30 and weak_vwap and weak_close:
        signal_family = "breakdown_risk"
        reasons += ["residual_weakness", "vwap_lost", "weak_close"]
    elif strong_up_15 and burst_vol and extreme_vwap_dev:
        signal_family = "squeeze_watch"
        reasons += ["fast_move", "volume_burst", "extended_vs_vwap"]
    elif event_count and event_count > 0 and elevated_vol:
        signal_family = "event_watch"
        reasons += ["event_context", "volume_support"]
    elif headline_spike:
        signal_family = "event_watch"
        reasons += ["headline_spike"]
    else:
        signal_family = "neutral"
        reasons += ["no_clear_edge"]

    signal_quality = float(_clamp(signal_quality, 0.0, 100.0))
    return SignalResult(signal_family=signal_family, signal_quality=signal_quality, flags=flags, reasons=reasons)


def score_action(
    *,
    regime: str,
    direction: str,
    signal: SignalResult,
    historical_edge_pts: float,
    risk_penalty_pts: float,
    anomaly_penalty_pts: float,
    thresholds: Dict[str, Any],
) -> Tuple[float, str, str, str]:
    w = thresholds["weights"]
    a = thresholds["actions"]

    base = float(w["base_score"])
    fit_pts = regime_signal_fit(regime, signal.signal_family) * float(w["regime_fit_weight"])

    final = base
    final += fit_pts
    final += float(w["signal_quality_weight"]) * (signal.signal_quality - base)
    final += float(w["historical_edge_weight"]) * historical_edge_pts
    final -= float(w["risk_penalty_weight"]) * risk_penalty_pts
    final -= float(w["anomaly_penalty_weight"]) * anomaly_penalty_pts

    final = _clamp(final, 0.0, 100.0)

    # semantic UI tokens
    if final >= 55 and signal.signal_family in {"breakout_continuation", "quiet_accumulation", "squeeze_watch"}:
        arrow = "▲"
    elif final <= 45 and signal.signal_family in {"breakdown_risk"}:
        arrow = "▼"
    else:
        arrow = "•"

    accent_token = "white" if direction == "neutral" else ("green" if direction == "up" else "red")

    # action thresholds
    if a.get("force_anomaly_review_on_severe", True) and anomaly_penalty_pts >= 25:
        action = "anomaly_review_required"
    elif final >= a["buy_now"]:
        action = "buy_now"
    elif final >= a["wait_for_pullback"]:
        action = "wait_for_pullback"
    elif final >= a["watch_only"]:
        action = "watch_only"
    elif final <= a["avoid_despite_strength"]:
        action = "avoid_despite_strength"
    else:
        action = "watch_only"

    return float(final), action, accent_token, arrow
