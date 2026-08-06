"""Immutable full-path reward/adverse ladder evaluation through D+5.

This module observes entry quality.  It never exits a position, releases
capital, or truncates the path because a level was reached.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import date, datetime
from decimal import ROUND_CEILING, Decimal
from typing import Iterable


POLICY_ID = "FULL-PATH-LADDER-EVAL-I030-I050-I070-S100-S200-S500-A050-A100-A200-A500-A1000-A_GT1000-V2"


@dataclass(frozen=True)
class LadderBar:
    ts: datetime
    session: date
    open: Decimal
    high: Decimal
    low: Decimal
    close: Decimal


@dataclass(frozen=True)
class FullPathPolicy:
    policy_id: str = POLICY_ID
    tick_size: Decimal = Decimal("0.05")
    intraday_levels: tuple[tuple[str, Decimal], ...] = (
        ("I030", Decimal("0.30")), ("I050", Decimal("0.50")), ("I070", Decimal("0.70")),
    )
    d5_reward_levels: tuple[tuple[str, Decimal], ...] = (
        ("S100", Decimal("1.00")), ("S200", Decimal("2.00")), ("S500", Decimal("5.00")),
    )
    adverse_levels: tuple[tuple[str, Decimal], ...] = (
        ("A050", Decimal("-0.50")), ("A100", Decimal("-1.00")),
        ("A200", Decimal("-2.00")), ("A500", Decimal("-5.00")),
        ("A1000", Decimal("-10.00")),
    )
    subsequent_sessions: int = 5


def _target(entry: Decimal, pct: Decimal, tick: Decimal) -> Decimal:
    raw = entry * (Decimal("1") + pct / Decimal("100"))
    return (raw / tick).to_integral_value(rounding=ROUND_CEILING) * tick


def _stage(index: int) -> str:
    return "D0" if index == 0 else f"D+{index}"


def _pct(value: Decimal, entry: Decimal) -> Decimal:
    return (value / entry - Decimal("1")) * Decimal("100")


def evaluate_full_path(
    *, entry_path_id: str, symbol: str, entry_price: Decimal,
    quantity: int, bars: Iterable[LadderBar], policy: FullPathPolicy | None = None,
) -> dict:
    policy = policy or FullPathPolicy()
    rows = sorted(bars, key=lambda bar: bar.ts)
    if not rows or entry_price <= 0 or quantity <= 0:
        raise ValueError("positive entry, quantity and at least one bar are required")
    sessions = list(dict.fromkeys(bar.session for bar in rows))
    primary_sessions = sessions[: policy.subsequent_sessions + 1]
    primary_set = set(primary_sessions)
    primary = [bar for bar in rows if bar.session in primary_set]
    extended = [bar for bar in rows if bar.session not in primary_set]
    session_index = {session: index for index, session in enumerate(primary_sessions)}

    reward_spec = [
        {"level_id": level_id, "level_pct": pct, "window_id": "D0", "valid": lambda bar, d0=primary_sessions[0]: bar.session == d0}
        for level_id, pct in policy.intraday_levels
    ] + [
        {"level_id": level_id, "level_pct": pct, "window_id": "D0_TO_D5", "valid": lambda bar: True}
        for level_id, pct in policy.d5_reward_levels
    ]
    rewards = {}
    for spec in reward_spec:
        raw = entry_price * (Decimal("1") + spec["level_pct"] / Decimal("100"))
        rewards[spec["level_id"]] = {
            "entry_path_id": entry_path_id, "evaluation_policy_id": policy.policy_id,
            "level_id": spec["level_id"], "level_kind": "REWARD", "window_id": spec["window_id"],
            "level_pct": float(spec["level_pct"]), "raw_price": float(raw),
            "tick_price": float(_target(entry_price, spec["level_pct"], policy.tick_size)),
            "hit_flag": False, "first_touch_ts": None, "first_touch_stage": None,
            "first_touch_kind": None, "opportunity_price": None,
            "same_bar_order_ambiguous": False, "sequence": None,
            "hit_on_d0": False, "hit_after_d0": False,
        }
    adverse_spec = list(policy.adverse_levels) + [("A_GT1000", Decimal("-10.00"))]
    adverse = {}
    for level_id, pct in adverse_spec:
        raw = entry_price * (Decimal("1") + pct / Decimal("100"))
        adverse[level_id] = {
            "entry_path_id": entry_path_id, "evaluation_policy_id": policy.policy_id,
            "level_id": level_id, "level_kind": "ADVERSE", "window_id": "D0_TO_D5",
            "level_pct": float(pct), "raw_price": float(raw), "tick_price": None,
            "hit_flag": False, "first_touch_ts": None, "first_touch_stage": None,
            "first_touch_kind": None, "opportunity_price": None,
            "same_bar_order_ambiguous": False, "sequence": None,
            "hit_on_d0": False, "hit_after_d0": False, "exit_triggered": False,
        }

    running_high = entry_price
    running_low = entry_price
    checkpoints = []
    bars_by_session = {session: [bar for bar in primary if bar.session == session] for session in primary_sessions}
    for bar in primary:
        prior_mfe = _pct(running_high, entry_price)
        prior_mae = _pct(running_low, entry_price)
        running_high = max(running_high, bar.high)
        running_low = min(running_low, bar.low)
        inclusive_mfe = _pct(running_high, entry_price)
        inclusive_mae = _pct(running_low, entry_price)
        new_rewards: list[dict] = []
        new_adverse: list[dict] = []

        for spec in reward_spec:
            event = rewards[spec["level_id"]]
            if event["hit_flag"] or not spec["valid"](bar):
                continue
            level = Decimal(str(event["tick_price"]))
            if bar.open >= level or bar.high >= level:
                event.update({
                    "hit_flag": True, "first_touch_ts": bar.ts.isoformat(),
                    "first_touch_stage": _stage(session_index[bar.session]),
                    "first_touch_kind": "GAP_OPEN" if bar.open >= level else "OHLC_TOUCH",
                    "opportunity_price": float(bar.open if bar.open >= level else level),
                    "hit_on_d0": session_index[bar.session] == 0,
                    "hit_after_d0": session_index[bar.session] > 0,
                    "mfe_prior_bar_pct": float(prior_mfe), "mae_prior_bar_pct": float(prior_mae),
                    "mfe_inclusive_pct": float(inclusive_mfe), "mae_inclusive_pct": float(inclusive_mae),
                })
                new_rewards.append(event)

        for level_id, _ in adverse_spec:
            event = adverse[level_id]
            if event["hit_flag"]:
                continue
            level = Decimal(str(event["raw_price"]))
            hit = bar.low < level if level_id == "A_GT1000" else bar.low <= level
            if hit:
                event.update({
                    "hit_flag": True, "first_touch_ts": bar.ts.isoformat(),
                    "first_touch_stage": _stage(session_index[bar.session]),
                    "first_touch_kind": "GAP_OPEN" if (bar.open < level if level_id == "A_GT1000" else bar.open <= level) else "OHLC_TOUCH",
                    "opportunity_price": float(bar.open if bar.open <= level else level),
                    "hit_on_d0": session_index[bar.session] == 0,
                    "hit_after_d0": session_index[bar.session] > 0,
                    "mfe_prior_bar_pct": float(prior_mfe), "mae_prior_bar_pct": float(prior_mae),
                    "mfe_inclusive_pct": float(inclusive_mfe), "mae_inclusive_pct": float(inclusive_mae),
                })
                new_adverse.append(event)

        if new_rewards and new_adverse:
            for event in new_rewards + new_adverse:
                event["same_bar_order_ambiguous"] = True
                event["sequence"] = "SAME_BAR_ORDER_UNKNOWN"

    highest_order = ["I030", "I050", "I070", "S100", "S200", "S500"]
    adverse_order = ["A050", "A100", "A200", "A500", "A1000", "A_GT1000"]
    running_high = entry_price
    running_low = entry_price
    for index, session in enumerate(primary_sessions):
        session_bars = bars_by_session[session]
        running_high = max(running_high, max(bar.high for bar in session_bars))
        running_low = min(running_low, min(bar.low for bar in session_bars))
        last = session_bars[-1]
        reached_rewards = [level for level in highest_order if rewards[level]["hit_flag"] and session_index[session] >= primary_sessions.index(session)]
        reached_adverse = [level for level in adverse_order if adverse[level]["hit_flag"]]
        checkpoints.append({
            "entry_path_id": entry_path_id, "evaluation_policy_id": policy.policy_id,
            "stage": "D0_CLOSE" if index == 0 else f"D{index}_CLOSE",
            "checkpoint_ts": last.ts.isoformat(), "close_price": float(last.close),
            "return_pct": round(float(_pct(last.close, entry_price)), 6),
            "mfe_pct": round(float(_pct(running_high, entry_price)), 6),
            "mae_pct": round(float(_pct(running_low, entry_price)), 6),
            "highest_reward_level": next((level for level in reversed(highest_order) if rewards[level]["hit_flag"] and rewards[level]["first_touch_stage"] in [_stage(i) for i in range(index + 1)]), None),
            "worst_adverse_level": next((level for level in reversed(adverse_order) if adverse[level]["hit_flag"] and adverse[level]["first_touch_stage"] in [_stage(i) for i in range(index + 1)]), None),
            "capital_locked_flag": True,
        })

    reward_events = [rewards[level] for level in highest_order]
    adverse_events = [adverse[level] for level in adverse_order]
    for event in reward_events:
        event.update({
            "target_id": event["level_id"], "target_pct": event["level_pct"],
            "target_price": event["tick_price"], "touched": event["hit_flag"],
            "first_touch_session": event["first_touch_ts"][:10] if event["first_touch_ts"] else None,
        })
    for event in adverse_events:
        event.update({
            "threshold_id": event["level_id"], "threshold_pct": event["level_pct"],
            "threshold_price": event["raw_price"], "touched": event["hit_flag"],
            "first_touch_session": event["first_touch_ts"][:10] if event["first_touch_ts"] else None,
        })
    invariant_checks = {
        "intraday_monotonic": int(rewards["I070"]["hit_flag"]) <= int(rewards["I050"]["hit_flag"]) <= int(rewards["I030"]["hit_flag"]),
        "d5_reward_monotonic": int(rewards["S500"]["hit_flag"]) <= int(rewards["S200"]["hit_flag"]) <= int(rewards["S100"]["hit_flag"]),
        "adverse_monotonic": int(adverse["A_GT1000"]["hit_flag"]) <= int(adverse["A1000"]["hit_flag"]) <= int(adverse["A500"]["hit_flag"]) <= int(adverse["A200"]["hit_flag"]) <= int(adverse["A100"]["hit_flag"]) <= int(adverse["A050"]["hit_flag"]),
    }
    if not all(invariant_checks.values()):
        raise AssertionError(f"ladder invariant failure: {invariant_checks}")
    evidence = {
        "entry_path_id": entry_path_id, "symbol": symbol, "evaluation_policy_id": policy.policy_id,
        "entry_price": float(entry_price), "quantity": quantity, "entry_session_date": primary_sessions[0].isoformat(),
        "coverage_status": "PASS" if len(primary_sessions) == 6 else "WARN_PARTIAL_D5",
        "sessions_expected": 6, "sessions_evaluated": len(primary_sessions),
        "evaluated_through_stage": _stage(len(primary_sessions) - 1),
        "reward_events": reward_events, "adverse_events": adverse_events, "checkpoints": checkpoints,
        "best_intraday_target_id": next((level for level in reversed(["I030", "I050", "I070"]) if rewards[level]["hit_flag"]), None),
        "best_d5_target_id": next((level for level in reversed(["S100", "S200", "S500"]) if rewards[level]["hit_flag"]), None),
        "deepest_adverse_level_id": next((level for level in reversed(adverse_order) if adverse[level]["hit_flag"]), None),
        "mfe_d5_pct": round(float(_pct(max(bar.high for bar in primary), entry_price)), 6),
        "mae_d5_pct": round(float(_pct(min(bar.low for bar in primary), entry_price)), 6),
        "unresolved_at_d5": not rewards["S100"]["hit_flag"],
        "extended_capital_lock": {
            "bars_evaluated": len(extended),
            "late_recovery_flag": any(bar.high >= entry_price for bar in extended) if extended else False,
            "data_boundary_close": float(rows[-1].close),
        },
        "invariant_checks": invariant_checks,
    }
    # D+5 labels above are frozen.  This separate observation exists only so a
    # no-timeout execution scenario can keep looking for its S100 sell after
    # D+5 without rewriting any primary research label.
    s100_price = _target(entry_price, Decimal("1.00"), policy.tick_size)
    post_d0 = [bar for bar in rows if bar.session != primary_sessions[0]]
    late_s100 = next((bar for bar in post_d0 if bar.open >= s100_price or bar.high >= s100_price), None)
    evidence["extended_capital_lock"].update({
        "s100_eventually_hit": late_s100 is not None,
        "s100_first_touch_ts": late_s100.ts.isoformat() if late_s100 else None,
        "s100_first_touch_kind": (
            "GAP_OPEN" if late_s100 and late_s100.open >= s100_price
            else "OHLC_TOUCH" if late_s100 else None
        ),
        "s100_opportunity_price": float(
            late_s100.open if late_s100 and late_s100.open >= s100_price else s100_price
        ) if late_s100 else None,
    })
    hash_payload = {key: evidence[key] for key in ("entry_path_id", "evaluation_policy_id", "entry_price", "quantity", "coverage_status", "reward_events", "adverse_events", "checkpoints", "extended_capital_lock")}
    evidence["path_evidence_hash"] = hashlib.sha256(json.dumps(hash_payload, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    return evidence
