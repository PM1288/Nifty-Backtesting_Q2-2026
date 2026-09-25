from datetime import datetime, timezone
import unittest

from nse_intraday_intelligence.home_mw5_alerts import render_home_mw5_whatsapp


class HomeMw5AlertTests(unittest.TestCase):
    def test_message_contains_gate_values_timestamp_and_research_disclaimer(self):
        event = {
            "symbol": "TEST",
            "direction": "BULL",
            "route": "M-2",
            "snapshot_time": datetime(2026, 9, 25, 5, 54, 30, tzinfo=timezone.utc),
            "five_minute_bar_started_at": datetime(2026, 9, 25, 5, 50, tzinfo=timezone.utc),
            "payload": {
                "currentValue": 110,
                "gates": [
                    {"id": "M-1", "label": "Month open > previous close", "left": 100, "operator": ">", "right": 95, "passed": True},
                    {"id": "M-2", "label": "Month open > two-month close", "left": 100, "operator": ">", "right": 90, "passed": True},
                    {"id": "5m", "label": "Current 5m open > previous 5m open", "left": 111, "operator": ">", "right": 110, "passed": True},
                ],
            },
        }

        message = render_home_mw5_whatsapp(event)
        self.assertIn("HOME MWHD BULL · TEST · 5m qualified", message)
        self.assertIn("Route: M-2", message)
        self.assertIn("M-1 · Month open > previous close: 100.00 > 95.00", message)
        self.assertIn("5m · Current 5m open > previous 5m open: 111.00 > 110.00", message)
        self.assertIn("not an order, trade or execution", message)
