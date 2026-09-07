import unittest
from contextlib import contextmanager
from datetime import date
from unittest.mock import patch

from nse_intraday_intelligence.daily_archive import archive_recent_sessions
from nse_intraday_intelligence.retention import cleanup


class ArchiveTests(unittest.TestCase):
    def run_archive(self, present=True, recent=False, count=2):
        calls = []
        class Connection:
            def transaction(self):
                return connection()
            def execute(self, query, params=None):
                calls.append((query, params))
                if 'to_regprocedure' in query:
                    self.result = {'present': present}
                elif 'SELECT 1 FROM' in query:
                    self.result = {'exists': 1} if recent else None
                else:
                    self.result = {'count': count}
                return self
            def fetchone(self):
                return self.result
        @contextmanager
        def connection():
            yield Connection()
        with patch('nse_intraday_intelligence.daily_archive.get_conn', connection):
            result = archive_recent_sessions(date(2026, 9, 8), days=3)
        return result, calls

    def test_catches_multiple_completed_dates(self):
        result, _ = self.run_archive()
        self.assertEqual(result['state'], 'COMPLETED')
        self.assertEqual([x['date'] for x in result['sessions']], ['2026-09-07','2026-09-06','2026-09-05'])

    def test_zero_is_not_coverage_success(self):
        result, _ = self.run_archive(count=0)
        self.assertTrue(all(x['state'] == 'NO_ROWS_CHANGED' for x in result['sessions']))

    def test_resumes_from_recent_checkpoints(self):
        result, calls = self.run_archive(recent=True)
        self.assertTrue(all(x['state'] == 'RECENT_CHECKPOINT' for x in result['sessions']))
        self.assertFalse(any(q.startswith('SELECT public.archive_minute_session') for q, _ in calls))

    def test_missing_migration_blocks(self):
        result, _ = self.run_archive(present=False)
        self.assertEqual(result['state'], 'BLOCKED_ARCHIVE_NOT_INSTALLED')

    def test_budget_is_bounded(self):
        with patch('nse_intraday_intelligence.daily_archive.get_conn') as conn:
            result = archive_recent_sessions(date(2026,9,8), budget_seconds=0)
            self.assertEqual(result['state'], 'INCOMPLETE_TIME_BUDGET')
            conn.assert_not_called()

    def test_incomplete_archive_never_enters_delete_transaction(self):
        with patch('nse_intraday_intelligence.retention.archive_recent_sessions', return_value={'state':'INCOMPLETE_TIME_BUDGET'}), patch('nse_intraday_intelligence.retention.get_conn') as conn:
            self.assertEqual(cleanup()['state'], 'BLOCKED_ARCHIVE_INCOMPLETE')
            conn.assert_not_called()

    def test_archive_error_propagates_without_deleting(self):
        with patch('nse_intraday_intelligence.retention.archive_recent_sessions', side_effect=TimeoutError), patch('nse_intraday_intelligence.retention.get_conn') as conn:
            with self.assertRaises(TimeoutError):
                cleanup()
            conn.assert_not_called()
