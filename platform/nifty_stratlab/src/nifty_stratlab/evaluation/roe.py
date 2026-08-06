from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping


RESULT_TYPES = {
    "OPPORTUNITY_SCAN",
    "SIGNAL_STUDY",
    "TRUE_BACKTEST_ISOLATED",
    "TRUE_BACKTEST_PORTFOLIO",
    "WALK_FORWARD_VALIDATION",
    "PAPER_SHADOW_FORWARD",
}


@dataclass(frozen=True)
class RankabilityDecision:
    result_type: str
    rankability_status: str
    rating: str
    validation_status: str
    gates: dict[str, dict[str, str]]
    limitations: list[str]


def classify_trend(value_pct: float | None, *, bullish: float, bearish: float, sideways_abs: float) -> str:
    """Classify a return without forcing the transition band into sideways."""
    if value_pct is None:
        return "INSUFFICIENT_DATA"
    if value_pct >= bullish:
        return "UPWARD"
    if value_pct <= bearish:
        return "DOWNWARD"
    if abs(value_pct) <= sideways_abs:
        return "SIDEWAYS"
    return "TRANSITION"


def classify_result_type(config: Mapping[str, Any], capital_mode: str, universe_mode: str) -> str:
    exits = config.get("exit_rules") if isinstance(config.get("exit_rules"), Mapping) else {}
    has_loss_exit = any(key in exits for key in ("stop_loss_pct", "trailing_stop_pct", "signal_exit"))
    has_timeout = any(key in exits for key in ("max_hold_days", "timeout_minutes", "session_close_exit"))
    if not has_loss_exit or not has_timeout:
        return "OPPORTUNITY_SCAN"
    if capital_mode != "no_capital_limit" and universe_mode != "single_stock":
        return "TRUE_BACKTEST_PORTFOLIO"
    return "TRUE_BACKTEST_ISOLATED"


def evaluate_rankability(
    config: Mapping[str, Any],
    assumptions: Mapping[str, Any],
    *,
    capital_mode: str,
    universe_mode: str,
    closed_trades: int,
    open_positions_included: bool = True,
) -> RankabilityDecision:
    """Apply independent, fail-closed gates before any composite score."""
    result_type = classify_result_type(config, capital_mode, universe_mode)
    exits = config.get("exit_rules") if isinstance(config.get("exit_rules"), Mapping) else {}
    universe_text = " ".join(str(v) for k, v in assumptions.items() if "universe" in str(k).lower()).lower()
    current_constituent_bias = "current" in universe_text
    gates = {
        "pre_registered_strategy": {"status": "PASS", "reason": "Versioned strategy configuration exists."},
        "point_in_time_universe": {
            "status": "FAIL" if current_constituent_bias else "NOT_ASSESSED",
            "reason": "Current-constituent membership introduces survivor bias." if current_constituent_bias else "Point-in-time membership evidence was not certified.",
        },
        "loss_exit_defined": {
            "status": "PASS" if any(k in exits for k in ("stop_loss_pct", "trailing_stop_pct", "signal_exit")) else "FAIL",
            "reason": "A loss-containment exit is declared." if any(k in exits for k in ("stop_loss_pct", "trailing_stop_pct", "signal_exit")) else "Target-only recovery is an opportunity scan, not a true backtest.",
        },
        "timeout_defined": {
            "status": "PASS" if any(k in exits for k in ("max_hold_days", "timeout_minutes", "session_close_exit")) else "FAIL",
            "reason": "A finite holding boundary is declared." if any(k in exits for k in ("max_hold_days", "timeout_minutes", "session_close_exit")) else "No finite timeout or session-close exit is declared.",
        },
        "complete_trade_paths": {"status": "FAIL", "reason": "MFE, MAE and underwater-time evidence has not yet been populated for every trade."},
        "finite_capital": {
            "status": "PASS" if capital_mode != "no_capital_limit" else "NOT_ASSESSED",
            "reason": "Finite capital constraints are active." if capital_mode != "no_capital_limit" else "Unlimited-capital scenarios are capacity studies only.",
        },
        "open_positions_included": {"status": "PASS" if open_positions_included else "FAIL", "reason": "Open positions are included in portfolio valuation." if open_positions_included else "Open positions are omitted."},
        "minimum_sample": {"status": "PASS" if closed_trades >= 100 else "WARN", "reason": f"{closed_trades} closed trades; provisional minimum is 100."},
        "effective_dated_costs": {"status": "WARN", "reason": "Costs are modeled but effective-date certification is pending."},
        "out_of_sample_evidence": {"status": "FAIL", "reason": "Walk-forward or untouched out-of-sample evidence is not attached to this run."},
        "reproducibility": {"status": "WARN", "reason": "Run hashes exist, but independent reproduction is not yet recorded."},
    }
    failures = [name for name, value in gates.items() if value["status"] == "FAIL"]
    limitations = [value["reason"] for value in gates.values() if value["status"] in {"FAIL", "WARN"}]
    rankable = not failures and result_type in {"TRUE_BACKTEST_PORTFOLIO", "WALK_FORWARD_VALIDATION", "PAPER_SHADOW_FORWARD"}
    status_order = {"FAIL": 3, "WARN": 2, "NOT_ASSESSED": 1, "PASS": 0}
    validation_status = max((value["status"] for value in gates.values()), key=status_order.__getitem__)
    return RankabilityDecision(
        result_type=result_type,
        rankability_status="RANKABLE" if rankable else "NOT_RANKABLE",
        rating="NR" if not rankable else "E",
        validation_status=validation_status,
        gates=gates,
        limitations=limitations,
    )
