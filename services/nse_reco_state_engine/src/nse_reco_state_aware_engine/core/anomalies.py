from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple


@dataclass(frozen=True)
class Anomaly:
    scope: str
    key: str
    severity: str
    score: float
    reason: str
    details: Dict[str, Any]


def detect_single_stock_anomalies(features: Dict[str, Any], thresholds: Dict[str, Any]) -> List[Anomaly]:
    a = thresholds["anomaly"]["single_stock"]
    rr15 = abs(float(features.get("residual_ret_15m_pct", 0.0)))
    vwap_dev = abs(float(features.get("vwap_deviation_pct", 0.0)))
    volz = float(features.get("volume_surprise_z", 0.0))
    # approximate volume ratio from z if explicit ratio is absent
    raw_volume_ratio = features.get("volume_ratio")
    if raw_volume_ratio is None:
        vol_ratio = float(max(1.0, 1.0 + max(0.0, volz)))
    else:
        vol_ratio = float(raw_volume_ratio)
    vwap_cross = int(features.get("vwap_cross_count", 0))
    symbol = str(features.get("symbol", ""))

    out: List[Anomaly] = []

    def add(sev: str, sc: float, reason: str, details: Dict[str, Any]) -> None:
        out.append(Anomaly(scope="single_stock", key=symbol, severity=sev, score=sc, reason=reason, details=details))

    # residual move
    if rr15 >= a["residual_10m_abs_pct"]["severe"]:
        add("severe", rr15, "residual_move_extreme", {"abs_residual_15m_pct": rr15})
    elif rr15 >= a["residual_10m_abs_pct"]["warn"]:
        add("warn", rr15, "residual_move_unusual", {"abs_residual_15m_pct": rr15})

    # volume burst
    if vol_ratio >= a["volume_ratio"]["severe"]:
        add("severe", vol_ratio, "volume_burst_extreme", {"volume_ratio": vol_ratio, "volume_surprise_z": volz})
    elif vol_ratio >= a["volume_ratio"]["warn"]:
        add("warn", vol_ratio, "volume_burst_unusual", {"volume_ratio": vol_ratio, "volume_surprise_z": volz})

    # vwap deviation
    if vwap_dev >= a["vwap_dev_abs_pct"]["severe"]:
        add("severe", vwap_dev, "vwap_deviation_extreme", {"abs_vwap_deviation_pct": vwap_dev})
    elif vwap_dev >= a["vwap_dev_abs_pct"]["warn"]:
        add("warn", vwap_dev, "vwap_deviation_unusual", {"abs_vwap_deviation_pct": vwap_dev})

    # reversal speed
    if vwap_cross >= a["reversal_speed"]["severe"]:
        add("severe", float(vwap_cross), "reversal_speed_extreme", {"vwap_cross_count": vwap_cross})
    elif vwap_cross >= a["reversal_speed"]["warn"]:
        add("warn", float(vwap_cross), "reversal_speed_unusual", {"vwap_cross_count": vwap_cross})

    return out


def detect_market_anomalies(
    *,
    breadth_up_pct: float,
    baseline_breadth_up_pct: Optional[float],
    dispersion_pctile: float,
    correlation_mean: Optional[float],
    thresholds: Dict[str, Any],
) -> List[Anomaly]:
    a = thresholds["anomaly"]["market"]
    out: List[Anomaly] = []

    # breadth shock vs baseline minute-of-day if available
    if baseline_breadth_up_pct is not None:
        delta = abs(breadth_up_pct - baseline_breadth_up_pct)
        if delta >= a["breadth_shock_abs_pp"]["severe"]:
            out.append(Anomaly(scope="market", key="market", severity="severe", score=delta, reason="breadth_shock_extreme", details={"delta_pp": delta}))
        elif delta >= a["breadth_shock_abs_pp"]["warn"]:
            out.append(Anomaly(scope="market", key="market", severity="warn", score=delta, reason="breadth_shock_unusual", details={"delta_pp": delta}))

    # dispersion shock
    if dispersion_pctile >= a["dispersion_shock_pctile"]["severe"]:
        out.append(Anomaly(scope="market", key="market", severity="severe", score=dispersion_pctile, reason="dispersion_shock_extreme", details={"dispersion_pctile": dispersion_pctile}))
    elif dispersion_pctile >= a["dispersion_shock_pctile"]["warn"]:
        out.append(Anomaly(scope="market", key="market", severity="warn", score=dispersion_pctile, reason="dispersion_shock_unusual", details={"dispersion_pctile": dispersion_pctile}))

    # correlation snap
    if correlation_mean is not None:
        snap = abs(float(correlation_mean) - 0.5)
        if snap >= a["correlation_snap_abs"]["severe"]:
            out.append(Anomaly(scope="market", key="market", severity="severe", score=snap, reason="correlation_snap_extreme", details={"correlation_mean": correlation_mean}))
        elif snap >= a["correlation_snap_abs"]["warn"]:
            out.append(Anomaly(scope="market", key="market", severity="warn", score=snap, reason="correlation_snap_unusual", details={"correlation_mean": correlation_mean}))
    return out
