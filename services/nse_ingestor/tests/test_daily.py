from datetime import date
from pathlib import Path
from types import SimpleNamespace
import tempfile
import unittest
from unittest.mock import patch

from app.ingestor import Ingestor, ProcessResult


class DailyIngestTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.settings = SimpleNamespace(
            staging_dir=Path(self.temp.name),
            request_timeout_seconds=1,
            nse_http_user_agent="test",
            keep_downloads=True,
        )
        self.catalog = {
            "reports": {
                "available": {
                    "enabled": True,
                    "parser": "unused",
                    "filename": "available_{ddmmyyyy}.csv",
                    "url_candidates": ["https://example.test/available_{ddmmyyyy}.csv"],
                },
                "missing": {
                    "enabled": True,
                    "parser": "unused",
                    "filename": "missing_{ddmmyyyy}.csv",
                    "url_candidates": ["https://example.test/missing_{ddmmyyyy}.csv"],
                },
                "disabled": {"enabled": False, "parser": "unused", "filename": "disabled.csv"},
            }
        }

    def tearDown(self):
        self.temp.cleanup()

    @patch("app.ingestor.db.record_unavailable_report")
    def test_daily_accounts_for_every_enabled_report(self, record_unavailable):
        ingestor = Ingestor(object(), self.settings, self.catalog)
        result_path = Path(self.temp.name) / "available.csv"
        result_path.write_text("ok")
        ingestor.downloader.download_report = lambda name, day, cfg: (
            SimpleNamespace(path=result_path) if name == "available" else None
        )
        ingestor.process_file = lambda *args: ProcessResult(
            "available", "available.csv", date(2026, 8, 11), 12, "sha", 2
        )

        metrics = ingestor.daily(7, date(2026, 8, 11))

        self.assertEqual(metrics["expected_files"], 2)
        self.assertEqual(metrics["available_files"], 1)
        self.assertEqual(metrics["missing_count"], 1)
        self.assertEqual(metrics["missing_files"][0]["report_id"], "missing")
        record_unavailable.assert_called_once()


if __name__ == "__main__":
    unittest.main()
