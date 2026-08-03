from datetime import datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from nifty_stratlab.contracts import ProductType
from nifty_stratlab.simulation.engine import BacktestEngine
from nifty_stratlab.simulation.models import SimulationConfig
from nifty_stratlab.strategy.sdk import BaseStrategy, StrategyBar, StrategyContext, StrategyManifest


class EnterOnce(BaseStrategy):
    def on_bar(self, context: StrategyContext):
        if context.current.features.get("sequence") == 0 and not context.position_open:
            return (self.entry_signal(context, ("test_entry",)),)
        return ()


def manifest():
    return StrategyManifest(
        strategy_id="enter_once",
        strategy_version_id="enter_once_v1",
        display_name="Enter once",
        version=1,
        archetype="test",
        plugin="tests.phase2.test_simulator:EnterOnce",
        supported_intervals=("1m",),
        required_features=(),
        parameters={},
        assumptions={},
        owner="test",
    )


def test_signal_enters_only_at_next_bar_open_and_uses_entry_bar_path(intraday_registry):
    tz = ZoneInfo("Asia/Kolkata")
    start = datetime(2026, 8, 4, 9, 15, tzinfo=tz)
    bars = [
        StrategyBar("AAA", "NSE:AAA", start, start + timedelta(minutes=1), "1m", 100, 100.1, 99.9, 100, 1000, {"sequence": 0}),
        StrategyBar("AAA", "NSE:AAA", start + timedelta(minutes=1), start + timedelta(minutes=2), "1m", 100, 102, 99.8, 101, 1000, {"sequence": 1}),
        StrategyBar("AAA", "NSE:AAA", start + timedelta(minutes=2), start + timedelta(minutes=3), "1m", 101, 102, 100, 101, 1000, {"sequence": 2}),
    ]
    result = BacktestEngine(
        strategy=EnterOnce(manifest()),
        config=SimulationConfig(
            initial_cash=Decimal("300000"),
            ticket_size=Decimal("200000"),
            max_open_positions=1,
            product=ProductType.EQUITY_INTRADAY,
            target_net_pnl=Decimal("100"),
            stop_loss_pct=Decimal("5"),
            max_hold_bars=10,
        ),
        fee_registry=intraday_registry,
    ).run(bars)
    assert len(result.trades) == 1
    assert result.trades[0].entry_ts == bars[1].event_ts
    assert result.trades[0].exit_ts == bars[1].event_ts
    assert result.trades[0].net_pnl >= Decimal("100")
