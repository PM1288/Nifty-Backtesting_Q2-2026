from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal
from enum import StrEnum
from typing import Any

from nifty_stratlab.contracts import ProductType, SignalIntent, TradeResult


class PathPolicy(StrEnum):
    STOP_FIRST = "stop_first"
    TARGET_FIRST = "target_first"
    REJECT_AMBIGUOUS = "reject_ambiguous"


@dataclass(frozen=True)
class SimulationConfig:
    initial_cash: Decimal
    ticket_size: Decimal
    max_open_positions: int
    product: ProductType
    target_net_pnl: Decimal
    stop_loss_pct: Decimal
    max_hold_bars: int
    tick_size: Decimal = Decimal("0.05")
    path_policy: PathPolicy = PathPolicy.STOP_FIRST
    exchange: str = "NSE"
    enable_target_exit: bool = True
    enable_stop_exit: bool = True
    target_intraday_pct: Decimal | None = None
    target_swing_pct: Decimal | None = None
    target_only_exit_contract: bool = False

    def validate(self) -> None:
        if self.initial_cash <= 0 or self.ticket_size <= 0:
            raise ValueError("capital values must be positive")
        if self.max_open_positions <= 0:
            raise ValueError("max_open_positions must be positive")
        if self.target_net_pnl < 0:
            raise ValueError("target_net_pnl cannot be negative")
        if self.stop_loss_pct <= 0 and not self.target_only_exit_contract:
            raise ValueError("stop_loss_pct must be positive")
        if self.max_hold_bars <= 0:
            raise ValueError("max_hold_bars must be positive")
        if self.tick_size <= 0:
            raise ValueError("tick_size must be positive")
        if self.target_intraday_pct is not None and self.target_intraday_pct <= 0:
            raise ValueError("target_intraday_pct must be positive")
        if self.target_swing_pct is not None and self.target_swing_pct <= 0:
            raise ValueError("target_swing_pct must be positive")
        if self.target_intraday_pct is not None and self.target_swing_pct is None:
            raise ValueError("target_swing_pct is required with target_intraday_pct")
        if self.target_only_exit_contract:
            if self.target_intraday_pct is None or self.target_swing_pct is None:
                raise ValueError("target-only contract requires intraday and swing targets")
            if self.enable_stop_exit:
                raise ValueError("target-only contract forbids stop exits")


@dataclass
class PositionState:
    position_id: str
    strategy_version_id: str
    symbol: str
    instrument_id: str
    entry_signal: SignalIntent
    entry_ts: datetime
    entry_price: Decimal
    quantity: int
    target_price: Decimal
    stop_price: Decimal | None
    entry_cost: Decimal
    bars_held: int = 0
    scheduled_exit_reason: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class EquityPoint:
    event_ts: datetime
    cash: Decimal
    gross_market_value: Decimal
    gross_equity: Decimal
    net_liquidation_equity: Decimal
    open_positions: int


@dataclass(frozen=True)
class SkippedSignal:
    signal: SignalIntent
    reason: str
    details: dict[str, Any]


@dataclass
class SimulationResult:
    trades: list[TradeResult] = field(default_factory=list)
    open_positions: list[PositionState] = field(default_factory=list)
    equity_curve: list[EquityPoint] = field(default_factory=list)
    skipped_signals: list[SkippedSignal] = field(default_factory=list)
    signals: list[SignalIntent] = field(default_factory=list)
    final_cash: Decimal = Decimal("0")
