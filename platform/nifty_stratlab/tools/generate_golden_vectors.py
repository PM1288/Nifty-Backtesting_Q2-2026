from __future__ import annotations

import json
from datetime import date
from decimal import Decimal
from pathlib import Path

from nifty_stratlab.calendar.config import load_calendar_config
from nifty_stratlab.calendar.service import resolve_expiry
from nifty_stratlab.contracts import ProductType
from nifty_stratlab.costs.config import load_fee_registry
from nifty_stratlab.costs.engine import calculate_round_trip, solve_minimum_exit_price
from nifty_stratlab.options.black_scholes import OptionType, black_scholes_greeks


def decimal_json(value):
    if isinstance(value, Decimal):
        return format(value, "f")
    if hasattr(value, "model_dump"):
        return value.model_dump(mode="json")
    if hasattr(value, "__dataclass_fields__"):
        from dataclasses import asdict
        return asdict(value)
    if hasattr(value, "isoformat"):
        return value.isoformat()
    raise TypeError(type(value).__name__)


def main() -> int:
    repo = Path(__file__).resolve().parents[1]
    out = repo / "contracts" / "golden"
    out.mkdir(parents=True, exist_ok=True)
    fees = load_fee_registry(repo / "config/fee_schedules.example.yml")
    cases = []
    for product, entry, quantity, target in [
        (ProductType.EQUITY_INTRADAY, Decimal("500"), 400, Decimal("500")),
        (ProductType.EQUITY_INTRADAY, Decimal("1000"), 200, Decimal("500")),
        (ProductType.EQUITY_DELIVERY, Decimal("500"), 400, Decimal("1000")),
    ]:
        schedule = fees.resolve(date(2026, 8, 2), "NSE", product)
        solution = solve_minimum_exit_price(
            entry_price=entry, quantity=quantity, target_net_pnl=target,
            tick_size=Decimal("0.05"), schedule=schedule,
        )
        cost = calculate_round_trip(
            entry_price=entry, exit_price=solution.exit_price,
            quantity=quantity, schedule=schedule,
        )
        cases.append({
            "product": product.value,
            "trade_date": "2026-08-02",
            "entry_price": entry,
            "quantity": quantity,
            "target_net_pnl": target,
            "tick_size": Decimal("0.05"),
            "expected_exit_price": solution.exit_price,
            "expected_cost": cost,
        })
    (out / "equity_cost_vectors.json").write_text(json.dumps({"warning": "Reference vectors; production rates require contract-note validation.", "cases": cases}, default=decimal_json, indent=2), encoding="utf-8")

    calendar, rules = load_calendar_config(repo / "config/market_rules.example.yml")
    sessions = {
        "nse_cm_2026_08_03_minutes": calendar.expected_bar_count(date(2026, 8, 3), "NSE_CM"),
        "nse_fo_2026_08_02_profile": calendar.profile_for(date(2026, 8, 2), "NSE_FO").profile_id,
        "nse_fo_2026_08_03_profile": calendar.profile_for(date(2026, 8, 3), "NSE_FO").profile_id,
        "nse_fo_2026_08_03_minutes": calendar.expected_bar_count(date(2026, 8, 3), "NSE_FO"),
        "nifty_weekly_reference_2026_08_04": resolve_expiry(date(2026, 8, 4), rules[0], calendar).isoformat(),
    }
    (out / "session_expiry_vectors.json").write_text(json.dumps(sessions, indent=2), encoding="utf-8")

    greek = black_scholes_greeks(
        spot=25000, strike=25000, time_years=7/365, risk_free_rate=0.06,
        volatility=0.18, option_type=OptionType.CALL,
    )
    (out / "option_greeks_vectors.json").write_text(json.dumps({"inputs": {"spot": 25000, "strike": 25000, "time_years": 7/365, "risk_free_rate": 0.06, "volatility": 0.18, "option_type": "CE"}, "expected": greek}, default=decimal_json, indent=2), encoding="utf-8")
    print(f"wrote golden vectors to {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
