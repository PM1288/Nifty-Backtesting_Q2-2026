from datetime import date
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import TestCase
from unittest.mock import Mock

from app.downloader import Downloader
from app.calendar import regular_session
from app.db import resolve_previous_trading_day

class DownloadIntegrityTests(TestCase):
    def response(self, content, mime="text/csv"):
        response = Mock(status_code=200, headers={"Content-Type": mime})
        response.__enter__ = Mock(return_value=response)
        response.__exit__ = Mock(return_value=False)
        response.iter_content.return_value = iter([content])
        return response

    def test_invalid_response_does_not_replace_existing_report(self):
        with TemporaryDirectory() as directory:
            loader = Downloader(Path(directory), 1, "test")
            target = Path(directory)/"2026-09-18"/"report.csv"
            target.parent.mkdir()
            target.write_bytes(b"previous,good")
            loader.session.get = Mock(return_value=self.response(b"<html>blocked</html>"))
            self.assertIsNone(loader.download_report("test", date(2026,9,18), {"filename":"report.csv", "url_candidates":["https://example.test/report"]}))
            self.assertEqual(target.read_bytes(), b"previous,good")
            self.assertEqual(list(target.parent.glob("*.part")), [])

    def test_complete_report_replaces_stage(self):
        with TemporaryDirectory() as directory:
            loader = Downloader(Path(directory), 1, "test")
            loader.session.get = Mock(return_value=self.response(b"symbol,close\nTEST,100\n"))
            result = loader.download_report("test", date(2026,9,18), {"filename":"report.csv", "url_candidates":["https://example.test/report"]})
            self.assertEqual(result.path.read_bytes(), b"symbol,close\nTEST,100\n")

    def test_verified_calendar_does_not_skip_missing_producer_dates(self):
        conn = Mock()
        conn.execute.return_value.fetchone.return_value = None
        self.assertEqual(resolve_previous_trading_day(conn,date(2026,9,18)),date(2026,9,17))
        self.assertEqual(resolve_previous_trading_day(conn,date(2026,9,15)),date(2026,9,11))
        self.assertFalse(regular_session(date(2026,9,14)))
        self.assertIsNone(regular_session(date(2026,11,8)))
        self.assertIsNone(regular_session(date(2027,1,4)))
