from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import ROUND_CEILING, ROUND_HALF_UP, Decimal
from enum import StrEnum
from typing import Iterable

from nifty_stratlab.contracts import CostBreakdown, ProductType, Side


PAISE = Decimal("0.01")
RUPEE = Decimal("1")
BPS = Decimal("10000")


class CostError(ValueError):
    pass


class ComponentRounding(StrEnum):
    PAISE = "paise"
    RUPEE_NEAREST = "rupee_nearest"
    NONE = "none"


@dataclass(frozen=True)
class FeeSchedule:
    schedule_id: str
    exchange: str
    product: ProductType
    effective_from: date
    effective_to: date | None
    brokerage_rate: Decimal
    brokerage_cap_per_order: Decimal
    stt_buy_rate: Decimal
    stt_sell_rate: Decimal
    exchange_transaction_rate: Decimal
    sebi_rate: Decimal
    ipft_rate: Decimal
    stamp_buy_rate: Decimal
    gst_rate: Decimal
    dp_sell_flat: Decimal = Decimal("0")
    brokerage_rounding: ComponentRounding = ComponentRounding.PAISE
    stt_rounding: ComponentRounding = ComponentRounding.RUPEE_NEAREST
    statutory_rounding: ComponentRounding = ComponentRounding.PAISE
    notes: str = ""

    def effective_on(self, trade_date: date) -> bool:
        return self.effective_from <= trade_date and (
            self.effective_to is None or trade_date <= self.effective_to
        )

    def validate(self) -> None:
        rates = (
            self.brokerage_rate,
            self.stt_buy_rate,
            self.stt_sell_rate,
            self.exchange_transaction_rate,
            self.sebi_rate,
            self.ipft_rate,
            self.stamp_buy_rate,
            self.gst_rate,
        )
        if any(rate < 0 for rate in rates):
            raise CostError("fee rates cannot be negative")
        if self.brokerage_cap_per_order < 0 or self.dp_sell_flat < 0:
            raise CostError("fixed fees cannot be negative")
        if self.effective_to is not None and self.effective_to < self.effective_from:
            raise CostError("effective_to precedes effective_from")


@dataclass(frozen=True)
class ExecutionFriction:
    entry_slippage_bps: Decimal = Decimal("0")
    exit_slippage_bps: Decimal = Decimal("0")
    entry_impact_bps: Decimal = Decimal("0")
    exit_impact_bps: Decimal = Decimal("0")

    def validate(self) -> None:
        if any(
            value < 0
            for value in (
                self.entry_slippage_bps,
                self.exit_slippage_bps,
                self.entry_impact_bps,
                self.exit_impact_bps,
            )
        ):
            raise CostError("friction basis points cannot be negative")


@dataclass(frozen=True)
class SideCost:
    side: Side
    trade_value: Decimal
    brokerage: Decimal
    stt: Decimal
    exchange_transaction_charge: Decimal
    sebi_charge: Decimal
    ipft_charge: Decimal
    stamp_duty: Decimal
    gst: Decimal
    dp_charge: Decimal
    slippage: Decimal
    impact: Decimal
    total_cost: Decimal


@dataclass(frozen=True)
class TargetSolution:
    exit_price: Decimal
    tick_size: Decimal
    quantity: int
    target_net_pnl: Decimal
    achieved_net_pnl: Decimal
    total_cost: Decimal
    gross_move_pct: Decimal
    schedule_id: str
    iterations: int


def _round(value: Decimal, rule: ComponentRounding) -> Decimal:
    if rule == ComponentRounding.PAISE:
        return value.quantize(PAISE, rounding=ROUND_HALF_UP)
    if rule == ComponentRounding.RUPEE_NEAREST:
        return value.quantize(RUPEE, rounding=ROUND_HALF_UP)
    return value


def _brokerage(turnover: Decimal, rate: Decimal, cap: Decimal, order_count: int) -> Decimal:
    if turnover <= 0 or order_count <= 0:
        return Decimal("0")
    return min(turnover * rate, cap * order_count)


def calculate_side_cost(
    *,
    price: Decimal,
    quantity: int,
    side: Side,
    schedule: FeeSchedule,
    order_count: int = 1,
    apply_dp_charge: bool = False,
    slippage_bps: Decimal = Decimal("0"),
    impact_bps: Decimal = Decimal("0"),
) -> SideCost:
    schedule.validate()
    if price <= 0 or quantity <= 0 or order_count <= 0:
        raise CostError("price, quantity and order_count must be positive")
    if slippage_bps < 0 or impact_bps < 0:
        raise CostError("friction basis points cannot be negative")

    value = (price * quantity).quantize(PAISE, rounding=ROUND_HALF_UP)
    brokerage = _round(
        _brokerage(value, schedule.brokerage_rate, schedule.brokerage_cap_per_order, order_count),
        schedule.brokerage_rounding,
    )
    stt_rate = schedule.stt_buy_rate if side == Side.BUY else schedule.stt_sell_rate
    stt = _round(value * stt_rate, schedule.stt_rounding)
    exchange = _round(value * schedule.exchange_transaction_rate, schedule.statutory_rounding)
    sebi = _round(value * schedule.sebi_rate, schedule.statutory_rounding)
    ipft = _round(value * schedule.ipft_rate, schedule.statutory_rounding)
    stamp = _round(value * schedule.stamp_buy_rate, schedule.statutory_rounding) if side == Side.BUY else Decimal("0")
    gst = _round((brokerage + exchange + sebi + ipft) * schedule.gst_rate, schedule.statutory_rounding)
    dp = _round(schedule.dp_sell_flat, schedule.statutory_rounding) if side == Side.SELL and apply_dp_charge else Decimal("0")
    slippage = (value * slippage_bps / BPS).quantize(PAISE, rounding=ROUND_HALF_UP)
    impact = (value * impact_bps / BPS).quantize(PAISE, rounding=ROUND_HALF_UP)
    total = sum((brokerage, stt, exchange, sebi, ipft, stamp, gst, dp, slippage, impact), Decimal("0")).quantize(
        PAISE, rounding=ROUND_HALF_UP
    )
    return SideCost(
        side=side,
        trade_value=value,
        brokerage=brokerage,
        stt=stt,
        exchange_transaction_charge=exchange,
        sebi_charge=sebi,
        ipft_charge=ipft,
        stamp_duty=stamp,
        gst=gst,
        dp_charge=dp,
        slippage=slippage,
        impact=impact,
        total_cost=total,
    )


def calculate_round_trip_mixed(
    *,
    entry_price: Decimal,
    exit_price: Decimal,
    quantity: int,
    entry_schedule: FeeSchedule,
    exit_schedule: FeeSchedule,
    entry_order_count: int = 1,
    exit_order_count: int = 1,
    apply_dp_charge: bool | None = None,
    friction: ExecutionFriction | None = None,
) -> CostBreakdown:
    """Calculate a long round trip when fee schedules may change while held."""

    if entry_schedule.product != exit_schedule.product:
        raise CostError("entry and exit schedules must use the same product")
    friction = friction or ExecutionFriction()
    friction.validate()
    should_apply_dp = apply_dp_charge
    if should_apply_dp is None:
        should_apply_dp = exit_schedule.product == ProductType.EQUITY_DELIVERY
    entry = calculate_side_cost(
        price=entry_price,
        quantity=quantity,
        side=Side.BUY,
        schedule=entry_schedule,
        order_count=entry_order_count,
        slippage_bps=friction.entry_slippage_bps,
        impact_bps=friction.entry_impact_bps,
    )
    exit_ = calculate_side_cost(
        price=exit_price,
        quantity=quantity,
        side=Side.SELL,
        schedule=exit_schedule,
        order_count=exit_order_count,
        apply_dp_charge=bool(should_apply_dp),
        slippage_bps=friction.exit_slippage_bps,
        impact_bps=friction.exit_impact_bps,
    )
    gross_pnl = (exit_.trade_value - entry.trade_value).quantize(PAISE, rounding=ROUND_HALF_UP)
    total_cost = (entry.total_cost + exit_.total_cost).quantize(PAISE, rounding=ROUND_HALF_UP)
    return CostBreakdown(
        entry_value=entry.trade_value,
        exit_value=exit_.trade_value,
        turnover=entry.trade_value + exit_.trade_value,
        gross_pnl=gross_pnl,
        brokerage=entry.brokerage + exit_.brokerage,
        stt=entry.stt + exit_.stt,
        exchange_transaction_charge=entry.exchange_transaction_charge + exit_.exchange_transaction_charge,
        sebi_charge=entry.sebi_charge + exit_.sebi_charge,
        ipft_charge=entry.ipft_charge + exit_.ipft_charge,
        stamp_duty=entry.stamp_duty + exit_.stamp_duty,
        gst=entry.gst + exit_.gst,
        dp_charge=entry.dp_charge + exit_.dp_charge,
        slippage=entry.slippage + exit_.slippage,
        impact=entry.impact + exit_.impact,
        total_cost=total_cost,
        net_pnl=(gross_pnl - total_cost).quantize(PAISE, rounding=ROUND_HALF_UP),
    )


def calculate_round_trip(
    *,
    entry_price: Decimal,
    exit_price: Decimal,
    quantity: int,
    schedule: FeeSchedule,
    entry_order_count: int = 1,
    exit_order_count: int = 1,
    apply_dp_charge: bool | None = None,
    friction: ExecutionFriction | None = None,
) -> CostBreakdown:
    """Calculate one completed long round trip with per-side rounding."""

    return calculate_round_trip_mixed(
        entry_price=entry_price,
        exit_price=exit_price,
        quantity=quantity,
        entry_schedule=schedule,
        exit_schedule=schedule,
        entry_order_count=entry_order_count,
        exit_order_count=exit_order_count,
        apply_dp_charge=apply_dp_charge,
        friction=friction,
    )


def round_up_to_tick(price: Decimal, tick_size: Decimal) -> Decimal:
    if price <= 0 or tick_size <= 0:
        raise CostError("price and tick_size must be positive")
    ticks = (price / tick_size).to_integral_value(rounding=ROUND_CEILING)
    return ticks * tick_size


def solve_minimum_exit_price(
    *,
    entry_price: Decimal,
    quantity: int,
    target_net_pnl: Decimal,
    tick_size: Decimal,
    schedule: FeeSchedule,
    friction: ExecutionFriction | None = None,
    entry_order_count: int = 1,
    exit_order_count: int = 1,
    max_ticks: int = 10_000_000,
) -> TargetSolution:
    """Find the first valid tick whose post-cost P&L reaches the target."""

    if target_net_pnl < 0:
        raise CostError("target_net_pnl cannot be negative")
    if quantity <= 0:
        raise CostError("quantity must be positive")
    entry_tick = round_up_to_tick(entry_price, tick_size)

    def result_at(tick_number: int) -> CostBreakdown:
        return calculate_round_trip(
            entry_price=entry_price,
            exit_price=tick_size * tick_number,
            quantity=quantity,
            schedule=schedule,
            entry_order_count=entry_order_count,
            exit_order_count=exit_order_count,
            friction=friction,
        )

    low = int((entry_tick / tick_size).to_integral_value())
    low_result = result_at(low)
    if low_result.net_pnl >= target_net_pnl:
        exit_price = tick_size * low
        return TargetSolution(
            exit_price=exit_price,
            tick_size=tick_size,
            quantity=quantity,
            target_net_pnl=target_net_pnl,
            achieved_net_pnl=low_result.net_pnl,
            total_cost=low_result.total_cost,
            gross_move_pct=((exit_price / entry_price) - 1) * 100,
            schedule_id=schedule.schedule_id,
            iterations=1,
        )

    high = low + 1
    iterations = 1
    while high <= max_ticks and result_at(high).net_pnl < target_net_pnl:
        high += max(1, high - low) * 2
        iterations += 1
    if high > max_ticks:
        raise CostError("target solver exceeded max_ticks")

    while low + 1 < high:
        mid = (low + high) // 2
        if result_at(mid).net_pnl >= target_net_pnl:
            high = mid
        else:
            low = mid
        iterations += 1

    final = result_at(high)
    prior = result_at(high - 1) if high > 0 else None
    if prior is not None and prior.net_pnl >= target_net_pnl:
        raise AssertionError("solver did not return the minimum valid tick")
    exit_price = tick_size * high
    return TargetSolution(
        exit_price=exit_price,
        tick_size=tick_size,
        quantity=quantity,
        target_net_pnl=target_net_pnl,
        achieved_net_pnl=final.net_pnl,
        total_cost=final.total_cost,
        gross_move_pct=((exit_price / entry_price) - 1) * 100,
        schedule_id=schedule.schedule_id,
        iterations=iterations,
    )


class FeeScheduleRegistry:
    def __init__(self, schedules: Iterable[FeeSchedule]) -> None:
        self._schedules = tuple(schedules)
        if not self._schedules:
            raise CostError("at least one fee schedule is required")
        for schedule in self._schedules:
            schedule.validate()

    def resolve(self, trade_date: date, exchange: str, product: ProductType) -> FeeSchedule:
        matches = [
            schedule
            for schedule in self._schedules
            if schedule.exchange == exchange
            and schedule.product == product
            and schedule.effective_on(trade_date)
        ]
        if len(matches) != 1:
            raise CostError(
                f"expected exactly one fee schedule for {trade_date=} {exchange=} {product=}; found {len(matches)}"
            )
        return matches[0]
