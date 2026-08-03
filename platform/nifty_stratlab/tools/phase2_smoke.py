from __future__ import annotations

import json
from decimal import Decimal
from pathlib import Path

from nifty_stratlab.contracts import ProductType
from nifty_stratlab.costs.engine import solve_minimum_exit_price
from nifty_stratlab.demo.config import demo_fee_registry
from nifty_stratlab.demo.synthetic import frame_to_strategy_bars, synthetic_equity_frame
from nifty_stratlab.simulation.engine import BacktestEngine
from nifty_stratlab.simulation.models import SimulationConfig
from nifty_stratlab.strategy.sdk import instantiate_strategy, load_manifest


def main() -> int:
    repo = Path(__file__).resolve().parents[1]
    registry = demo_fee_registry(ProductType.EQUITY_INTRADAY)
    schedule = registry.resolve(__import__("datetime").date(2026, 8, 4), "NSE", ProductType.EQUITY_INTRADAY)
    target = solve_minimum_exit_price(
        entry_price=Decimal("500"), quantity=400, target_net_pnl=Decimal("500"),
        tick_size=Decimal("0.05"), schedule=schedule,
    )
    manifest = load_manifest(repo / "config/strategies/fast_oversold_rebound_v1.yml")
    engine = BacktestEngine(
        strategy=instantiate_strategy(manifest),
        config=SimulationConfig(
            initial_cash=Decimal("1000000"), ticket_size=Decimal("200000"),
            max_open_positions=3, product=ProductType.EQUITY_INTRADAY,
            target_net_pnl=Decimal("500"), stop_loss_pct=Decimal("1"), max_hold_bars=60,
        ),
        fee_registry=registry,
    )
    result = engine.run(frame_to_strategy_bars(synthetic_equity_frame(bars_per_symbol=220)))
    assert result.signals
    total_net = sum((trade.net_pnl for trade in result.trades), Decimal("0"))
    print(json.dumps({"phase": 2, "status": "PASS", "target_price": str(target.exit_price), "trade_count": len(result.trades), "net_pnl": str(total_net)}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
