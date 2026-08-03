from __future__ import annotations

import unittest
from datetime import datetime

from nse_fii_services.endpoints import REPORT_SPECS, iter_business_dates, parse_trade_date


class EndpointsTest(unittest.TestCase):
    def test_archive_urls_match_expected_patterns(self) -> None:
        trade_dt = parse_trade_date("03-10-2023")

        self.assertEqual(
            REPORT_SPECS["participant_oi"].archive_urls(trade_dt),
            [
                "https://nsearchives.nseindia.com/content/nsccl/fao_participant_oi_03102023.csv",
                "https://archives.nseindia.com/content/nsccl/fao_participant_oi_03102023.csv",
            ],
        )
        self.assertEqual(
            REPORT_SPECS["participant_volume"].archive_urls(trade_dt),
            [
                "https://nsearchives.nseindia.com/content/nsccl/fao_participant_vol_03102023.csv",
                "https://archives.nseindia.com/content/nsccl/fao_participant_vol_03102023.csv",
            ],
        )
        self.assertEqual(
            REPORT_SPECS["fii_stats"].archive_urls(trade_dt),
            [
                "https://nsearchives.nseindia.com/content/fo/fii_stats_03-Oct-2023.xls",
                "https://archives.nseindia.com/content/fo/fii_stats_03-Oct-2023.xls",
            ],
        )

    def test_reports_api_url_contains_name_and_date(self) -> None:
        trade_dt = parse_trade_date("02-04-2026")
        url = REPORT_SPECS["participant_oi"].reports_api_url(trade_dt)
        self.assertIn("date=02-Apr-2026", url)
        self.assertIn("F%26O%20-%20Participant%20wise%20Open%20Interest%28csv%29", url)
        self.assertIn("mode=single", url)

    def test_iter_business_dates_skips_weekends(self) -> None:
        start = parse_trade_date("03-04-2026")  # Friday
        end = parse_trade_date("07-04-2026")    # Tuesday
        values = [dt.strftime("%d-%m-%Y") for dt in iter_business_dates(start, end)]
        self.assertEqual(values, ["03-04-2026", "06-04-2026", "07-04-2026"])


if __name__ == "__main__":
    unittest.main()
