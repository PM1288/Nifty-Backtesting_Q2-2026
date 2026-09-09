"""Synthetic fixtures only; no fixture is persisted or used by production."""
import unittest
from copy import deepcopy
from datetime import date, timedelta

from trade_quality import FEATURES, build_trade_example, fit_trade_quality, option_pnl


def row(indicators=True, endpoint=12.0):
    indicator = {key: {"rsi14": 55.0, "macd": .2, "macd_signal9": .1,
                       "macd_histogram": .1} for key in ("underlying", "ce", "pe")}
    return {
        "signal_key": "test", "trade_date": "2026-09-09", "entry_end": "2026-09-09T04:00:00Z",
        "direction": "CALL", "interval_minutes": 5, "underlying_symbol": "TEST",
        "expiry": "2026-09-29", "strike": 100.0, "underlying_setup_close": 101.0,
        "underlying_ema9": 100.0, "underlying_body_fraction": .75,
        "underlying_entry_open": 101.2, "option_setup_close": 10.0,
        "option_ema9": 9.5, "option_body_fraction": .8, "option_entry_open": 10.0,
        "ce_symbol": "TESTCE", "pe_symbol": "TESTPE", "ce_entry_open": 10.0,
        "pe_entry_open": 8.0, "ce_lot_size": 65, "pe_lot_size": 65,
        "condition_evidence": {"underlying_precursors": [{"colour": "RED"}, {"colour": "GREEN"}],
                               "selected_option_precursors": [{"colour": "RED"}, {"colour": "RED"}]},
        "indicator_evidence": indicator if indicators else {"underlying": {}, "ce": {}, "pe": {}},
        "outcome_state": "MATURE_EOD",
        "outcome_evidence": {"15m": {"maturity": "MATURE"}, "30m": {"maturity": "MATURE"},
                             "eod": {"maturity": "MATURE", "ce": {"endpoint": endpoint},
                                     "pe": {"endpoint": 7.0}}},
    }


class TradeQualityTests(unittest.TestCase):
    def test_positive_net_label_uses_selected_exact_option(self):
        example = build_trade_example(row(endpoint=12.0))
        self.assertEqual(example["label"], 1)
        self.assertEqual(example["label_name"], "GOOD_TRADE")
        self.assertEqual(example["selected_option"], "TESTCE")
        self.assertGreater(example["pnl"]["gross"], example["pnl"]["net"])
        self.assertEqual(list(example["features"]), FEATURES)

    def test_non_positive_and_missing_are_not_converted_to_wins_or_zero(self):
        losing = build_trade_example(row(endpoint=9.0))
        self.assertEqual(losing["label"], 0)
        missing = row(endpoint=None)
        self.assertIsNone(build_trade_example(missing)["label"])
        incomplete = build_trade_example(row(indicators=False))
        self.assertFalse(incomplete["input_complete"])
        self.assertIsNone(incomplete["features"]["underlying_rsi14"])

    def test_future_outcome_is_never_a_model_feature(self):
        first = build_trade_example(row(endpoint=12.0))
        second = build_trade_example(row(endpoint=20.0))
        self.assertEqual(first["features"], second["features"])
        self.assertNotEqual(first["pnl"], second["pnl"])

    def test_too_few_sessions_does_not_create_shap(self):
        result = fit_trade_quality([build_trade_example(row())])
        self.assertEqual(result["state"], "DATA_INSUFFICIENT")
        self.assertEqual(result["predictions"], [])

    def test_chronological_binary_model_and_shap_reconcile(self):
        examples = []
        for day in range(25):
            for sample in range(8):
                source = deepcopy(row(endpoint=12.0 if (day + sample) % 2 else 8.0))
                source["signal_key"] = f"test-{day}-{sample}"
                source["trade_date"] = str(date(2026, 7, 1) + timedelta(days=day))
                source["underlying_body_fraction"] = .70 + sample * .01
                source["option_body_fraction"] = .71 + day * .001
                examples.append(build_trade_example(source))
        result = fit_trade_quality(examples)
        self.assertEqual(result["state"], "EXPLORATORY")
        self.assertEqual(result["test_rows"], 40)
        self.assertLess(result["shap_max_error"], 1e-4)
        self.assertEqual(len(result["predictions"][0]["explanation"]["contributions"]), len(FEATURES))

    def test_charge_policy_regression(self):
        result = option_pnl(100, 110, 65)
        self.assertEqual(result["gross"], 650.0)
        self.assertGreater(result["charges"], 40.0)
        self.assertEqual(result["net"], round(result["gross"] - result["charges"], 2))


if __name__ == "__main__":
    unittest.main()
