from __future__ import annotations

import json
import tempfile
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path

from nifty_stratlab.contracts import ProductType
from nifty_stratlab.demo.config import demo_fee_registry
from nifty_stratlab.demo.synthetic import synthetic_equity_frame, synthetic_option_premium_bars
from nifty_stratlab.live.parity import compare_batch_and_online
from nifty_stratlab.options.black_scholes import OptionType, black_scholes_greeks, implied_volatility
from nifty_stratlab.options.simulator import simulate_long_option_trade
from nifty_stratlab.reporting.research_pack import ResearchPackBuilder, ResearchPackRequest, verify_research_pack


def main() -> int:
    differences = compare_batch_and_online(synthetic_equity_frame(bars_per_symbol=80))
    assert not differences
    trade = simulate_long_option_trade(
        synthetic_option_premium_bars(), signal_index=5, lot_size=65,
        ticket_size=Decimal("200000"), target_net_pnl=Decimal("500"),
        stop_loss_pct=Decimal("25"), horizon_bars=30, tick_size=Decimal("0.05"),
        exchange="NSE", product=ProductType.INDEX_OPTION,
        fee_registry=demo_fee_registry(ProductType.INDEX_OPTION),
    )
    assert trade is not None
    greek = black_scholes_greeks(spot=25000, strike=25000, time_years=7/365, risk_free_rate=0.06, volatility=0.18, option_type=OptionType.CALL)
    iv = implied_volatility(market_price=greek.theoretical_price, spot=25000, strike=25000, time_years=7/365, risk_free_rate=0.06, option_type=OptionType.CALL)
    with tempfile.TemporaryDirectory() as temp:
        archive = Path(temp) / "pack.zip"
        builder = ResearchPackBuilder(ResearchPackRequest(as_of=datetime.now(timezone.utc), symbols=("AAA",), purpose="smoke", data_snapshot_id="demo"))
        builder.add_frame("data/bars.csv", synthetic_equity_frame(symbols=("AAA",), bars_per_symbol=10))
        builder.build(archive)
        verified = verify_research_pack(archive)
    print(json.dumps({"phase": 5, "status": "PASS", "option_net_pnl": str(trade.cost.net_pnl), "iv": iv, "parity_differences": 0, "pack_verified": verified["files_verified"]}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
