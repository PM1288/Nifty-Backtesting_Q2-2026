from decimal import Decimal

from nifty_stratlab.contracts import ProductType
from nifty_stratlab.demo.config import demo_fee_registry
from nifty_stratlab.demo.synthetic import synthetic_option_premium_bars
from nifty_stratlab.options.simulator import simulate_long_option_trade


def test_option_simulator_uses_actual_premium_bars_and_lot_multiple():
    trade = simulate_long_option_trade(
        synthetic_option_premium_bars(80, 9), signal_index=5, lot_size=65,
        ticket_size=Decimal("200000"), target_net_pnl=Decimal("500"),
        stop_loss_pct=Decimal("25"), horizon_bars=30, tick_size=Decimal("0.05"),
        exchange="NSE", product=ProductType.INDEX_OPTION,
        fee_registry=demo_fee_registry(ProductType.INDEX_OPTION),
    )
    assert trade is not None
    assert trade.quantity % 65 == 0
    assert trade.exit_ts >= trade.entry_ts
