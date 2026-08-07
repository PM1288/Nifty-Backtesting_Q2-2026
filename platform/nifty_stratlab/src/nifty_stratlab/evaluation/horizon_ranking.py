"""Governed H30 strategy summaries and rankings.

The league is deliberately separate from realised execution P&L. A score can
be calculated for diagnosis while hard gates still prevent publication as a
final rank.
"""
from __future__ import annotations

import math
from collections import Counter
from typing import Any, Iterable

import numpy as np

RANKING_CONFIG_ID = "H30-PRACTICALITY-GEOMETRIC-V1"
WEIGHTS = {
    "upside_depth": .25, "hit_breadth": .20, "speed": .15,
    "downside_efficiency": .20, "consistency": .10, "benchmark_alpha": .10,
}


def _score(value: float, bad: float, good: float, *, inverse: bool = False) -> float:
    if good == bad:
        return 0.0
    result = 100.0 * (value - bad) / (good - bad)
    result = min(100.0, max(0.0, result))
    return 100.0 - result if inverse else result


def summarize_h30(observations: Iterable[dict[str, Any]]) -> dict[str, Any]:
    rows = list(observations)
    mature = [r for r in rows if r.get("coverage_status") == "MATURE_H30_COMPLETE"]
    upside = np.asarray([r["max_close_economics"]["after_tax_upside_pct"] for r in mature], dtype=float)
    mae = np.asarray([abs(r["mae_before_max_close_pct"]) for r in mature], dtype=float)
    speed = np.asarray([r["sessions_to_max_close"] for r in mature], dtype=float)
    alpha = np.asarray([r["stock_excess_vs_nifty_at_max_pct"] for r in mature if r.get("stock_excess_vs_nifty_at_max_pct") is not None], dtype=float)
    symbols = Counter(r["symbol"] for r in mature)
    months = Counter(str(r["entry_date"])[:7] for r in mature)
    bands = {str(level): round(100 * sum(float(v) >= level for v in upside) / len(upside), 4) if len(upside) else None for level in (1, 2, 5, 10, 15, 20)}
    return {
        "observation_count": len(rows), "mature_entry_count": len(mature),
        "mature_coverage_pct": round(100 * len(mature) / len(rows), 4) if rows else 0.0,
        "median_after_tax_max_close_upside_pct": round(float(np.median(upside)), 6) if len(upside) else None,
        "p75_after_tax_max_close_upside_pct": round(float(np.percentile(upside, 75)), 6) if len(upside) else None,
        "p90_after_tax_max_close_upside_pct": round(float(np.percentile(upside, 90)), 6) if len(upside) else None,
        "median_sessions_to_max": round(float(np.median(speed)), 4) if len(speed) else None,
        "p95_absolute_mae_before_max_pct": round(float(np.percentile(mae, 95)), 6) if len(mae) else None,
        "median_excess_vs_nifty_pct": round(float(np.median(alpha)), 6) if len(alpha) else None,
        "opportunity_band_hit_rate_pct": bands,
        "max_single_symbol_contribution_pct": round(100 * max(symbols.values(), default=0) / len(mature), 4) if mature else 0.0,
        "max_single_month_contribution_pct": round(100 * max(months.values(), default=0) / len(mature), 4) if mature else 0.0,
        "distinct_years": len({str(r["entry_date"])[:4] for r in mature}),
        "coverage_status_counts": dict(Counter(r.get("coverage_status", "UNKNOWN") for r in rows)),
    }


def rank_h30(observations: Iterable[dict[str, Any]], *, deterministic: bool = True) -> dict[str, Any]:
    rows = list(observations)
    summary = summarize_h30(rows)
    mature = [r for r in rows if r.get("coverage_status") == "MATURE_H30_COMPLETE"]
    blockers: set[str] = set()
    if summary["mature_entry_count"] < 100: blockers.add("MINIMUM_100_MATURE_ENTRIES_NOT_MET")
    if summary["mature_coverage_pct"] < 90: blockers.add("MINIMUM_90PCT_MATURE_COVERAGE_NOT_MET")
    if not deterministic: blockers.add("DETERMINISM_FAILED")
    for row in mature:
        blockers.update(row.get("rank_blockers", []))
    if summary["max_single_symbol_contribution_pct"] > 25: blockers.add("SINGLE_SYMBOL_CONCENTRATION_GT_25PCT")
    if summary["max_single_month_contribution_pct"] > 25: blockers.add("SINGLE_MONTH_CONCENTRATION_GT_25PCT")
    if summary["distinct_years"] < 2: blockers.add("MINIMUM_TWO_DISTINCT_YEARS_NOT_MET")
    med = summary["median_after_tax_max_close_upside_pct"] or 0
    hit = summary["opportunity_band_hit_rate_pct"].get("5") or 0
    sessions = summary["median_sessions_to_max"] if summary["median_sessions_to_max"] is not None else 29
    risk = summary["p95_absolute_mae_before_max_pct"] if summary["p95_absolute_mae_before_max_pct"] is not None else 20
    alpha = summary["median_excess_vs_nifty_pct"] or 0
    components = {
        "upside_depth": _score(med, 0, 15), "hit_breadth": _score(hit, 0, 70),
        "speed": _score(sessions, 29, 0), "downside_efficiency": _score(risk, 20, 0),
        "consistency": _score(100 - summary["max_single_month_contribution_pct"], 0, 90),
        "benchmark_alpha": _score(alpha, -5, 10),
    }
    diagnostic = math.exp(sum(WEIGHTS[k] * math.log(max(v, .01)) for k, v in components.items()))
    return {
        "league": "H30_PRACTICALITY", "ranking_config_id": RANKING_CONFIG_ID,
        "status": "FINAL_RANKABLE" if not blockers else "PROVISIONAL_BLOCKED",
        "final_score": round(diagnostic, 4) if not blockers else None,
        "diagnostic_score": round(diagnostic, 4), "components": components,
        "hard_gate_blockers": sorted(blockers), "summary": summary,
        "outcome_semantics": "HINDSIGHT_ENTRY_QUALITY_NOT_REALISED_PNL",
    }
