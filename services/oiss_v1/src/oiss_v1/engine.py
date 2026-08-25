from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any


def clamp(value: float, low: float = 0.0, high: float = 100.0) -> float:
    return round(max(low, min(high, value)), 4)


def finite(value: Any) -> float | None:
    try:
        result = float(value)
    except (TypeError, ValueError):
        return None
    return result if math.isfinite(result) else None


def weighted_score(values: dict[str, float | None], weights: dict[str, float]) -> float | None:
    if any(values.get(key) is None for key in weights):
        return None
    return clamp(sum(float(values[key]) * weight for key, weight in weights.items()))


def data_quality(components: dict[str, float | None], critical: dict[str, float | None]) -> dict[str, Any]:
    weights = {
        "freshness": 0.30,
        "completeness": 0.25,
        "consistency": 0.20,
        "coverage": 0.15,
        "source_integrity": 0.10,
    }
    score = weighted_score(components, weights)
    critical_values = [finite(value) for value in critical.values()]
    effective = (
        min([score, *[value for value in critical_values if value is not None]])
        if score is not None
        else None
    )
    if effective is None:
        return {"score": None, "effective": None, "grade": "F", "state": "DATA_INSUFFICIENT"}
    grade = (
        "A"
        if effective >= 90
        else "B"
        if effective >= 80
        else "C"
        if effective >= 70
        else "D"
        if effective >= 50
        else "F"
    )
    state = (
        "ACTIONABLE" if grade in {"A", "B"} else "INTELLIGENCE_ONLY" if grade == "C" else "DATA_INSUFFICIENT"
    )
    return {"score": score, "effective": round(effective, 4), "grade": grade, "state": state}


def market_regime_score(values: dict[str, float | None]) -> dict[str, Any]:
    weights = {"nifty": 0.30, "bank_nifty": 0.20, "breadth": 0.20, "vix": 0.10, "futures": 0.15, "gap": 0.05}
    directional = (
        None
        if any(values.get(key) is None for key in weights)
        else round(sum(float(values[key]) * weight for key, weight in weights.items()), 4)
    )
    if directional is None:
        state = "DATA_INSUFFICIENT"
    elif directional >= 70:
        state = "STRONG BULLISH"
    elif directional >= 30:
        state = "MILD BULLISH"
    elif directional <= -70:
        state = "STRONG BEARISH"
    elif directional <= -30:
        state = "MILD BEARISH"
    else:
        state = "NEUTRAL / MIXED"
    return {
        "score": directional,
        "state": state,
        "preferred_direction": "LONG"
        if (directional or 0) >= 30
        else "SHORT"
        if (directional or 0) <= -30
        else "SELECTIVE",
    }


def extension_bucket(extension_atr: float | None, limits: dict[str, float]) -> tuple[str, int]:
    if extension_atr is None:
        return "DATA_INSUFFICIENT", -30
    magnitude = abs(extension_atr)
    if magnitude <= limits["fresh_max"]:
        return "FRESH", 0
    if magnitude <= limits["acceptable_max"]:
        return "ACCEPTABLE", 0
    if magnitude <= limits["moderate_max"]:
        return "MODERATE", -5
    if magnitude <= limits["extended_max"]:
        return "EXTENDED", -15
    return "EXTREME", -30


def tqs(ofactor: float | None, xfactor: float | None, penalty: int) -> float | None:
    return None if ofactor is None or xfactor is None else clamp(0.55 * ofactor + 0.45 * xfactor + penalty)


def sector_score(values: dict[str, float | None]) -> dict[str, Any]:
    score = weighted_score(
        values, {"relative_strength": 0.30, "breadth": 0.25, "money_flow": 0.25, "participation": 0.20}
    )
    state = (
        "DATA_INSUFFICIENT"
        if score is None
        else "LEADING"
        if score >= 70
        else "IMPROVING"
        if score >= 55
        else "NEUTRAL"
        if score >= 45
        else "WEAKENING"
        if score >= 30
        else "LAGGING"
    )
    return {"score": score, "state": state}


def horizon_score(name: str, values: dict[str, float | None]) -> float | None:
    weights = {
        "BTST": {
            "close": 0.25,
            "sector": 0.20,
            "oi": 0.20,
            "momentum": 0.15,
            "liquidity": 0.10,
            "extension": 0.10,
        },
        "STBT": {
            "close": 0.25,
            "sector": 0.20,
            "oi": 0.20,
            "momentum": 0.15,
            "liquidity": 0.10,
            "extension": 0.10,
        },
        "H2": {
            "relative": 0.20,
            "sector": 0.20,
            "catalyst": 0.15,
            "oi": 0.15,
            "runway": 0.15,
            "execution": 0.15,
        },
        "H3": {"relative": 0.30, "flow": 0.25, "sector": 0.20, "regime": 0.15, "extension": 0.10},
        "H4": {"weekly": 0.25, "sector": 0.20, "institutional": 0.25, "trend": 0.15, "risk": 0.15},
    }
    return weighted_score(values, weights[name])


def horizon_state(name: str, score: float | None, direction: str, dq_grade: str, extreme: bool) -> str:
    if score is None:
        return "DATA INSUFFICIENT"
    if dq_grade not in {"A", "B"} or extreme:
        return "NO"
    if name == "BTST" and direction != "LONG" or name == "STBT" and direction != "SHORT":
        return "—"
    qualified, watch = (85, 75) if name == "H4" else (80, 70)
    return f"{name} QUALIFIED" if score >= qualified else f"{name} WATCH" if score >= watch else "NO"


@dataclass(frozen=True)
class Decision:
    status: str
    why: list[str]
    missing_confirmation: list[str]
    upgrade_condition: str
    invalidation: str


def assign_status(
    *,
    direction: str,
    ofactor: float | None,
    xfactor: float | None,
    score: float | None,
    extension: str,
    dq_grade: str,
    trigger: bool,
    rr: float | None,
    hard_gates: list[str],
    thresholds: dict[str, float],
) -> Decision:
    why = [
        f"{direction} OFactor {ofactor:.2f}" if ofactor is not None else "OFactor unavailable",
        f"XFactor {xfactor:.2f}" if xfactor is not None else "XFactor unavailable",
        f"Extension {extension}",
        f"Data quality {dq_grade}",
    ]
    missing = list(hard_gates)
    if dq_grade in {"D", "F"} or ofactor is None or xfactor is None or score is None:
        return Decision(
            "DATA INSUFFICIENT",
            why,
            missing or ["Required decision input unavailable"],
            "Restore required source coverage",
            "Do not execute while inputs are incomplete",
        )
    if extension == "EXTREME":
        return Decision(
            "NO CHASE",
            why,
            ["Entry location is more than 2 ATR from reference"],
            "Wait for price to return within 1 ATR",
            "Further extension invalidates execution quality",
        )
    if hard_gates:
        return Decision(
            "NO TRADE",
            why,
            hard_gates,
            "Clear all blocking gates and rerun",
            "Any blocking gate remains active",
        )
    if ofactor < thresholds["ofactor_candidate"]:
        return Decision(
            "NO TRADE",
            why,
            ["OFactor below candidate threshold"],
            f"OFactor >= {thresholds['ofactor_candidate']}",
            "Opportunity evidence remains weak",
        )
    if not trigger:
        status = "WAIT FOR BREAKOUT" if direction == "LONG" else "WAIT FOR FAILED BOUNCE"
        return Decision(
            status,
            why,
            ["Trigger not confirmed"],
            "Confirm setup trigger on a completed bar",
            "Lose structural stop/reference",
        )
    actionable = (
        dq_grade in {"A", "B"}
        and ofactor >= thresholds["ofactor_actionable"]
        and xfactor >= thresholds["xfactor_actionable"]
        and score >= thresholds["tqs_actionable"]
        and rr is not None
        and rr >= thresholds["minimum_rr"]
    )
    if actionable:
        return Decision(
            "BUY NOW" if direction == "LONG" else "SELL NOW",
            why,
            [],
            "Already actionable; revalidate price and risk",
            "Structural stop or risk gate fails",
        )
    return Decision(
        "WATCH",
        why,
        ["One or more actionability thresholds not met"],
        "OFactor, XFactor, TQS, R:R and data quality must all pass",
        "Opportunity or execution quality deteriorates",
    )


def position_size(
    account_capital: float,
    risk_pct: float,
    entry: float | None,
    stop: float | None,
    lot_size: int | None,
    capital_per_lot: float | None,
    available_margin: float,
    max_lots: int,
) -> dict[str, Any]:
    if entry is None or stop is None or not lot_size or entry == stop:
        return {"state": "DATA_INSUFFICIENT", "final_lots": 0}
    max_risk = account_capital * risk_pct
    risk_per_unit = abs(entry - stop)
    risk_per_lot = risk_per_unit * lot_size
    risk_lots = math.floor(max_risk / risk_per_lot)
    margin_lots = math.floor(available_margin / capital_per_lot) if capital_per_lot else 0
    final = min(risk_lots, margin_lots, max_lots)
    return {
        "state": "ELIGIBLE" if final >= 1 else "NO TRADE — ONE LOT EXCEEDS ACCOUNT RISK",
        "max_risk": round(max_risk, 2),
        "risk_per_unit": round(risk_per_unit, 4),
        "risk_per_lot": round(risk_per_lot, 2),
        "risk_based_lots": risk_lots,
        "margin_based_lots": margin_lots,
        "final_lots": final,
        "capital_committed": round(final * (capital_per_lot or 0), 2),
        "maximum_planned_loss": round(final * risk_per_lot, 2),
    }
