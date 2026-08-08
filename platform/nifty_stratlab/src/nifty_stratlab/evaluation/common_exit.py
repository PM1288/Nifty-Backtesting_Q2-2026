"""Canonical target-only exit and path-evaluation contract.

Strategies decide *when to enter*.  This module owns the operator-approved
long-equity exit mandate used to compare those entries:

* +0.30% target during the entry session;
* if not filled, +1.00% target from the original buy price on later sessions;
* no stop-loss, indicator, timeout, or forced-close exit;
* unresolved positions remain open and capital remains occupied;
* adverse movement is evidence, never an exit trigger.
"""

from __future__ import annotations

import hashlib
from dataclasses import asdict, dataclass
from datetime import date, datetime
from decimal import ROUND_CEILING, Decimal
from typing import Iterable

from nifty_stratlab.evaluation.full_path_ladder import (
    FullPathPolicy, LadderBar, evaluate_full_path,
)
from nifty_stratlab.simulation.execution_scenarios import i030_else_s100_v1


@dataclass(frozen=True)
class PathBar:
    ts: datetime
    session: date
    open: Decimal
    high: Decimal
    low: Decimal
    close: Decimal


@dataclass(frozen=True)
class CommonExitPolicy:
    policy_id: str = "COMMON-TARGET-ONLY-0.3-1.0-V1"
    intraday_target_pct: Decimal = Decimal("0.30")
    swing_target_pct: Decimal = Decimal("1.00")
    intraday_ladder_pct: tuple[Decimal, ...] = (
        Decimal("0.30"), Decimal("0.50"), Decimal("0.70")
    )
    swing_ladder_pct: tuple[Decimal, ...] = (
        Decimal("1.00"), Decimal("2.00"), Decimal("5.00")
    )
    adverse_ladder_pct: tuple[Decimal, ...] = (
        Decimal("-0.50"), Decimal("-1.00"), Decimal("-2.00"),
        Decimal("-5.00"), Decimal("-10.00")
    )
    intraday_round_trip_cost_bps: Decimal = Decimal("8")
    swing_round_trip_cost_bps: Decimal = Decimal("22")
    positive_profit_tax_rate: Decimal = Decimal("0.35")
    tick_size: Decimal = Decimal("0.05")

    def validate(self) -> None:
        if self.intraday_target_pct <= 0 or self.swing_target_pct <= 0:
            raise ValueError("targets must be positive")
        if self.swing_target_pct <= self.intraday_target_pct:
            raise ValueError("swing target must exceed intraday target")
        if self.tick_size <= 0:
            raise ValueError("tick_size must be positive")
        if any(value >= 0 for value in self.adverse_ladder_pct):
            raise ValueError("adverse thresholds must be negative")


def _target(entry: Decimal, pct: Decimal, tick: Decimal) -> Decimal:
    """Round a long target upward so tick rounding never weakens the mandate."""
    raw = entry * (Decimal("1") + pct / Decimal("100"))
    return (raw / tick).to_integral_value(rounding=ROUND_CEILING) * tick


def _event(identifier: str, pct: Decimal, target: Decimal, bar: PathBar | None) -> dict:
    return {
        "target_id": identifier,
        "target_pct": float(pct),
        "target_price": float(target),
        "touched": bar is not None,
        "first_touch_ts": bar.ts.isoformat() if bar else None,
        "first_touch_session": bar.session.isoformat() if bar else None,
    }


def evaluate_long_target_only(
    *,
    symbol: str,
    signal_date: date,
    entry_price: Decimal,
    quantity: int,
    bars: Iterable[PathBar],
    policy: CommonExitPolicy | None = None,
    run_namespace: str = "standalone",
) -> dict:
    """Evaluate one accepted long entry under the shared exit mandate.

    The returned record contains both the actual target-only trade outcome and
    the Rules-of-Engagement target/adverse ladders.  An open result has no
    realised P&L; its marked liquidation value is reported separately.
    """
    policy = policy or CommonExitPolicy()
    policy.validate()
    path = sorted(bars, key=lambda row: row.ts)
    if not path:
        raise ValueError("at least one path bar is required")
    if entry_price <= 0 or quantity <= 0:
        raise ValueError("entry_price and quantity must be positive")

    entry_session = path[0].session
    intraday_target = _target(entry_price, policy.intraday_target_pct, policy.tick_size)
    swing_target = _target(entry_price, policy.swing_target_pct, policy.tick_size)
    entry_path_id = hashlib.sha256(
        f"{run_namespace}|{symbol}|{signal_date}|{path[0].ts.isoformat()}|{entry_price}|{quantity}".encode()
    ).hexdigest()
    full_path = evaluate_full_path(
        entry_path_id=entry_path_id, symbol=symbol, entry_price=entry_price,
        quantity=quantity,
        bars=[LadderBar(bar.ts, bar.session, bar.open, bar.high, bar.low, bar.close) for bar in path],
        policy=FullPathPolicy(tick_size=policy.tick_size),
    )
    execution = i030_else_s100_v1(
        full_path, entry_price=entry_price, quantity=quantity,
        intraday_cost_bps=policy.intraday_round_trip_cost_bps,
        swing_cost_bps=policy.swing_round_trip_cost_bps,
        positive_profit_tax_rate=policy.positive_profit_tax_rate,
    )
    evaluation_sessions = full_path["sessions_evaluated"]
    entry_notional = entry_price * quantity
    if execution["status"] == "CLOSED":
        status = "CLOSED"
        exit_ts = datetime.fromisoformat(execution["exit_ts"])
        exit_price = Decimal(str(execution["exit_price"]))
        exit_date = exit_ts.date()
        gross = Decimal(str(execution["realised_gross_pnl"]))
        costs = Decimal(str(execution["costs"]))
        tax = Decimal(str(execution["tax_reserve"]))
        after_tax = Decimal(str(execution["after_tax_pnl"]))
        mark_price = exit_price
        unrealized_net = Decimal("0")
    else:
        status = "OPEN_AS_OF_DATA_BOUNDARY"
        exit_ts = None
        exit_date = None
        exit_price = None
        mark_price = Decimal(str(full_path["extended_capital_lock"]["data_boundary_close"]))
        costs = entry_notional * policy.swing_round_trip_cost_bps / Decimal("10000")
        gross = Decimal("0")
        tax = Decimal("0")
        after_tax = Decimal("0")
        unrealized_net = (mark_price - entry_price) * quantity - costs
    observation_end_ts = exit_ts or path[-1].ts
    observed_sessions = list(dict.fromkeys(bar.session for bar in path if bar.ts <= observation_end_ts))
    actual_holding_minutes = max((observation_end_ts - path[0].ts).total_seconds() / 60.0, 0.0)
    actual_holding_calendar_days = max((observation_end_ts.date() - entry_session).days, 0)
    session_closes: list[tuple[date, Decimal]] = []
    for session in observed_sessions:
        close = [bar.close for bar in path if bar.session == session and bar.ts <= observation_end_ts][-1]
        session_closes.append((session, close))
    underwater = [session for session, close in session_closes if close < entry_price]
    first_underwater_index = next((index for index, (_, close) in enumerate(session_closes) if close < entry_price), None)
    recovery_index = None if first_underwater_index is None else next(
        (index for index, (_, close) in enumerate(session_closes[first_underwater_index + 1:], start=first_underwater_index + 1) if close >= entry_price),
        None,
    )
    capital_day_fraction = max(actual_holding_minutes / 1440.0, 1.0 / 1440.0)
    i030 = next(event for event in full_path["reward_events"] if event["level_id"] == "I030")
    s100 = next(event for event in full_path["reward_events"] if event["level_id"] == "S100")
    roe_d5_success = bool(i030["hit_flag"] or s100["hit_flag"])
    eventual_s100 = bool(full_path["extended_capital_lock"].get("s100_eventually_hit"))
    if roe_d5_success:
        roe_d5_outcome = "ROE_D5_SUCCESS"
    elif eventual_s100:
        roe_d5_outcome = "ROE_D5_FAILURE_LATE_RECOVERY"
    else:
        roe_d5_outcome = "ROE_D5_FAILURE_STILL_OPEN"
    d5_checkpoint = full_path["checkpoints"][-1]
    d5_mark = Decimal(str(d5_checkpoint["close_price"]))
    d5_gross = (d5_mark - entry_price) * quantity
    d5_costs = entry_notional * policy.swing_round_trip_cost_bps / Decimal("10000")
    d5_pre_tax = d5_gross - d5_costs
    d5_tax = max(d5_pre_tax, Decimal("0")) * policy.positive_profit_tax_rate
    d5_liquidation = d5_pre_tax - d5_tax
    return {
        "policy_id": policy.policy_id,
        "evaluation_policy_id": full_path["evaluation_policy_id"],
        "execution_scenario_id": execution["execution_scenario_id"],
        "entry_path_id": entry_path_id,
        "path_evidence_hash": full_path["path_evidence_hash"],
        "symbol": symbol,
        "signal_date": signal_date,
        "entry_ts": path[0].ts,
        "entry_date": entry_session,
        "entry_price": round(float(entry_price), 6),
        "quantity": quantity,
        "intraday_target_price": round(float(intraday_target), 6),
        "swing_target_price": round(float(swing_target), 6),
        "status": status,
        "exit_ts": exit_ts,
        "exit_date": exit_date,
        "exit_price": round(float(exit_price), 6) if exit_price is not None else None,
        "exit_reason": execution.get("exit_reason", "OPEN_TARGET_NOT_REACHED_AT_DATA_BOUNDARY"),
        "gross_pnl": round(float(gross), 4),
        "costs": round(float(costs), 4),
        "tax_reserve": round(float(tax), 4),
        "after_tax_net_pnl": round(float(after_tax), 4),
        "unrealized_net_liquidation_pnl": round(float(unrealized_net), 4),
        "mark_price": round(float(mark_price), 6),
        "evaluation_sessions": evaluation_sessions,
        # Compatibility only for existing persistence; new analysis must use
        # evaluation_sessions or the actual-holding fields below.
        "holding_sessions": evaluation_sessions,
        "actual_holding_minutes": round(actual_holding_minutes, 4),
        "actual_holding_trading_sessions": len(observed_sessions),
        "actual_holding_calendar_days": actual_holding_calendar_days,
        "capital_days": round(float(entry_notional) * capital_day_fraction, 4),
        "time_underwater_sessions": len(underwater),
        "recovery_sessions": None if recovery_index is None or first_underwater_index is None else recovery_index - first_underwater_index,
        "roe_d5_outcome": roe_d5_outcome,
        "roe_d5_evaluation_ts": d5_checkpoint["checkpoint_ts"],
        "roe_d5_success": roe_d5_success,
        "roe_d5_mark_to_market_pnl": round(float(d5_gross), 4),
        "roe_d5_liquidation_diagnostic_pnl": round(float(d5_liquidation), 4),
        "mfe_pct": round(float(full_path["mfe_d5_pct"]), 4),
        "mae_pct": round(float(full_path["mae_d5_pct"]), 4),
        "stop_price": None,
        "stop_exit_enabled": False,
        "timeout_exit_enabled": False,
        "capital_released": status == "CLOSED",
        "target_events": full_path["reward_events"],
        "adverse_events": full_path["adverse_events"],
        "path_checkpoints": full_path["checkpoints"],
        "coverage_status": full_path["coverage_status"],
        "invariant_checks": full_path["invariant_checks"],
        "best_intraday_target_id": full_path["best_intraday_target_id"],
        "best_d5_target_id": full_path["best_d5_target_id"],
        "deepest_adverse_level_id": full_path["deepest_adverse_level_id"],
        "policy": asdict(policy),
    }
