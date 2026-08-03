from __future__ import annotations

from datetime import date
import unittest

import pandas as pd

from app.backtesting import (
    PROFIT_TAX_RESERVE_RATE,
    ReplayPosition,
    TradeTemplate,
    _build_regime_map,
    _build_scenarios,
    _close_replay_position,
)


class BacktestingContractsTest(unittest.TestCase):
    def test_required_capital_scenarios_are_explicit(self) -> None:
        strategy = {
            "strategy_id": "test",
            "strategy_version_id": "test_v1",
            "display_name": "Test",
            "archetype": "test",
        }
        scenarios = _build_scenarios(strategy, ["ABC"])
        finite = next(row for row in scenarios if row.scenario_key == "nifty_100:capital_16l")
        unlimited = next(row for row in scenarios if row.scenario_key == "nifty_100:no_capital_limit")

        self.assertEqual(finite.starting_cash, 1_600_000)
        self.assertEqual(finite.ticket_size, 200_000)
        self.assertEqual(finite.max_open_positions, 8)
        self.assertIsNone(unlimited.starting_cash)
        self.assertIsNone(unlimited.max_open_positions)


    def test_positive_realized_profit_reserves_35_percent(self) -> None:
        template = TradeTemplate(
            trade_template_id="template-1",
            strategy_id="strategy-1",
            strategy_version_id="strategy-1-v1",
            symbol="ABC",
            security_name="ABC",
            sector="TEST",
            signal_date=date(2026, 1, 1),
            entry_date=date(2026, 1, 2),
            regime_on_entry="Rising",
            signal_rsi=20,
            signal_willr=-85,
            signal_macd_line=None,
            signal_macd_signal=None,
            signal_sma20=None,
            signal_sma50=None,
            close_vs_prev_close_pct=1,
            rank_inputs={},
            entry_price=100,
            target_price=101,
            stop_price=None,
            theoretical_exit_date=date(2026, 1, 3),
            theoretical_exit_price=101,
            exit_reason="target",
            exit_timing="intraday",
            hold_days=1,
            gross_return_pct=1,
            open_trade_flag_at_asof=False,
            mark_to_market_price=101,
            mark_to_market_return_pct=1,
        )
        position = ReplayPosition(
            template=template,
            quantity=2_000,
            entry_charges=0,
            gross_entry_value=200_000,
            invested_basis=200_000,
            last_market_value=200_000,
        )

        trade, _ = _close_replay_position(
            position,
            date(2026, 1, 3),
            101,
            "target",
            0,
            lambda *_args, **_kwargs: {"total": 0.0},
        )

        self.assertEqual(trade["net_pnl"], 2_000)
        self.assertEqual(trade["profit_tax_rate"], PROFIT_TAX_RESERVE_RATE)
        self.assertEqual(trade["profit_tax_amount"], 700)
        self.assertEqual(trade["after_tax_net_pnl"], 1_300)


    def test_regime_uses_nifty_and_india_vix_changes(self) -> None:
        frame = pd.DataFrame(
            [
                {"trade_date": "2026-01-01", "nifty_close": 25_000, "vix_close": 12},
                {"trade_date": "2026-01-02", "nifty_close": 25_500, "vix_close": 12.5},
                {"trade_date": "2026-01-03", "nifty_close": 25_510, "vix_close": 15},
            ]
        )
        regimes = _build_regime_map(frame)

        self.assertEqual(regimes[date(2026, 1, 2)], "Shock")
        self.assertEqual(regimes[date(2026, 1, 3)], "Shock")


if __name__ == "__main__":
    unittest.main()
