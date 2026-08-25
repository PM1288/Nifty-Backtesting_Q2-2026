from __future__ import annotations

import unittest
from datetime import datetime
from zoneinfo import ZoneInfo

from models import synthetic_report_id
from scheduler import next_weekday_run
from webhook import build_message


class IncrementalTests(unittest.TestCase):
    def test_synthetic_id_is_stable(self):
        record = {
            "report_date": "2026-08-24",
            "stock_name": "Example",
            "broker_name": "Broker",
            "report_title": "Initiating coverage",
        }
        self.assertEqual(synthetic_report_id(record), synthetic_report_id(dict(record)))

    def test_friday_after_schedule_moves_to_monday(self):
        timezone = ZoneInfo("Asia/Kolkata")
        friday = datetime(2026, 8, 28, 8, 0, tzinfo=timezone)
        result = next_weekday_run(friday)
        self.assertEqual(result.weekday(), 0)
        self.assertEqual((result.hour, result.minute), (7, 0))

    def test_webhook_message_contains_only_supplied_new_rows(self):
        rows = [
            {
                "report_id": "new-1",
                "payload": {
                    "report_date": "2026-08-24",
                    "nse_symbol": "RELIANCE",
                    "stock_name": "Reliance Industries",
                    "broker_name": "Example Broker",
                    "recommendation": "Buy",
                    "target_price": 1600,
                    "upside_pct": 12.5,
                },
            }
        ]
        message = build_message(rows)
        self.assertIn("1 NEW RESEARCH REPORT", message)
        self.assertIn("RELIANCE", message)
        self.assertIn("Reliance Industries (RELIANCE)", message)
        self.assertIn("Only newly inserted report IDs", message)


if __name__ == "__main__":
    unittest.main()
