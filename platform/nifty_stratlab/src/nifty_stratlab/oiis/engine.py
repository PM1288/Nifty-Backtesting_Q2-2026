"""Pure, deterministic OIIS cash-daily research scoring.

This module implements the Phase-A stored-session baseline only. Public OHLCV
and delivery fields are explicitly treated as participation proxies, not proof
of institutional activity. Live orders, options and futures are out of scope.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any, Mapping


OFACTOR_WEIGHTS = {
    "market_regime_support": 8.0,
    "sector_industry_support": 14.0,
    "trend_quality": 18.0,
    "relative_strength": 10.0,
    "money_flow_participation": 18.0,
    "momentum_quality": 12.0,
    "institutional_confirmation": 10.0,
    "liquidity_tradability": 6.0,
    "catalyst_context": 4.0,
}

XFACTOR_WEIGHTS = {
    "setup_integrity": 18.0,
    "entry_location_quality": 20.0,
    "trigger_confirmation": 16.0,
    "stop_invalidation_quality": 14.0,
    "reward_path_quality": 14.0,
    "market_sector_synchronisation": 6.0,
    "liquidity_slippage_quality": 6.0,
    "timing_session_quality": 3.0,
    "instrument_quality": 3.0,
}


@dataclass(frozen=True)
class OIISFeature:
    symbol: str
    trade_date: str
    open_price: float
    high_price: float
    low_price: float
    close_price: float
    prev_close: float
    volume_ratio_20: float | None
    delivery_ratio_20: float | None
    turnover_percentile: float | None
    close_location: float | None
    return_1d_pct: float | None
    return_5d_pct: float | None
    return_21d_pct: float | None
    return_63d_pct: float | None
    nifty_return_21d_pct: float | None
    sector_return_21d_pct: float | None
    rsi_14: float | None
    sma20: float | None
    sma50: float | None
    atr14: float | None
    prior_high_20: float | None
    prior_low_20: float | None
    stock_trend: str | None
    stock_zone: str | None
    nifty_trend: str | None
    nifty_zone: str | None
    bank_nifty_trend: str | None
    bank_nifty_zone: str | None
    vix_regime: str | None
    event_risk: bool = False
    source_reliability: float = 90.0


def clamp(value: float, low: float = 0.0, high: float = 100.0) -> float:
    return round(max(low, min(high, value)), 4)


def linear(value: float | None, bad: float, good: float) -> float:
    if value is None:
        return 50.0
    if good == bad:
        return 50.0
    return clamp((float(value) - bad) * 100.0 / (good - bad))


def directional(value: float | None, direction: str, magnitude: float) -> float:
    if value is None:
        return 50.0
    signed = float(value) if direction == "LONG" else -float(value)
    return linear(signed, -magnitude, magnitude)


def normalise_weights(weights: Mapping[str, float]) -> dict[str, float]:
    """Accept governed mixture weights expressed either as fractions or percentages."""
    values = {name: float(value) for name, value in weights.items()}
    total = sum(values.values())
    if abs(total - 1.0) < 1e-6:
        values = {name: value * 100.0 for name, value in values.items()}
        total = 100.0
    if abs(total - 100.0) > 1e-6:
        raise ValueError(f"Component weights must sum to 1 or 100, got {total}")
    return values


def weighted_score(components: Mapping[str, float], weights: Mapping[str, float]) -> float:
    weights = normalise_weights(weights)
    if set(components) != set(weights):
        raise ValueError(f"Component/weight keys differ: missing={set(components)-set(weights)}, extra={set(weights)-set(components)}")
    if round(sum(weights.values()), 8) != 100.0:
        raise ValueError("Component weights must sum to 100")
    return clamp(sum(clamp(components[name]) * weight for name, weight in weights.items()) / 100.0)


def data_quality(feature: OIISFeature) -> dict[str, Any]:
    mandatory = (
        feature.open_price, feature.high_price, feature.low_price, feature.close_price,
        feature.prev_close, feature.return_21d_pct, feature.nifty_return_21d_pct,
        feature.rsi_14, feature.sma20, feature.sma50, feature.atr14,
    )
    optional = (
        feature.volume_ratio_20, feature.delivery_ratio_20, feature.sector_return_21d_pct,
        feature.stock_trend, feature.nifty_trend, feature.bank_nifty_trend, feature.vix_regime,
    )
    coverage = 100.0 * (sum(value is not None for value in mandatory) + 0.5 * sum(value is not None for value in optional)) / (len(mandatory) + 0.5 * len(optional))
    consistency = 100.0 if (
        feature.low_price <= min(feature.open_price, feature.close_price)
        and feature.high_price >= max(feature.open_price, feature.close_price)
        and feature.low_price > 0
        and feature.prev_close > 0
    ) else 0.0
    freshness = 100.0  # Stored-session inputs are joined on the same effective trade date.
    score = clamp(0.35 * coverage + 0.30 * freshness + 0.20 * consistency + 0.15 * feature.source_reliability)
    mandatory_missing = any(value is None for value in mandatory)
    permission = "DATA_INSUFFICIENT" if mandatory_missing or score < 50 else "WATCHLIST_ONLY" if score < 70 else "PROVISIONAL" if score < 85 else "FULL"
    return {
        "score": score,
        "permission": permission,
        "coverage": round(coverage, 4),
        "freshness": freshness,
        "consistency": consistency,
        "source_reliability": feature.source_reliability,
        "mandatory_missing": mandatory_missing,
    }


def _trend_component(feature: OIISFeature, direction: str) -> float:
    sma20_gap = ((feature.close_price / feature.sma20) - 1.0) * 100.0 if feature.sma20 else None
    sma50_gap = ((feature.close_price / feature.sma50) - 1.0) * 100.0 if feature.sma50 else None
    return sum((
        directional(feature.return_21d_pct, direction, 8.0),
        directional(feature.return_63d_pct, direction, 15.0),
        directional(sma20_gap, direction, 5.0),
        directional(sma50_gap, direction, 10.0),
    )) / 4.0


def _momentum_component(feature: OIISFeature, direction: str) -> float:
    rsi_directional = 50.0 if feature.rsi_14 is None else clamp(50.0 + (feature.rsi_14 - 50.0) * (2.0 if direction == "LONG" else -2.0))
    return (rsi_directional + directional(feature.return_5d_pct, direction, 6.0)) / 2.0


def opportunity(feature: OIISFeature, direction: str, weights: Mapping[str, float] | None = None) -> dict[str, Any]:
    sign = 1.0 if direction == "LONG" else -1.0
    sector_excess = None if feature.sector_return_21d_pct is None or feature.nifty_return_21d_pct is None else feature.sector_return_21d_pct - feature.nifty_return_21d_pct
    stock_excess_market = None if feature.return_21d_pct is None or feature.nifty_return_21d_pct is None else feature.return_21d_pct - feature.nifty_return_21d_pct
    stock_excess_sector = None if feature.return_21d_pct is None or feature.sector_return_21d_pct is None else feature.return_21d_pct - feature.sector_return_21d_pct
    price_volume_impulse = None if feature.return_1d_pct is None or feature.volume_ratio_20 is None else sign * feature.return_1d_pct * min(feature.volume_ratio_20, 3.0)
    close_location = feature.close_location if direction == "LONG" else (None if feature.close_location is None else 1.0 - feature.close_location)
    delivery_impulse = None if feature.delivery_ratio_20 is None or feature.return_1d_pct is None else sign * feature.return_1d_pct * min(feature.delivery_ratio_20, 3.0)
    components = {
        "market_regime_support": directional(feature.nifty_return_21d_pct, direction, 6.0),
        "sector_industry_support": (directional(feature.sector_return_21d_pct, direction, 8.0) + directional(sector_excess, direction, 4.0)) / 2.0,
        "trend_quality": _trend_component(feature, direction),
        "relative_strength": (directional(stock_excess_market, direction, 8.0) + directional(stock_excess_sector, direction, 8.0)) / 2.0,
        "money_flow_participation": (linear(price_volume_impulse, -3.0, 3.0) + linear(close_location, 0.1, 0.9) + linear(feature.volume_ratio_20, 0.5, 2.0)) / 3.0,
        "momentum_quality": _momentum_component(feature, direction),
        "institutional_confirmation": (linear(delivery_impulse, -3.0, 3.0) + linear(feature.delivery_ratio_20, 0.6, 1.8)) / 2.0,
        "liquidity_tradability": linear(feature.turnover_percentile, 0.05, 0.80),
        "catalyst_context": 0.0 if feature.event_risk else 50.0,
    }
    neutral_components = set()
    if isinstance(weights, Mapping) and "__neutral_components__" in weights:
        neutral_components = {str(value) for value in weights["__neutral_components__"]}
        weights = {key: value for key, value in weights.items() if key != "__neutral_components__"}
    for component in neutral_components:
        if component in components:
            components[component] = 50.0
    effective_weights = normalise_weights(weights or OFACTOR_WEIGHTS)
    raw = weighted_score(components, effective_weights)
    penalties: dict[str, float] = {}
    if feature.rsi_14 is not None and ((direction == "LONG" and feature.rsi_14 >= 78) or (direction == "SHORT" and feature.rsi_14 <= 22)):
        penalties["exhaustion"] = 8.0
    if feature.volume_ratio_20 is not None and feature.return_1d_pct is not None and feature.volume_ratio_20 >= 2.5 and sign * feature.return_1d_pct < 0:
        penalties["flow_conflict"] = 7.0
    if feature.event_risk:
        penalties["event_risk"] = 12.0
    if feature.return_5d_pct is not None and feature.return_21d_pct is not None and sign * feature.return_5d_pct > 0 > sign * feature.return_21d_pct:
        penalties["timeframe_conflict"] = 5.0
    penalty_total = round(sum(penalties.values()), 4)
    final = clamp(raw - penalty_total)
    classification = "EXCEPTIONAL" if final >= 90 else "TIER_A" if final >= 82 else "TIER_B" if final >= 74 else "WATCHLIST" if final >= 65 else "WEAK" if final >= 55 else "REJECT"
    return {"direction": direction, "raw_score": raw, "final_score": final, "classification": classification, "components": {key: round(value, 4) for key, value in components.items()}, "weights": effective_weights, "weighted_contributions": {key: round(components[key] * effective_weights[key] / 100.0, 4) for key in components}, "penalties": penalties, "penalty_total": penalty_total, "score_reconciliation_residual": round(final - clamp(raw - penalty_total), 8)}


def _detect_setup(feature: OIISFeature, direction: str) -> tuple[str | None, str]:
    volume_ok = feature.volume_ratio_20 is not None and feature.volume_ratio_20 >= 1.2
    if direction == "LONG":
        if feature.prior_high_20 and feature.close_price > feature.prior_high_20 and volume_ok:
            return "BREAKOUT_ACCEPTANCE", "TRIGGERED"
        if feature.sma20 and feature.sma50 and feature.low_price <= feature.sma20 < feature.close_price and feature.sma20 > feature.sma50:
            return "PULLBACK_CONTINUATION", "TRIGGERED" if feature.close_price > feature.open_price else "ARMED"
    else:
        if feature.prior_low_20 and feature.close_price < feature.prior_low_20 and volume_ok:
            return "BREAKDOWN_ACCEPTANCE", "TRIGGERED"
        if feature.sma20 and feature.sma50 and feature.high_price >= feature.sma20 > feature.close_price and feature.sma20 < feature.sma50:
            return "PULLBACK_CONTINUATION", "TRIGGERED" if feature.close_price < feature.open_price else "ARMED"
    return None, "FORMING"


def execution(feature: OIISFeature, direction: str, ofactor: Mapping[str, Any], dq: Mapping[str, Any], thresholds: Mapping[str, Any] | None = None) -> dict[str, Any]:
    thresholds = thresholds or {}
    ofactor_min = float(thresholds.get("ofactor_min", 74.0))
    xfactor_a = float(thresholds.get("xfactor_a", 84.0))
    xfactor_b = float(thresholds.get("xfactor_b", 76.0))
    setup_id, setup_state = _detect_setup(feature, direction)
    atr = feature.atr14 or 0.0
    extension_atr = abs(feature.close_price - (feature.sma20 or feature.close_price)) / atr if atr > 0 else None
    if direction == "LONG":
        stop = min(feature.low_price, feature.sma20 or feature.low_price)
        risk = feature.close_price - stop
        barrier = feature.prior_high_20
        barrier_room = None if barrier is None or barrier <= feature.close_price else barrier - feature.close_price
    else:
        stop = max(feature.high_price, feature.sma20 or feature.high_price)
        risk = stop - feature.close_price
        barrier = feature.prior_low_20
        barrier_room = None if barrier is None or barrier >= feature.close_price else feature.close_price - barrier
    risk_atr = risk / atr if atr > 0 else None
    reward_risk = 2.0 if risk > 0 and (barrier_room is None or barrier_room >= 2.0 * risk) else (barrier_room / risk if risk > 0 and barrier_room is not None else 0.0)
    trigger_confirmed = setup_state == "TRIGGERED"
    ofactor_weights = thresholds.get("ofactor_weights")
    raw_xfactor_weights = thresholds.get("xfactor_weights") or XFACTOR_WEIGHTS
    neutral_components = set(thresholds.get("neutral_components") or [])
    xfactor_weights = normalise_weights(raw_xfactor_weights)
    opportunity_components = opportunity(feature, direction, ofactor_weights)["components"]
    components = {
        "setup_integrity": 90.0 if setup_id and trigger_confirmed else 72.0 if setup_id else 20.0,
        "entry_location_quality": 50.0 if extension_atr is None else linear(1.5 - extension_atr, 0.0, 1.5),
        "trigger_confirmation": 90.0 if trigger_confirmed else 55.0 if setup_state == "ARMED" else 20.0,
        "stop_invalidation_quality": 50.0 if risk_atr is None else linear(2.5 - risk_atr, 0.0, 2.5),
        "reward_path_quality": linear(reward_risk, 0.5, 2.5),
        "market_sector_synchronisation": (opportunity_components["market_regime_support"] + opportunity_components["sector_industry_support"]) / 2.0,
        "liquidity_slippage_quality": linear(feature.turnover_percentile, 0.05, 0.8),
        "timing_session_quality": 80.0,
        "instrument_quality": 100.0,
    }
    for component in neutral_components:
        if component in components:
            components[component] = 50.0
    score = weighted_score(components, xfactor_weights)
    gates: list[str] = []
    if dq["permission"] == "DATA_INSUFFICIENT": gates.append("STALE_OR_INSUFFICIENT_MARKET_DATA")
    if float(ofactor["final_score"]) < ofactor_min: gates.append("OFACTOR_BELOW_MINIMUM")
    if setup_id is None: gates.append("NO_VALID_SETUP")
    if setup_state == "ARMED": gates.append("TRIGGER_CONFIRMATION_MISSING")
    if risk <= 0: gates.append("NO_STRUCTURAL_STOP")
    if risk_atr is None or risk_atr > 2.5: gates.append("STOP_TOO_WIDE")
    if reward_risk < 1.5: gates.append("REWARD_RISK_BELOW_MINIMUM")
    if extension_atr is not None and extension_atr > 1.5: gates.append("EXCESSIVE_EXTENSION")
    if feature.volume_ratio_20 is None or feature.volume_ratio_20 < 0.75 or feature.turnover_percentile is None or feature.turnover_percentile < 0.10:
        gates.append("INSUFFICIENT_LIQUIDITY")
    disabled_gates = {str(value) for value in thresholds.get("disabled_gates", [])}
    gates = [gate for gate in gates if gate not in disabled_gates]
    if "STALE_OR_INSUFFICIENT_MARKET_DATA" in gates:
        decision = "DATA_INSUFFICIENT"
    elif "OFACTOR_BELOW_MINIMUM" in gates:
        decision = "NO_OPPORTUNITY"
    elif "EXCESSIVE_EXTENSION" in gates:
        decision = "DO_NOT_CHASE"
    elif "REWARD_RISK_BELOW_MINIMUM" in gates:
        decision = "REJECT_POOR_RR"
    elif "STOP_TOO_WIDE" in gates or "NO_STRUCTURAL_STOP" in gates:
        decision = "REJECT_STOP_INVALID"
    elif "INSUFFICIENT_LIQUIDITY" in gates:
        decision = "REJECT_LIQUIDITY"
    elif "NO_VALID_SETUP" in gates:
        decision = "SETUP_FORMING"
    elif "TRIGGER_CONFIRMATION_MISSING" in gates:
        decision = "WAIT_FOR_TRIGGER"
    elif score >= xfactor_a:
        decision = "ENTERABLE_TIER_A"
    elif score >= xfactor_b:
        decision = "ENTERABLE_TIER_B"
    else:
        decision = "WAIT"
    return {
        "setup_id": setup_id,
        "setup_state": setup_state,
        "score": score,
        "raw_score": score,
        "final_score": score,
        "penalties": {},
        "penalty_total": 0.0,
        "score_reconciliation_residual": 0.0,
        "components": {key: round(value, 4) for key, value in components.items()},
        "weights": xfactor_weights,
        "weighted_contributions": {key: round(components[key] * xfactor_weights[key] / 100.0, 4) for key in components},
        "hard_gates": gates,
        "decision": decision,
        "structural_stop": round(stop, 4),
        "risk_per_share": round(risk, 4),
        "reward_risk": round(reward_risk, 4),
        "extension_atr": None if extension_atr is None else round(extension_atr, 4),
    }


def evaluate_feature(feature: OIISFeature, thresholds: Mapping[str, Any] | None = None) -> dict[str, Any]:
    thresholds = thresholds or {}
    ofactor_min = float(thresholds.get("ofactor_min", 74.0))
    directional_edge_min = float(thresholds.get("directional_edge_min", 8.0))
    dq = data_quality(feature)
    ofactor_weights = thresholds.get("ofactor_weights")
    neutral_components = set(thresholds.get("neutral_components") or [])
    if neutral_components:
        ofactor_weights = {**(ofactor_weights or OFACTOR_WEIGHTS), "__neutral_components__": list(neutral_components)}
    long_score = opportunity(feature, "LONG", ofactor_weights)
    short_score = opportunity(feature, "SHORT", ofactor_weights)
    edge = round(float(long_score["final_score"]) - float(short_score["final_score"]), 4)
    conflict = min(float(long_score["final_score"]), float(short_score["final_score"])) >= ofactor_min and abs(edge) < directional_edge_min
    direction = "CONFLICT" if conflict else "LONG" if edge >= directional_edge_min else "SHORT" if edge <= -directional_edge_min else "NEUTRAL"
    selected = long_score if direction in {"LONG", "NEUTRAL", "CONFLICT"} else short_score
    xfactor = execution(feature, "LONG" if direction in {"NEUTRAL", "CONFLICT"} else direction, selected, dq, thresholds)
    if conflict:
        xfactor = {**xfactor, "decision": "DIRECTIONAL_CONFLICT", "hard_gates": [*xfactor["hard_gates"], "DIRECTIONAL_CONFLICT"]}
    elif direction == "NEUTRAL":
        xfactor = {**xfactor, "decision": "NO_OPPORTUNITY", "hard_gates": [*xfactor["hard_gates"], "DIRECTIONAL_EDGE_BELOW_MINIMUM"]}
    elif direction == "SHORT" and xfactor["decision"].startswith("ENTERABLE"):
        xfactor = {**xfactor, "decision": "WATCHLIST", "hard_gates": [*xfactor["hard_gates"], "CASH_SHORT_INSTRUMENT_UNAVAILABLE"]}
    return {
        "feature": asdict(feature),
        "dq": dq,
        "ofactor_long": long_score,
        "ofactor_short": short_score,
        "directional_edge": edge,
        "direction": direction,
        "xfactor": xfactor,
    }
