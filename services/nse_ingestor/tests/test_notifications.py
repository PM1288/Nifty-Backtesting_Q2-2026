from datetime import date
import unittest

from app.notifications import build_missing_files_event


class NotificationContractTests(unittest.TestCase):
    def test_missing_files_are_batched_into_one_deduplicated_event(self):
        metrics = {
            "expected_files": 17,
            "available_files": 15,
            "missing_count": 2,
            "missing_files": [
                {"report_id": "fo_security_ban", "file_name": "ban.csv"},
                {"report_id": "fo_combined_oi", "file_name": "oi.zip"},
            ],
        }
        key, event = build_missing_files_event(date(2026, 8, 12), date(2026, 8, 11), 99, metrics)
        self.assertEqual(key, "nse-missing-files:2026-08-12:2026-08-11")
        self.assertEqual(event["event_type"], "nse.daily.files.missing.v1")
        self.assertEqual(event["payload"]["missing_count"], 2)
        self.assertEqual(len(event["payload"]["missing_files"]), 2)


if __name__ == "__main__":
    unittest.main()
