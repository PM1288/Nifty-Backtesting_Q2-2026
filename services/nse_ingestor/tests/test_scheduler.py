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
