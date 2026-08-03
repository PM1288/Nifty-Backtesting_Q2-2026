from __future__ import annotations

import json
from datetime import date
from decimal import Decimal
from pathlib import Path

from nifty_stratlab.contracts import ProductType
from nifty_stratlab.costs.config import load_fee_registry
from nifty_stratlab.costs.engine import calculate_round_trip, solve_minimum_exit_price


def test_equity_cost_golden_vectors_remain_stable():
    repo = Path(__file__).resolve().parents[2]
    vectors = json.loads((repo / "contracts/golden/equity_cost_vectors.json").read_text(encoding="utf-8"))
    registry = load_fee_registry(repo / "config/fee_schedules.example.yml")
    for case in vectors["cases"]:
        product = ProductType(case["product"])
        schedule = registry.resolve(date.fromisoformat(case["trade_date"]), "NSE", product)
        solution = solve_minimum_exit_price(
            entry_price=Decimal(case["entry_price"]), quantity=int(case["quantity"]),
            target_net_pnl=Decimal(case["target_net_pnl"]), tick_size=Decimal(case["tick_size"]),
            schedule=schedule,
        )
        assert solution.exit_price == Decimal(case["expected_exit_price"])
        cost = calculate_round_trip(
            entry_price=Decimal(case["entry_price"]), exit_price=solution.exit_price,
            quantity=int(case["quantity"]), schedule=schedule,
        )
        assert cost.net_pnl == Decimal(case["expected_cost"]["net_pnl"])
