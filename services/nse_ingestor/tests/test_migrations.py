from pathlib import Path
import unittest


class MigrationContractTests(unittest.TestCase):
    def test_daily_notification_migration_is_additive(self):
        sql = (
            Path(__file__).resolve().parents[1]
            / "sql"
            / "004_daily_scheduler_notifications.sql"
        ).read_text()
        self.assertIn("CREATE TABLE IF NOT EXISTS nse.daily_job_run", sql)
        self.assertIn("CREATE TABLE IF NOT EXISTS nse.notification_outbox", sql)
        self.assertNotIn("DROP TABLE", sql.upper())
        self.assertNotIn("TRUNCATE", sql.upper())


if __name__ == "__main__":
    unittest.main()
