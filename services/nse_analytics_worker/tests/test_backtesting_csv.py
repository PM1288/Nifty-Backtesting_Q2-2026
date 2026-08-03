from __future__ import annotations

import csv
from decimal import Decimal
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from app.backtesting_csv import _write_rows, flatten_summary_row, safe_component


class BacktestingCsvTest(unittest.TestCase):
    def test_strategy_folder_component_is_safe_and_stable(self) -> None:
        self.assertEqual(safe_component(" RSI / rebound v1 "), "RSI_rebound_v1")
        with self.assertRaises(ValueError):
            safe_component("../../")

    def test_summary_json_is_flattened_for_column_processing(self) -> None:
        row = flatten_summary_row(
            {
                "strategy_id": "fast_rebound",
                "summary_json": {"currentValue": Decimal("1576669.25"), "totalReturnPct": -1.45},
                "metadata_json": {"scenarioLabel": "Nifty 100 / 16L"},
            }
        )
        self.assertEqual(row["strategy_id"], "fast_rebound")
        self.assertEqual(row["current_value"], Decimal("1576669.25"))
        self.assertEqual(row["total_return_pct"], -1.45)
        self.assertEqual(row["metadata_scenario_label"], "Nifty 100 / 16L")

    def test_csv_has_header_exact_decimals_and_formula_protection(self) -> None:
        with TemporaryDirectory() as temporary:
            output = Path(temporary) / "test.csv"
            count, checksum, size = _write_rows(
                output,
                ["strategy_id", "net_pnl", "comment"],
                [["fast_rebound", Decimal("107727.5134"), "=HYPERLINK(\"bad\")"]],
            )
            with output.open(encoding="utf-8", newline="") as handle:
                rows = list(csv.reader(handle))

        self.assertEqual(count, 1)
        self.assertEqual(len(checksum), 64)
        self.assertGreater(size, 0)
        self.assertEqual(rows[0], ["strategy_id", "net_pnl", "comment"])
        self.assertEqual(rows[1], ["fast_rebound", "107727.5134", "'=HYPERLINK(\"bad\")"])


if __name__ == "__main__":
    unittest.main()
