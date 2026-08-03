from datetime import date
from decimal import Decimal

from nifty_stratlab.contracts import ProductType
from nifty_stratlab.costs.engine import calculate_round_trip, solve_minimum_exit_price


def test_target_solver_returns_first_valid_tick(intraday_registry):
    schedule = intraday_registry.resolve(date(2026, 8, 4), "NSE", ProductType.EQUITY_INTRADAY)
    solution = solve_minimum_exit_price(
        entry_price=Decimal("500"),
        quantity=400,
        target_net_pnl=Decimal("500"),
        tick_size=Decimal("0.05"),
        schedule=schedule,
    )
    final = calculate_round_trip(
        entry_price=Decimal("500"),
        exit_price=solution.exit_price,
        quantity=400,
        schedule=schedule,
    )
    prior = calculate_round_trip(
        entry_price=Decimal("500"),
        exit_price=solution.exit_price - Decimal("0.05"),
        quantity=400,
        schedule=schedule,
    )
    assert final.net_pnl >= Decimal("500")
    assert prior.net_pnl < Decimal("500")
