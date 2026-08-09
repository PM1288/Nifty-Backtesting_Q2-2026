from __future__ import annotations

from datetime import date
import unittest

from app.backtesting import SymbolBar, TradeTemplate, _strategy_definitions
from app.strategy_lab import apply_parameters, evaluate_full_path, validate_parameters


class StrategyLabTest(unittest.TestCase):
    def test_catalogue_rejects_unknown_parameter(self) -> None:
        with self.assertRaisesRegex(ValueError, "unknown parameters"):
            validate_parameters("rsi30_willr80_closegtprev_tp125_v1", {"shell": "rm"})

    def test_catalogue_rejects_out_of_range_parameter(self) -> None:
        with self.assertRaisesRegex(ValueError, "outside"):
            validate_parameters("rsi30_willr80_closegtprev_tp125_v1", {"rsiMax": 101})

    def test_defaults_are_mapped_without_changing_strategy_identity(self) -> None:
        base = next(row for row in _strategy_definitions() if row["strategy_version_id"] == "rsi30_willr80_closegtprev_tp125_v1")
        values = validate_parameters(base["strategy_version_id"], {})
        configured = apply_parameters(base, values)

        self.assertEqual(configured["strategy_version_id"], base["strategy_version_id"])
        self.assertEqual(configured["config"]["entry_rules"]["rsi_max_exclusive"], 30)
        self.assertEqual(configured["config"]["entry_rules"]["willr_max_exclusive"], -80)
        self.assertEqual(configured["config"]["exit_rules"]["take_profit_pct"], 1.25)

    def test_every_ladder_level_is_evaluated_without_early_exit(self) -> None:
        template = TradeTemplate(
            trade_template_id="fixture",
            strategy_id="fixture",
            strategy_version_id="fixture_v1",
            symbol="ABC",
            security_name="ABC",
            sector="TEST",
            signal_date=date(2026, 1, 1),
            entry_date=date(2026, 1, 2),
            regime_on_entry="Rising",
            signal_rsi=20,
            signal_willr=-90,
            signal_macd_line=None,
            signal_macd_signal=None,
            signal_sma20=None,
            signal_sma50=None,
            close_vs_prev_close_pct=1,
            rank_inputs={},
            entry_price=100,
            target_price=101,
            stop_price=None,
            theoretical_exit_date=date(2026, 1, 2),
            theoretical_exit_price=101,
            exit_reason="fixture_exit",
            exit_timing="intraday",
            hold_days=1,
            gross_return_pct=1,
            open_trade_flag_at_asof=False,
            mark_to_market_price=101,
            mark_to_market_return_pct=1,
        )
        bars = [
            SymbolBar(date(2026, 1, 2), "ABC", "ABC", "TEST", 100, 106, 89, 101, 99, 2),
            SymbolBar(date(2026, 1, 3), "ABC", "ABC", "TEST", 101, 107, 100, 106, 101, 5),
        ]

        result = evaluate_full_path(template, bars)
        by_key = {row["key"]: row for row in result["ladderRows"]}

        for key in ("I030", "I050", "I070", "S100", "S200", "S500", "H100", "H200", "H500"):
            self.assertTrue(by_key[key]["hit"], key)
        for key in ("A050", "A100", "A200", "A500", "A1000", "A_GT1000"):
            self.assertTrue(by_key[key]["hit"], key)
        self.assertEqual(result["sequenceState"], "SAME_TIMESTAMP_AMBIGUOUS")
        self.assertTrue(result["sameBarAmbiguity"])
        self.assertTrue(result["rightCensored"])


if __name__ == "__main__":
    unittest.main()
