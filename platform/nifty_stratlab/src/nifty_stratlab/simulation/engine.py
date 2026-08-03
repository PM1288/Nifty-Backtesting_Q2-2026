from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime
from zoneinfo import ZoneInfo
from decimal import ROUND_FLOOR, ROUND_HALF_UP, Decimal
from typing import Iterable

from nifty_stratlab.contracts import ProductType, Side, TradeResult
from nifty_stratlab.costs.engine import (
    ExecutionFriction,
    FeeSchedule,
    FeeScheduleRegistry,
    calculate_round_trip_mixed,
    calculate_side_cost,
    solve_minimum_exit_price,
)
from nifty_stratlab.simulation.models import (
    EquityPoint,
    PathPolicy,
    PositionState,
    SimulationConfig,
    SimulationResult,
    SkippedSignal,
)
from nifty_stratlab.strategy.sdk import StrategyBar, StrategyContext, StrategyPlugin
from nifty_stratlab.util.hashing import stable_id


PAISE = Decimal("0.01")


class BacktestEngine:
    """Deterministic event-clock simulator for daily or intraday bars.

    Strategy code can only emit intents.  The engine owns timing, sizing, cash,
    fees, targets, stops, path ambiguity and persistence-ready evidence.
    """

    def __init__(
        self,
        *,
        strategy: StrategyPlugin,
        config: SimulationConfig,
        fee_registry: FeeScheduleRegistry,
        friction: ExecutionFriction | None = None,
    ) -> None:
        config.validate()
        self.strategy = strategy
        self.config = config
        self.fee_registry = fee_registry
        self.friction = friction or ExecutionFriction()

    @staticmethod
    def _sorted_bars(bars: Iterable[StrategyBar]) -> dict[str, list[StrategyBar]]:
        grouped: dict[str, list[StrategyBar]] = defaultdict(list)
        for bar in bars:
            grouped[bar.symbol].append(bar)
        for symbol, rows in grouped.items():
            rows.sort(key=lambda item: (item.event_ts, item.available_at))
            for previous, current in zip(rows, rows[1:]):
                if current.event_ts <= previous.event_ts:
                    raise ValueError(f"duplicate or out-of-order bar for {symbol}: {current.event_ts}")
        return dict(grouped)

    @staticmethod
    def _trade_date(timestamp: datetime) -> date:
        return timestamp.astimezone(ZoneInfo("Asia/Kolkata")).date()

    def _schedule(self, trade_date: date) -> FeeSchedule:
        return self.fee_registry.resolve(trade_date, self.config.exchange, self.config.product)

    def _entry_quantity(self, price: Decimal, cash: Decimal, schedule: FeeSchedule) -> tuple[int, Decimal] | None:
        budget = min(self.config.ticket_size, cash)
        quantity = int((budget / price).to_integral_value(rounding=ROUND_FLOOR))
        while quantity > 0:
            entry_cost = calculate_side_cost(
                price=price,
                quantity=quantity,
                side=Side.BUY,
                schedule=schedule,
                slippage_bps=self.friction.entry_slippage_bps,
                impact_bps=self.friction.entry_impact_bps,
            ).total_cost
            if price * quantity + entry_cost <= cash and price * quantity + entry_cost <= self.config.ticket_size:
                return quantity, entry_cost
            quantity -= 1
        return None

    def _exit_trade(
        self,
        position: PositionState,
        *,
        exit_ts: datetime,
        exit_price: Decimal,
        exit_reason: str,
        ambiguous: bool,
    ) -> TradeResult:
        entry_schedule = self._schedule(self._trade_date(position.entry_ts))
        exit_schedule = self._schedule(self._trade_date(exit_ts))
        cost = calculate_round_trip_mixed(
            entry_price=position.entry_price,
            exit_price=exit_price,
            quantity=position.quantity,
            entry_schedule=entry_schedule,
            exit_schedule=exit_schedule,
            friction=self.friction,
        )
        return TradeResult(
            trade_id=stable_id(
                "trade",
                {
                    "position": position.position_id,
                    "exit_ts": exit_ts,
                    "exit_reason": exit_reason,
                    "exit_price": exit_price,
                },
            ),
            strategy_version_id=position.strategy_version_id,
            symbol=position.symbol,
            entry_ts=position.entry_ts,
            exit_ts=exit_ts,
            entry_price=position.entry_price,
            exit_price=exit_price,
            quantity=position.quantity,
            exit_reason=exit_reason,
            gross_pnl=cost.gross_pnl,
            net_pnl=cost.net_pnl,
            cost=cost,
            bars_held=position.bars_held,
            ambiguous_path=ambiguous,
            metadata={"position_id": position.position_id},
        )

    def _intrabar_exit(self, position: PositionState, bar: StrategyBar) -> tuple[Decimal, str, bool] | None:
        open_price = Decimal(str(bar.open))
        high = Decimal(str(bar.high))
        low = Decimal(str(bar.low))
        if self.config.enable_target_exit and open_price >= position.target_price:
            return open_price, "target_gap_open", False
        if self.config.enable_stop_exit and open_price <= position.stop_price:
            return open_price, "stop_gap_open", False
        hit_target = self.config.enable_target_exit and high >= position.target_price
        hit_stop = self.config.enable_stop_exit and low <= position.stop_price
        if hit_target and hit_stop:
            if self.config.path_policy == PathPolicy.STOP_FIRST:
                return position.stop_price, "stop_intrabar_conflict_conservative", True
            if self.config.path_policy == PathPolicy.TARGET_FIRST:
                return position.target_price, "target_intrabar_conflict_optimistic", True
            return open_price, "ambiguous_bar_rejected_exit_at_open", True
        if hit_stop:
            return position.stop_price, "stop_intraday_hit", False
        if hit_target:
            return position.target_price, "target_intraday_hit", False
        return None

    def run(self, bars: Iterable[StrategyBar]) -> SimulationResult:
        grouped = self._sorted_bars(bars)
        by_time: dict[datetime, dict[str, StrategyBar]] = defaultdict(dict)
        for symbol, rows in grouped.items():
            for bar in rows:
                if symbol in by_time[bar.event_ts]:
                    raise ValueError(f"duplicate symbol bar at {bar.event_ts}: {symbol}")
                by_time[bar.event_ts][symbol] = bar

        result = SimulationResult(final_cash=self.config.initial_cash)
        cash = self.config.initial_cash
        positions: dict[str, PositionState] = {}
        pending_entries: dict[str, object] = {}
        previous_bar: dict[str, StrategyBar] = {}

        for event_ts in sorted(by_time):
            current_bars = by_time[event_ts]

            # 1. Execute strategy-requested exits at the next observable open.
            for symbol in sorted(list(positions)):
                position = positions[symbol]
                bar = current_bars.get(symbol)
                if bar is None or position.scheduled_exit_reason is None:
                    continue
                exit_price = Decimal(str(bar.open))
                trade = self._exit_trade(
                    position,
                    exit_ts=bar.event_ts,
                    exit_price=exit_price,
                    exit_reason=position.scheduled_exit_reason,
                    ambiguous=False,
                )
                exit_side = calculate_side_cost(
                    price=exit_price,
                    quantity=position.quantity,
                    side=Side.SELL,
                    schedule=self._schedule(bar.available_at.astimezone(ZoneInfo("Asia/Kolkata")).date()),
                    apply_dp_charge=self.config.product == ProductType.EQUITY_DELIVERY,
                    slippage_bps=self.friction.exit_slippage_bps,
                    impact_bps=self.friction.exit_impact_bps,
                )
                cash += exit_side.trade_value - exit_side.total_cost
                result.trades.append(trade)
                del positions[symbol]

            # 2. Execute pending entries at the symbol's next bar open.
            candidates = []
            for symbol, signal in list(pending_entries.items()):
                if symbol in current_bars:
                    rank_score = float(getattr(signal, "metadata", {}).get("rank_score", 0.0))
                    candidates.append((rank_score, getattr(signal, "decision_ts"), symbol, signal))
            candidates.sort(key=lambda item: (-item[0], item[1], item[2]))
            for _, _, symbol, signal in candidates:
                del pending_entries[symbol]
                if symbol in positions:
                    result.skipped_signals.append(SkippedSignal(signal=signal, reason="position_already_open", details={}))
                    continue
                if len(positions) >= self.config.max_open_positions:
                    result.skipped_signals.append(
                        SkippedSignal(signal=signal, reason="max_open_positions", details={"limit": self.config.max_open_positions})
                    )
                    continue
                bar = current_bars[symbol]
                entry_price = Decimal(str(bar.open))
                schedule = self._schedule(bar.available_at.astimezone(ZoneInfo("Asia/Kolkata")).date())
                sized = self._entry_quantity(entry_price, cash, schedule)
                if sized is None:
                    result.skipped_signals.append(
                        SkippedSignal(signal=signal, reason="insufficient_cash", details={"cash": str(cash)})
                    )
                    continue
                quantity, entry_cost = sized
                target = solve_minimum_exit_price(
                    entry_price=entry_price,
                    quantity=quantity,
                    target_net_pnl=self.config.target_net_pnl,
                    tick_size=self.config.tick_size,
                    schedule=schedule,
                    friction=self.friction,
                )
                raw_stop = entry_price * (Decimal("1") - self.config.stop_loss_pct / Decimal("100"))
                stop_ticks = (raw_stop / self.config.tick_size).to_integral_value(rounding=ROUND_FLOOR)
                stop = stop_ticks * self.config.tick_size
                position = PositionState(
                    position_id=stable_id(
                        "pos",
                        {
                            "strategy": self.strategy.manifest.strategy_version_id,
                            "symbol": symbol,
                            "entry_ts": bar.event_ts,
                            "signal_id": signal.signal_id,
                        },
                    ),
                    strategy_version_id=self.strategy.manifest.strategy_version_id,
                    symbol=symbol,
                    instrument_id=bar.instrument_id,
                    entry_signal=signal,
                    entry_ts=bar.event_ts,
                    entry_price=entry_price,
                    quantity=quantity,
                    target_price=target.exit_price,
                    stop_price=stop,
                    entry_cost=entry_cost,
                    metadata={"target_solution": target.__dict__},
                )
                cash -= entry_price * quantity + entry_cost
                positions[symbol] = position

            # 3. Apply observable intrabar paths, including the entry bar.
            for symbol in sorted(list(positions)):
                bar = current_bars.get(symbol)
                if bar is None:
                    continue
                position = positions[symbol]
                exit_decision = self._intrabar_exit(position, bar)
                if exit_decision is not None:
                    exit_price, exit_reason, ambiguous = exit_decision
                    trade = self._exit_trade(
                        position,
                        exit_ts=bar.event_ts,
                        exit_price=exit_price,
                        exit_reason=exit_reason,
                        ambiguous=ambiguous,
                    )
                    exit_side = calculate_side_cost(
                        price=exit_price,
                        quantity=position.quantity,
                        side=Side.SELL,
                        schedule=self._schedule(bar.available_at.astimezone(ZoneInfo("Asia/Kolkata")).date()),
                        apply_dp_charge=self.config.product == ProductType.EQUITY_DELIVERY,
                        slippage_bps=self.friction.exit_slippage_bps,
                        impact_bps=self.friction.exit_impact_bps,
                    )
                    cash += exit_side.trade_value - exit_side.total_cost
                    result.trades.append(trade)
                    del positions[symbol]

            # 4. Evaluate completed bars. Intents cannot alter the same bar.
            for symbol in sorted(current_bars):
                bar = current_bars[symbol]
                context = StrategyContext(
                    manifest=self.strategy.manifest,
                    current=bar,
                    previous=previous_bar.get(symbol),
                    position_open=symbol in positions,
                    bars_since_entry=positions[symbol].bars_held if symbol in positions else None,
                )
                for signal in self.strategy.on_bar(context):
                    if signal.available_at > bar.available_at:
                        raise AssertionError("strategy emitted a signal using future availability")
                    result.signals.append(signal)
                    if signal.intent_type == "enter":
                        if symbol in positions or symbol in pending_entries:
                            result.skipped_signals.append(
                                SkippedSignal(signal=signal, reason="duplicate_or_open", details={})
                            )
                        else:
                            pending_entries[symbol] = signal
                    elif signal.intent_type == "exit" and symbol in positions:
                        positions[symbol].scheduled_exit_reason = (
                            "forced_session_exit_next_open"
                            if "forced_session_exit" in signal.reason_codes
                            else "strategy_rsi_above_70_next_open"
                        )
                previous_bar[symbol] = bar

            # 5. Timeout is a next-open event, not a same-close fill.
            for symbol, position in positions.items():
                if symbol in current_bars:
                    position.bars_held += 1
                    if position.bars_held >= self.config.max_hold_bars and position.scheduled_exit_reason is None:
                        position.scheduled_exit_reason = "max_hold_timeout_next_open"

            # 6. Mark the portfolio. Net liquidation includes estimated sell costs.
            market_value = Decimal("0")
            liquidation_cost = Decimal("0")
            for symbol, position in positions.items():
                bar = current_bars.get(symbol) or previous_bar.get(symbol)
                if bar is None:
                    continue
                close = Decimal(str(bar.close))
                market_value += close * position.quantity
                side = calculate_side_cost(
                    price=close,
                    quantity=position.quantity,
                    side=Side.SELL,
                    schedule=self._schedule(bar.available_at.astimezone(ZoneInfo("Asia/Kolkata")).date()),
                    apply_dp_charge=self.config.product == ProductType.EQUITY_DELIVERY,
                    slippage_bps=self.friction.exit_slippage_bps,
                    impact_bps=self.friction.exit_impact_bps,
                )
                liquidation_cost += side.total_cost
            gross_equity = (cash + market_value).quantize(PAISE, rounding=ROUND_HALF_UP)
            result.equity_curve.append(
                EquityPoint(
                    event_ts=event_ts,
                    cash=cash.quantize(PAISE, rounding=ROUND_HALF_UP),
                    gross_market_value=market_value.quantize(PAISE, rounding=ROUND_HALF_UP),
                    gross_equity=gross_equity,
                    net_liquidation_equity=(gross_equity - liquidation_cost).quantize(PAISE, rounding=ROUND_HALF_UP),
                    open_positions=len(positions),
                )
            )

        result.open_positions = list(positions.values())
        result.final_cash = cash.quantize(PAISE, rounding=ROUND_HALF_UP)
        return result
