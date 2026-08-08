"""Pure contracts and calculations for the OIIS 18-component screen."""

from __future__ import annotations

import hashlib
import json
import math
from dataclasses import dataclass
from typing import Any, Mapping

from nifty_stratlab.oiis.engine import OFACTOR_WEIGHTS, XFACTOR_WEIGHTS

OFACTOR_COMPONENTS = tuple(OFACTOR_WEIGHTS)
XFACTOR_COMPONENTS = tuple(XFACTOR_WEIGHTS)
ALL_COMPONENTS = OFACTOR_COMPONENTS + XFACTOR_COMPONENTS

SHORT_CODES = {
    "market_regime_support": "MRS", "sector_industry_support": "SRS",
    "trend_quality": "TQS", "relative_strength": "RSS",
    "money_flow_participation": "MFS", "momentum_quality": "MQS",
    "institutional_confirmation": "ICS", "liquidity_tradability": "LTS",
    "catalyst_context": "CCS", "setup_integrity": "SIS",
    "entry_location_quality": "ELQ", "trigger_confirmation": "TCS",
    "stop_invalidation_quality": "SIQ", "reward_path_quality": "RRQ",
    "market_sector_synchronisation": "MSS", "liquidity_slippage_quality": "LSQ",
    "timing_session_quality": "TSQ", "instrument_quality": "IOQ",
}


def stable_hash(value: Any) -> str:
    payload = json.dumps(value, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(payload.encode()).hexdigest()


def ablated_weights(weights: Mapping[str, float], component: str) -> dict[str, float]:
    """Zero one mixture component and renormalise the remainder to exactly 100."""
    if component not in weights:
        raise KeyError(component)
    positive_total = sum(float(value) for key, value in weights.items() if key != component)
    if positive_total <= 0:
        raise ValueError("ablation leaves no positive component weight")
    result = {
        key: 0.0 if key == component else float(value) * 100.0 / positive_total
        for key, value in weights.items()
    }
    drift = 100.0 - sum(result.values())
    anchor = next(key for key in result if key != component)
    result[anchor] += drift
    return result


def jointly_ablated_weights(weights: Mapping[str, float], components: tuple[str, ...]) -> dict[str, float]:
    """Zero a declared component set and renormalise the remaining mixture."""
    unknown = set(components) - set(weights)
    if unknown:
        raise KeyError(sorted(unknown))
    positive_total = sum(float(value) for key, value in weights.items() if key not in components)
    if positive_total <= 0:
        raise ValueError("joint ablation leaves no positive component weight")
    result = {
        key: 0.0 if key in components else float(value) * 100.0 / positive_total
        for key, value in weights.items()
    }
    anchor = next(key for key in result if key not in components)
    result[anchor] += 100.0 - sum(result.values())
    return result


@dataclass(frozen=True)
class TrialSpec:
    trial_id: str
    trial_type: str
    component: str | None
    ofactor_weights: dict[str, float]
    xfactor_weights: dict[str, float]
    neutral_components: tuple[str, ...] = ()
    production_valid: bool = False
    research_ablation_valid: bool = True

    def options(self) -> dict[str, Any]:
        return {
            "ofactor_min": 74.0, "xfactor_b": 76.0, "xfactor_a": 84.0,
            "ofactor_weights": self.ofactor_weights,
            "xfactor_weights": self.xfactor_weights,
            "neutral_components": list(self.neutral_components),
        }


def baseline_trial() -> TrialSpec:
    return TrialSpec(
        trial_id="S0_BASELINE_FULL", trial_type="CANONICAL_BASELINE_REPRODUCTION",
        component=None, ofactor_weights=dict(OFACTOR_WEIGHTS),
        xfactor_weights=dict(XFACTOR_WEIGHTS), production_valid=True,
        research_ablation_valid=False,
    )


def component_trials() -> list[TrialSpec]:
    trials: list[TrialSpec] = []
    for component in OFACTOR_COMPONENTS:
        trials.append(TrialSpec(
            trial_id=f"S1O_ABLATE_{SHORT_CODES[component]}",
            trial_type="RESEARCH_ABLATION_ONLY", component=component,
            ofactor_weights=ablated_weights(OFACTOR_WEIGHTS, component),
            xfactor_weights=dict(XFACTOR_WEIGHTS),
        ))
    for component in XFACTOR_COMPONENTS:
        trials.append(TrialSpec(
            trial_id=f"S1X_ABLATE_{SHORT_CODES[component]}",
            trial_type="RESEARCH_ABLATION_ONLY", component=component,
            ofactor_weights=dict(OFACTOR_WEIGHTS),
            xfactor_weights=ablated_weights(XFACTOR_WEIGHTS, component),
        ))
    return trials


def redundancy_trials() -> list[TrialSpec]:
    """The missing double-OFF cells for the three mandatory 2x2 studies."""
    definitions = [
        ("S2X_ABLATE_SIS_TCS", "setup_integrity", "trigger_confirmation", "x"),
        ("S2OX_ABLATE_LTS_LSQ", "liquidity_tradability", "liquidity_slippage_quality", "cross"),
        ("S2O_ABLATE_MFS_ICS", "money_flow_participation", "institutional_confirmation", "o"),
    ]
    output = []
    for trial_id, first, second, layer in definitions:
        output.append(TrialSpec(
            trial_id=trial_id, trial_type="RESEARCH_FACTORIAL_ONLY",
            component=f"{first}+{second}",
            ofactor_weights=(
                jointly_ablated_weights(OFACTOR_WEIGHTS, tuple(c for c in (first, second) if c in OFACTOR_WEIGHTS))
                if any(c in OFACTOR_WEIGHTS for c in (first, second)) else dict(OFACTOR_WEIGHTS)
            ),
            xfactor_weights=(
                jointly_ablated_weights(XFACTOR_WEIGHTS, tuple(c for c in (first, second) if c in XFACTOR_WEIGHTS))
                if any(c in XFACTOR_WEIGHTS for c in (first, second)) else dict(XFACTOR_WEIGHTS)
            ),
        ))
    return output


def neutral_trial(component: str) -> TrialSpec:
    if component not in ALL_COMPONENTS:
        raise KeyError(component)
    layer = "O" if component in OFACTOR_WEIGHTS else "X"
    return TrialSpec(
        trial_id=f"S1{layer}_NEUTRAL50_{SHORT_CODES[component]}",
        trial_type="RESEARCH_NEUTRAL_SCORE_SENSITIVITY", component=component,
        ofactor_weights=dict(OFACTOR_WEIGHTS), xfactor_weights=dict(XFACTOR_WEIGHTS),
        neutral_components=(component,),
    )


def wilson_interval(successes: int, total: int, z: float = 1.959963984540054) -> tuple[float | None, float | None]:
    if total <= 0:
        return None, None
    p = successes / total
    denominator = 1 + z * z / total
    centre = (p + z * z / (2 * total)) / denominator
    half = z * math.sqrt(p * (1 - p) / total + z * z / (4 * total * total)) / denominator
    return 100 * (centre - half), 100 * (centre + half)


SKIP_REASON_CODES = {
    "MINUTE_FILE_NOT_FOUND", "SYMBOL_ALIAS_UNRESOLVED", "ENTRY_DATE_BEFORE_SOURCE_START",
    "ENTRY_DATE_AFTER_SOURCE_END", "ENTRY_SESSION_INCOMPLETE", "NO_NEXT_VALID_SESSION",
    "DUPLICATE_SAME_SYMBOL_POSITION", "DATA_QUALITY_REJECTED", "CORPORATE_ACTION_AMBIGUITY",
    "EXECUTION_PRICE_UNAVAILABLE", "INSUFFICIENT_CAPITAL", "MAX_POSITIONS", "SECTOR_LIMIT",
    "CORRELATION_LIMIT", "EXECUTION_NOT_FEASIBLE", "OTHER_EXPLAINED",
}


def validate_skip_reason(reason: str, details: str | None = None) -> None:
    if reason not in SKIP_REASON_CODES:
        raise ValueError(f"unknown skipped-signal reason: {reason}")
    if reason == "OTHER_EXPLAINED" and not (details or "").strip():
        raise ValueError("OTHER_EXPLAINED requires non-empty details")


def validate_point_in_time_panels(panel_count: int, distinct_hashes: int) -> str:
    """Reject a dated history that merely repeats one current constituent set."""
    if panel_count > 1 and distinct_hashes <= 1:
        return "BLOCKED_LEAKAGE"
    return "PASS" if panel_count > 0 else "BLOCKED_DATA"


def validate_corporate_action_coverage(requested_start, available_start) -> str:
    if available_start is None or available_start > requested_start:
        return "BLOCKED_DATA"
    return "PASS"
