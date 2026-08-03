from __future__ import annotations

import math
from dataclasses import asdict, dataclass
from decimal import Decimal
from typing import Iterable

import numpy as np
import pandas as pd

from nifty_stratlab.contracts import TradeResult
from nifty_stratlab.simulation.models import EquityPoint


@dataclass(frozen=True)
class PerformanceMetrics:
    trade_count: int
    win_count: int
    loss_count: int
    win_rate_pct: float | None
    total_gross_pnl: Decimal
    total_cost: Decimal
    total_net_pnl: Decimal
    average_net_pnl: Decimal | None
    median_net_pnl: Decimal | None
    profit_factor: float | None
    maximum_drawdown_pct: float | None
    sharpe_annualised: float | None
    average_bars_held: float | None
    ambiguous_trade_count: int

    def to_dict(self) -> dict:
        value = asdict(self)
        for key, item in list(value.items()):
            if isinstance(item, Decimal):
                value[key] = str(item)
        return value


def _drawdown(values: np.ndarray) -> float | None:
    if values.size == 0:
        return None
    peaks = np.maximum.accumulate(values)
    with np.errstate(divide="ignore", invalid="ignore"):
        drawdown = np.where(peaks != 0, values / peaks - 1.0, 0.0)
    return float(np.nanmin(drawdown) * 100)


def calculate_performance_metrics(
    trades: Iterable[TradeResult],
    equity_curve: Iterable[EquityPoint],
    *,
    annualisation_periods: float = 252.0,
) -> PerformanceMetrics:
    trade_list = list(trades)
    equity_list = list(equity_curve)
    net = [trade.net_pnl for trade in trade_list]
    gross = sum((trade.gross_pnl for trade in trade_list), Decimal("0"))
    costs = sum((trade.cost.total_cost for trade in trade_list), Decimal("0"))
    total_net = sum(net, Decimal("0"))
    wins = [value for value in net if value > 0]
    losses = [value for value in net if value < 0]
    profit_factor = None
    if losses:
        profit_factor = float(sum(wins, Decimal("0")) / abs(sum(losses, Decimal("0"))))
    elif wins:
        profit_factor = math.inf

    equity_values = np.array([float(point.net_liquidation_equity) for point in equity_list], dtype=float)
    sharpe = None
    if equity_values.size >= 3:
        returns = pd.Series(equity_values).pct_change(fill_method=None).dropna().to_numpy()
        if returns.size > 1 and np.std(returns, ddof=1) > 0:
            sharpe = float(np.mean(returns) / np.std(returns, ddof=1) * math.sqrt(annualisation_periods))

    return PerformanceMetrics(
        trade_count=len(trade_list),
        win_count=len(wins),
        loss_count=len(losses),
        win_rate_pct=(len(wins) / len(trade_list) * 100) if trade_list else None,
        total_gross_pnl=gross,
        total_cost=costs,
        total_net_pnl=total_net,
        average_net_pnl=(total_net / len(trade_list)).quantize(Decimal("0.01")) if trade_list else None,
        median_net_pnl=(Decimal(str(np.median([float(value) for value in net]))).quantize(Decimal("0.01")) if net else None),
        profit_factor=profit_factor,
        maximum_drawdown_pct=_drawdown(equity_values),
        sharpe_annualised=sharpe,
        average_bars_held=(sum(trade.bars_held for trade in trade_list) / len(trade_list)) if trade_list else None,
        ambiguous_trade_count=sum(1 for trade in trade_list if trade.ambiguous_path),
    )
