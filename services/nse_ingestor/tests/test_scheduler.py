from datetime import time
import unittest

from app.scheduler import parse_clock


class SchedulerTests(unittest.TestCase):
    def test_daily_schedule_is_0755(self):
        self.assertEqual(parse_clock("07:55"), time(7, 55))

    def test_invalid_clock_fails(self):
        with self.assertRaises(ValueError):
            parse_clock("25:00")


if __name__ == "__main__":
    unittest.main()

class SourceSessionScheduleTests(unittest.TestCase):
    def test_holiday_processes_previous_session_without_notifications(self):
        from contextlib import ExitStack
        from datetime import datetime, date
        from types import SimpleNamespace
        from unittest.mock import Mock, patch
        from zoneinfo import ZoneInfo
        from app.scheduler import tick
        conn = Mock()
        conn.execute.return_value.fetchone.return_value = (True,)
        settings = SimpleNamespace(timezone="Asia/Kolkata", schedule_time="07:55", database_url="unused", report_catalog_path="unused")
        with ExitStack() as stack:
            stack.enter_context(patch("app.scheduler.get_settings", return_value=settings))
            stack.enter_context(patch("app.scheduler.db.connect", return_value=conn))
            stack.enter_context(patch("app.scheduler.db.resolve_previous_trading_day", return_value=date(2026, 10, 1)))
            completed = stack.enter_context(patch("app.scheduler.db.has_completed_daily_source", return_value=False))
            claim = stack.enter_context(patch("app.scheduler.db.claim_daily_job", return_value=7))
            stack.enter_context(patch("app.scheduler.load_report_catalog", return_value={}))
            execute = stack.enter_context(patch("app.scheduler.execute_daily"))
            now = datetime(2026, 10, 2, 8, 0, tzinfo=ZoneInfo("Asia/Kolkata"))
            self.assertEqual(tick(now, notify=False), "EXECUTED")
            execute.assert_called_once_with(conn, settings, {}, 7, date(2026, 10, 2), date(2026, 10, 1), notify=False)
            completed.return_value = True
            self.assertEqual(tick(now), "SOURCE_ALREADY_PROCESSED")
            self.assertEqual(claim.call_count, 1)
            self.assertEqual(execute.call_count, 1)
            self.assertEqual(conn.close.call_count, 2)

    def test_suppressed_catchup_does_not_enqueue_notifications(self):
        from unittest.mock import Mock, patch
        from app.cli import execute_daily
        conn = Mock()
        with patch("app.cli.create_ingest_run", return_value=1), patch("app.cli.Ingestor") as ingestor, patch("app.cli.finish_ingest_run"), patch("app.db.finish_daily_job"), patch("app.db.enqueue_notification") as enqueue:
            ingestor.return_value.daily.return_value = {"errors": 0, "missing_count": 2}
            result = execute_daily(conn, Mock(), {}, 1, "2026-10-02", "2026-10-01", notify=False)
            self.assertEqual(result["missing_count"], 2)
            enqueue.assert_not_called()
