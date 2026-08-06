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

from dataclasses import asdict, dataclass
from datetime import date, datetime
from decimal import ROUND_CEILING, Decimal
from typing import Iterable


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
    exit_bar: PathBar | None = None
    exit_price: Decimal | None = None
    exit_reason: str | None = None

    for bar in path:
        target = intraday_target if bar.session == entry_session else swing_target
        if bar.open >= target:
            exit_bar, exit_price = bar, bar.open
            exit_reason = "TARGET_INTRADAY_0_3_GAP" if bar.session == entry_session else "TARGET_SWING_1_0_GAP"
            break
        if bar.high >= target:
            exit_bar, exit_price = bar, target
            exit_reason = "TARGET_INTRADAY_0_3" if bar.session == entry_session else "TARGET_SWING_1_0"
            break

    observed_path = path[: path.index(exit_bar) + 1] if exit_bar else path
    intraday_bars = [bar for bar in observed_path if bar.session == entry_session]
    swing_bars = [bar for bar in observed_path if bar.session != entry_session]
    target_events: list[dict] = []
    for pct in policy.intraday_ladder_pct:
        level = _target(entry_price, pct, policy.tick_size)
        touched = next((bar for bar in intraday_bars if bar.open >= level or bar.high >= level), None)
        target_events.append(_event(f"I{int(pct * 100):03d}", pct, level, touched))
    for pct in policy.swing_ladder_pct:
        level = _target(entry_price, pct, policy.tick_size)
        touched = next((bar for bar in swing_bars if bar.open >= level or bar.high >= level), None)
        target_events.append(_event(f"S{int(pct * 100):03d}", pct, level, touched))

    adverse_events: list[dict] = []
    for pct in policy.adverse_ladder_pct:
        level = entry_price * (Decimal("1") + pct / Decimal("100"))
        touched = next((bar for bar in observed_path if bar.low <= level), None)
        adverse_events.append({
            "threshold_id": f"A{abs(int(pct * 100)):03d}",
            "threshold_pct": float(pct),
            "threshold_price": float(level),
            "touched": touched is not None,
            "first_touch_ts": touched.ts.isoformat() if touched else None,
            "first_touch_session": touched.session.isoformat() if touched else None,
            "exit_triggered": False,
        })

    maximum = max(bar.high for bar in observed_path)
    minimum = min(bar.low for bar in observed_path)
    mfe_pct = (maximum / entry_price - Decimal("1")) * Decimal("100")
    mae_pct = (minimum / entry_price - Decimal("1")) * Decimal("100")
    sessions = len({bar.session for bar in observed_path})
    entry_notional = entry_price * quantity

    if exit_bar and exit_price is not None:
        cost_bps = policy.intraday_round_trip_cost_bps if exit_bar.session == entry_session else policy.swing_round_trip_cost_bps
        costs = entry_notional * cost_bps / Decimal("10000")
        gross = (exit_price - entry_price) * quantity
        pre_tax = gross - costs
        tax = max(pre_tax, Decimal("0")) * policy.positive_profit_tax_rate
        after_tax = pre_tax - tax
        status = "CLOSED"
        mark_price = exit_price
    else:
        # No synthetic sale is created.  This is a net-liquidation estimate for
        # risk/equity reporting only and does not release capital.
        mark_price = observed_path[-1].close
        costs = entry_notional * policy.swing_round_trip_cost_bps / Decimal("10000")
        gross = Decimal("0")
        pre_tax = Decimal("0")
        tax = Decimal("0")
        after_tax = Decimal("0")
        status = "OPEN_AS_OF_END"

    unrealized_net = (mark_price - entry_price) * quantity - costs if status == "OPEN_AS_OF_END" else Decimal("0")
    return {
        "policy_id": policy.policy_id,
        "symbol": symbol,
        "signal_date": signal_date,
        "entry_ts": path[0].ts,
        "entry_date": entry_session,
        "entry_price": round(float(entry_price), 6),
        "quantity": quantity,
        "intraday_target_price": round(float(intraday_target), 6),
        "swing_target_price": round(float(swing_target), 6),
        "status": status,
        "exit_ts": exit_bar.ts if exit_bar else None,
        "exit_date": exit_bar.session if exit_bar else None,
        "exit_price": round(float(exit_price), 6) if exit_price is not None else None,
        "exit_reason": exit_reason or "OPEN_TARGET_NOT_REACHED",
        "gross_pnl": round(float(gross), 4),
        "costs": round(float(costs), 4),
        "tax_reserve": round(float(tax), 4),
        "after_tax_net_pnl": round(float(after_tax), 4),
        "unrealized_net_liquidation_pnl": round(float(unrealized_net), 4),
        "mark_price": round(float(mark_price), 6),
        "holding_sessions": sessions,
        "mfe_pct": round(float(mfe_pct), 4),
        "mae_pct": round(float(mae_pct), 4),
        "stop_price": None,
        "stop_exit_enabled": False,
        "timeout_exit_enabled": False,
        "capital_released": status == "CLOSED",
        "target_events": target_events,
        "adverse_events": adverse_events,
        "policy": asdict(policy),
    }
