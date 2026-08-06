"""Execution scenarios consuming immutable full-path evidence."""

from __future__ import annotations

from decimal import Decimal


def i030_else_s100_v1(path_evidence: dict, *, entry_price: Decimal, quantity: int,
                       intraday_cost_bps: Decimal, swing_cost_bps: Decimal,
                       positive_profit_tax_rate: Decimal) -> dict:
    events = {event["level_id"]: event for event in path_evidence["reward_events"]}
    chosen = events["I030"] if events["I030"]["hit_flag"] else None
    if chosen is None and events["S100"]["hit_flag"] and events["S100"]["hit_after_d0"]:
        chosen = events["S100"]
    if chosen is None and path_evidence["extended_capital_lock"]["s100_eventually_hit"]:
        extended = path_evidence["extended_capital_lock"]
        chosen = {
            "level_id": "S100", "first_touch_ts": extended["s100_first_touch_ts"],
            "opportunity_price": extended["s100_opportunity_price"],
        }
    if chosen is None:
        return {"execution_scenario_id": "EXEC-I030-ELSE-S100-NO-TIMEOUT-V2", "status": "OPEN_AS_OF_DATA_BOUNDARY", "capital_released": False,
                "path_evidence_hash": path_evidence["path_evidence_hash"]}
    exit_price = Decimal(str(chosen["opportunity_price"]))
    bps = intraday_cost_bps if chosen["level_id"] == "I030" else swing_cost_bps
    gross = (exit_price - entry_price) * quantity
    costs = entry_price * quantity * bps / Decimal("10000")
    pre_tax = gross - costs
    tax = max(pre_tax, Decimal("0")) * positive_profit_tax_rate
    return {
        "execution_scenario_id": "EXEC-I030-ELSE-S100-NO-TIMEOUT-V2", "status": "CLOSED",
        "exit_ts": chosen["first_touch_ts"], "exit_price": float(exit_price),
        "exit_reason": "TARGET_INTRADAY_0_3" if chosen["level_id"] == "I030" else "TARGET_SWING_1_0",
        "selected_level_id": chosen["level_id"], "realised_gross_pnl": round(float(gross), 4),
        "costs": round(float(costs), 4), "tax_reserve": round(float(tax), 4),
        "after_tax_pnl": round(float(pre_tax - tax), 4), "capital_released": True,
        "path_evidence_hash": path_evidence["path_evidence_hash"],
    }
