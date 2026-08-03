from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from decimal import ROUND_FLOOR, Decimal

from nifty_stratlab.contracts import CostBreakdown, ProductType, Side
from nifty_stratlab.costs.engine import ExecutionFriction, FeeScheduleRegistry, calculate_round_trip, calculate_side_cost, solve_minimum_exit_price
from nifty_stratlab.simulation.models import PathPolicy


@dataclass(frozen=True)
class OptionPremiumBar:
    event_ts: datetime
    open: Decimal
    high: Decimal
    low: Decimal
    close: Decimal


@dataclass(frozen=True)
class LongOptionTrade:
    entry_ts: datetime
    exit_ts: datetime
    entry_price: Decimal
    exit_price: Decimal
    quantity: int
    lots: int
    target_price: Decimal
    stop_price: Decimal
    exit_reason: str
    ambiguous_path: bool
    cost: CostBreakdown


def simulate_long_option_trade(
    bars: list[OptionPremiumBar],
    *,
    signal_index: int,
    lot_size: int,
    ticket_size: Decimal,
    target_net_pnl: Decimal,
    stop_loss_pct: Decimal,
    horizon_bars: int,
    tick_size: Decimal,
    exchange: str,
    product: ProductType,
    fee_registry: FeeScheduleRegistry,
    friction: ExecutionFriction | None = None,
    path_policy: PathPolicy = PathPolicy.STOP_FIRST,
) -> LongOptionTrade | None:
    """Buying-only option simulation using observed option premium OHLC."""

    if product not in {ProductType.INDEX_OPTION, ProductType.STOCK_OPTION}:
        raise ValueError("product must be an option product")
    if lot_size <= 0 or signal_index < 0 or signal_index + 1 >= len(bars):
        return None
    friction = friction or ExecutionFriction()
    entry_index = signal_index + 1
    entry = bars[entry_index]
    schedule = fee_registry.resolve(entry.event_ts.date(), exchange, product)
    lots = int((ticket_size / (entry.open * lot_size)).to_integral_value(rounding=ROUND_FLOOR))
    while lots > 0:
        quantity = lots * lot_size
        side = calculate_side_cost(
            price=entry.open,
            quantity=quantity,
            side=Side.BUY,
            schedule=schedule,
            slippage_bps=friction.entry_slippage_bps,
            impact_bps=friction.entry_impact_bps,
        )
        if side.trade_value + side.total_cost <= ticket_size:
            break
        lots -= 1
    if lots <= 0:
        return None
    quantity = lots * lot_size
    target = solve_minimum_exit_price(
        entry_price=entry.open,
        quantity=quantity,
        target_net_pnl=target_net_pnl,
        tick_size=tick_size,
        schedule=schedule,
        friction=friction,
    ).exit_price
    stop = (entry.open * (Decimal("1") - stop_loss_pct / Decimal("100")) / tick_size).to_integral_value(rounding=ROUND_FLOOR) * tick_size
    end = min(len(bars) - 1, entry_index + horizon_bars - 1)
    exit_bar = bars[end]
    exit_price = exit_bar.close
    reason = "timeout_close"
    ambiguous = False
    for index in range(entry_index, end + 1):
        bar = bars[index]
        if bar.open >= target:
            exit_bar, exit_price, reason = bar, bar.open, "target_gap_open"
            break
        if bar.open <= stop:
            exit_bar, exit_price, reason = bar, bar.open, "stop_gap_open"
            break
        target_hit = bar.high >= target
        stop_hit = bar.low <= stop
        if target_hit and stop_hit:
            exit_bar = bar
            ambiguous = True
            if path_policy == PathPolicy.TARGET_FIRST:
                exit_price, reason = target, "target_conflict_optimistic"
            elif path_policy == PathPolicy.REJECT_AMBIGUOUS:
                exit_price, reason = bar.open, "ambiguous_rejected_at_open"
            else:
                exit_price, reason = stop, "stop_conflict_conservative"
            break
        if stop_hit:
            exit_bar, exit_price, reason = bar, stop, "stop_hit"
            break
        if target_hit:
            exit_bar, exit_price, reason = bar, target, "target_hit"
            break
    exit_schedule = fee_registry.resolve(exit_bar.event_ts.date(), exchange, product)
    if exit_schedule.schedule_id != schedule.schedule_id:
        from nifty_stratlab.costs.engine import calculate_round_trip_mixed

        cost = calculate_round_trip_mixed(
            entry_price=entry.open,
            exit_price=exit_price,
            quantity=quantity,
            entry_schedule=schedule,
            exit_schedule=exit_schedule,
            friction=friction,
        )
    else:
        cost = calculate_round_trip(
            entry_price=entry.open,
            exit_price=exit_price,
            quantity=quantity,
            schedule=schedule,
            friction=friction,
        )
    return LongOptionTrade(
        entry_ts=entry.event_ts,
        exit_ts=exit_bar.event_ts,
        entry_price=entry.open,
        exit_price=exit_price,
        quantity=quantity,
        lots=lots,
        target_price=target,
        stop_price=stop,
        exit_reason=reason,
        ambiguous_path=ambiguous,
        cost=cost,
    )
