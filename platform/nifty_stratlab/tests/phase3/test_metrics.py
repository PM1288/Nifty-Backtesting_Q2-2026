from datetime import datetime, timedelta, timezone
from decimal import Decimal

from nifty_stratlab.contracts import CostBreakdown, TradeResult
from nifty_stratlab.evaluation.metrics import calculate_performance_metrics
from nifty_stratlab.simulation.models import EquityPoint


def trade(identifier: str, net: str):
    value = Decimal(net)
    cost = CostBreakdown(
        entry_value=Decimal("1000"), exit_value=Decimal("1000") + value + Decimal("10"),
        turnover=Decimal("2000") + value + Decimal("10"), gross_pnl=value + Decimal("10"),
        brokerage=Decimal("2"), stt=Decimal("2"), exchange_transaction_charge=Decimal("1"),
        sebi_charge=Decimal("0"), stamp_duty=Decimal("1"), gst=Decimal("1"),
        dp_charge=Decimal("0"), slippage=Decimal("3"), impact=Decimal("0"),
        total_cost=Decimal("10"), net_pnl=value,
    )
    now = datetime.now(timezone.utc)
    return TradeResult(
        trade_id=identifier, strategy_version_id="s_v1", symbol="AAA",
        entry_ts=now, exit_ts=now + timedelta(minutes=1), entry_price=Decimal("100"),
        exit_price=Decimal("101"), quantity=10, exit_reason="test", gross_pnl=value + Decimal("10"),
        net_pnl=value, cost=cost, bars_held=1,
    )


def test_metrics_use_net_pnl_and_net_liquidation_equity():
    now = datetime.now(timezone.utc)
    equity = [
        EquityPoint(now, Decimal("100"), Decimal("900"), Decimal("1000"), Decimal("990"), 1),
        EquityPoint(now + timedelta(days=1), Decimal("110"), Decimal("900"), Decimal("1010"), Decimal("1000"), 1),
        EquityPoint(now + timedelta(days=2), Decimal("100"), Decimal("800"), Decimal("900"), Decimal("890"), 1),
    ]
    metrics = calculate_performance_metrics([trade("t1", "100"), trade("t2", "-50")], equity)
    assert metrics.total_net_pnl == Decimal("50")
    assert metrics.win_rate_pct == 50
    assert metrics.maximum_drawdown_pct < 0
