from __future__ import annotations

from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal
from enum import StrEnum

MONEY = Decimal("0.0001")


def money(value: Decimal) -> Decimal:
    return value.quantize(MONEY, rounding=ROUND_HALF_UP)


class TransitionError(ValueError):
    pass


class GroupState(StrEnum):
    BUILDING = "BUILDING"
    PENDING_ENTRY = "PENDING_ENTRY"
    PARTIALLY_OPEN = "PARTIALLY_OPEN"
    OPEN = "OPEN"
    PARTIALLY_CLOSED = "PARTIALLY_CLOSED"
    CLOSED = "CLOSED"
    CANCELLED = "CANCELLED"
    EXPIRED = "EXPIRED"
    AWAITING_SETTLEMENT = "AWAITING_SETTLEMENT"
    ERROR = "ERROR"


GROUP_TRANSITIONS = {
    GroupState.BUILDING: {GroupState.PENDING_ENTRY, GroupState.CANCELLED, GroupState.ERROR},
    GroupState.PENDING_ENTRY: {
        GroupState.PARTIALLY_OPEN,
        GroupState.OPEN,
        GroupState.CANCELLED,
        GroupState.EXPIRED,
        GroupState.ERROR,
    },
    GroupState.PARTIALLY_OPEN: {
        GroupState.OPEN,
        GroupState.PARTIALLY_CLOSED,
        GroupState.CANCELLED,
        GroupState.ERROR,
    },
    GroupState.OPEN: {
        GroupState.PARTIALLY_CLOSED,
        GroupState.CLOSED,
        GroupState.EXPIRED,
        GroupState.AWAITING_SETTLEMENT,
        GroupState.ERROR,
    },
    GroupState.PARTIALLY_CLOSED: {
        GroupState.CLOSED,
        GroupState.EXPIRED,
        GroupState.AWAITING_SETTLEMENT,
        GroupState.ERROR,
    },
    GroupState.AWAITING_SETTLEMENT: {GroupState.CLOSED, GroupState.ERROR},
    GroupState.CLOSED: set(),
    GroupState.CANCELLED: set(),
    GroupState.EXPIRED: {GroupState.AWAITING_SETTLEMENT, GroupState.CLOSED},
    GroupState.ERROR: set(),
}


def validate_group_transition(before: GroupState, after: GroupState) -> None:
    if after not in GROUP_TRANSITIONS[before]:
        raise TransitionError(f"invalid group transition {before}->{after}")


def directional_return(side: str, entry: Decimal, mark: Decimal) -> Decimal:
    if entry <= 0:
        raise ValueError("entry must be positive")
    return (mark - entry) / entry if side == "BUY" else (entry - mark) / entry


def leg_pnl(
    side: str, entry: Decimal, exit_price: Decimal, units: Decimal, multiplier: Decimal = Decimal("1")
) -> Decimal:
    if units < 0 or multiplier <= 0:
        raise ValueError("invalid units or multiplier")
    direction = Decimal("1") if side == "BUY" else Decimal("-1")
    return money((exit_price - entry) * units * multiplier * direction)


def tax_provision(net_before_tax: Decimal, rate: Decimal = Decimal("0.35")) -> Decimal:
    if not (Decimal("0") <= rate <= Decimal("1")):
        raise ValueError("invalid tax rate")
    return money(max(net_before_tax, Decimal("0")) * rate)


@dataclass(frozen=True)
class CostResult:
    brokerage: Decimal
    exchange_charge: Decimal
    stt: Decimal
    sebi_fee: Decimal
    gst: Decimal
    stamp_duty: Decimal
    slippage: Decimal

    @property
    def total(self) -> Decimal:
        return money(
            sum(
                (
                    self.brokerage,
                    self.exchange_charge,
                    self.stt,
                    self.sebi_fee,
                    self.gst,
                    self.stamp_duty,
                    self.slippage,
                ),
                Decimal("0"),
            )
        )


def target_crossed(side: str, target_price: Decimal, high: Decimal, low: Decimal) -> bool:
    return high >= target_price if side == "BUY" else low <= target_price


def adverse_return(side: str, entry: Decimal, high: Decimal, low: Decimal) -> Decimal:
    return (
        min(directional_return(side, entry, low), Decimal("0"))
        if side == "BUY"
        else min(directional_return(side, entry, high), Decimal("0"))
    )


def favourable_return(side: str, entry: Decimal, high: Decimal, low: Decimal) -> Decimal:
    return (
        max(directional_return(side, entry, high), Decimal("0"))
        if side == "BUY"
        else max(directional_return(side, entry, low), Decimal("0"))
    )


def evaluate_target_ladder(
    side: str, entry: Decimal, high: Decimal, low: Decimal, targets: list[Decimal]
) -> list[Decimal]:
    """Return every crossed analytical target; intentionally never breaks early."""
    crossed: list[Decimal] = []
    sign = Decimal("1") if side == "BUY" else Decimal("-1")
    for target in sorted(set(targets)):
        if target <= 0:
            raise ValueError("targets must be positive")
        if target_crossed(side, entry * (Decimal("1") + sign * target), high, low):
            crossed.append(target)
    return crossed
