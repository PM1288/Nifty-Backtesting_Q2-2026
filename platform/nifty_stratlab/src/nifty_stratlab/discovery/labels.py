from __future__ import annotations

from dataclasses import dataclass
from decimal import ROUND_FLOOR, Decimal

import pandas as pd

from nifty_stratlab.contracts import ProductType, Side
from nifty_stratlab.costs.engine import (
    ExecutionFriction,
    FeeScheduleRegistry,
    calculate_round_trip,
    calculate_side_cost,
    solve_minimum_exit_price,
)
from nifty_stratlab.simulation.models import PathPolicy


@dataclass(frozen=True)
class OpportunityLabelConfig:
    ticket_size: Decimal
    target_net_pnl: Decimal
    stop_loss_pct: Decimal
    horizon_bars: int
    tick_size: Decimal
    exchange: str
    product: ProductType
    path_policy: PathPolicy = PathPolicy.STOP_FIRST


REQUIRED = {"symbol", "event_ts", "open", "high", "low", "close"}


def build_executable_opportunity_labels(
    frame: pd.DataFrame,
    *,
    config: OpportunityLabelConfig,
    fee_registry: FeeScheduleRegistry,
    friction: ExecutionFriction | None = None,
) -> pd.DataFrame:
    """Label next-bar long opportunities using actual future premium/price bars.

    Features are not computed here. Callers must join only feature snapshots
    whose `available_at` is not after the decision timestamp.
    """

    missing = REQUIRED - set(frame.columns)
    if missing:
        raise ValueError(f"missing columns: {sorted(missing)}")
    if config.horizon_bars <= 0:
        raise ValueError("horizon_bars must be positive")
    friction = friction or ExecutionFriction()
    data = frame.copy()
    data["event_ts"] = pd.to_datetime(data["event_ts"], utc=True)
    data = data.sort_values(["symbol", "event_ts"], kind="mergesort").reset_index(drop=True)
    rows: list[dict] = []

    for symbol, group in data.groupby("symbol", sort=False):
        group = group.reset_index(drop=True)
        for decision_index in range(0, len(group) - 1):
            entry_index = decision_index + 1
            entry = group.iloc[entry_index]
            entry_price = Decimal(str(entry["open"]))
            trade_date = entry["event_ts"].tz_convert("Asia/Kolkata").date()
            schedule = fee_registry.resolve(trade_date, config.exchange, config.product)
            quantity = int((config.ticket_size / entry_price).to_integral_value(rounding=ROUND_FLOOR))
            while quantity > 0:
                side = calculate_side_cost(
                    price=entry_price,
                    quantity=quantity,
                    side=Side.BUY,
                    schedule=schedule,
                    slippage_bps=friction.entry_slippage_bps,
                    impact_bps=friction.entry_impact_bps,
                )
                if side.trade_value + side.total_cost <= config.ticket_size:
                    break
                quantity -= 1
            if quantity <= 0:
                continue
            target = solve_minimum_exit_price(
                entry_price=entry_price,
                quantity=quantity,
                target_net_pnl=config.target_net_pnl,
                tick_size=config.tick_size,
                schedule=schedule,
                friction=friction,
            ).exit_price
            raw_stop = entry_price * (Decimal("1") - config.stop_loss_pct / Decimal("100"))
            stop = (raw_stop / config.tick_size).to_integral_value(rounding=ROUND_FLOOR) * config.tick_size
            end_index = min(len(group) - 1, entry_index + config.horizon_bars - 1)
            exit_price = Decimal(str(group.iloc[end_index]["close"]))
            exit_reason = "timeout_close"
            exit_index = end_index
            ambiguous = False
            mfe_pct = Decimal("0")
            mae_pct = Decimal("0")

            for future_index in range(entry_index, end_index + 1):
                bar = group.iloc[future_index]
                open_px = Decimal(str(bar["open"]))
                high = Decimal(str(bar["high"]))
                low = Decimal(str(bar["low"]))
                mfe_pct = max(mfe_pct, (high / entry_price - 1) * 100)
                mae_pct = min(mae_pct, (low / entry_price - 1) * 100)
                if open_px >= target:
                    exit_price, exit_reason, exit_index = open_px, "target_gap_open", future_index
                    break
                if open_px <= stop:
                    exit_price, exit_reason, exit_index = open_px, "stop_gap_open", future_index
                    break
                hit_target = high >= target
                hit_stop = low <= stop
                if hit_target and hit_stop:
                    ambiguous = True
                    if config.path_policy == PathPolicy.TARGET_FIRST:
                        exit_price, exit_reason = target, "target_conflict_optimistic"
                    elif config.path_policy == PathPolicy.REJECT_AMBIGUOUS:
                        exit_price, exit_reason = open_px, "ambiguous_rejected_at_open"
                    else:
                        exit_price, exit_reason = stop, "stop_conflict_conservative"
                    exit_index = future_index
                    break
                if hit_stop:
                    exit_price, exit_reason, exit_index = stop, "stop_hit", future_index
                    break
                if hit_target:
                    exit_price, exit_reason, exit_index = target, "target_hit", future_index
                    break

            exit_date = group.iloc[exit_index]["event_ts"].tz_convert("Asia/Kolkata").date()
            exit_schedule = fee_registry.resolve(exit_date, config.exchange, config.product)
            if exit_schedule.schedule_id != schedule.schedule_id:
                # The initial target was solved with the entry schedule. Use the
                # actual mixed-schedule economics for the final label.
                from nifty_stratlab.costs.engine import calculate_round_trip_mixed

                cost = calculate_round_trip_mixed(
                    entry_price=entry_price,
                    exit_price=exit_price,
                    quantity=quantity,
                    entry_schedule=schedule,
                    exit_schedule=exit_schedule,
                    friction=friction,
                )
            else:
                cost = calculate_round_trip(
                    entry_price=entry_price,
                    exit_price=exit_price,
                    quantity=quantity,
                    schedule=schedule,
                    friction=friction,
                )
            rows.append(
                {
                    "symbol": symbol,
                    "decision_ts": group.iloc[decision_index]["event_ts"],
                    "entry_ts": entry["event_ts"],
                    "exit_ts": group.iloc[exit_index]["event_ts"],
                    "entry_price": float(entry_price),
                    "target_price": float(target),
                    "stop_price": float(stop),
                    "exit_price": float(exit_price),
                    "quantity": quantity,
                    "exit_reason": exit_reason,
                    "target_hit": int(cost.net_pnl >= config.target_net_pnl),
                    "net_pnl": float(cost.net_pnl),
                    "total_cost": float(cost.total_cost),
                    "bars_to_exit": exit_index - entry_index + 1,
                    "mfe_pct": float(mfe_pct),
                    "mae_pct": float(mae_pct),
                    "ambiguous_path": ambiguous,
                }
            )
    return pd.DataFrame(rows)
