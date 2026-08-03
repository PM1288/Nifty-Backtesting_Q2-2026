from __future__ import annotations

import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import pandas as pd

from nse_fii_services.client import DownloadedReport, NSEReportNotFound
from nse_fii_services.history_backfill_service import HistoryBackfillService
from nse_fii_services.live_service import LatestDailyService


class FakeLatestClient:
    def fetch_all_reports(self, trade_date):
        trade_date = trade_date.strftime("%d-%m-%Y")
        if trade_date != "03-04-2026":
            raise NSEReportNotFound(f"not found {trade_date}")
        return {
            "participant_oi": DownloadedReport("participant_oi", trade_date, "https://example.com/oi.csv", "oi.csv", b"Client Type,A\nClient,1\nDII,2\nFII,3\nPro,4\nTOTAL,10\n"),
            "participant_volume": DownloadedReport("participant_volume", trade_date, "https://example.com/vol.csv", "vol.csv", b"Client Type,A\nClient,1\nDII,2\nFII,3\nPro,4\nTOTAL,10\n"),
            "fii_stats": DownloadedReport("fii_stats", trade_date, "https://example.com/fii.xls", "fii.xls", b"xlsbytes"),
        }


class FakeBackfillClient:
    def fetch_report(self, report_key, trade_date):
        trade_date = trade_date.strftime("%d-%m-%Y")
        if trade_date == "04-10-2023" and report_key == "fii_stats":
            raise NSEReportNotFound("missing fii stats")
        suffix = ".xls" if report_key == "fii_stats" else ".csv"
        payload = b"xlsbytes" if suffix == ".xls" else b"Client Type,A\nClient,1\nDII,2\nFII,3\nPro,4\nTOTAL,10\n"
        return DownloadedReport(report_key, trade_date, f"https://example.com/{report_key}{suffix}", f"{report_key}{suffix}", payload)


class ServiceTests(unittest.TestCase):
    @patch("nse_fii_services.live_service.parse_fii_stats_excel")
    def test_latest_service_finds_previous_business_day(self, mock_parse_fii) -> None:
        mock_parse_fii.return_value = pd.DataFrame([["INDEX FUTURES", 1, 2, 3, 4, 5, 6]], columns=[
            "fii_derivatives",
            "buy_contracts",
            "buy_value_in_Cr",
            "sell_contracts",
            "sell_value_in_Cr",
            "open_contracts",
            "open_contracts_value_in_Cr",
        ])
        with tempfile.TemporaryDirectory() as tmp:
            service = LatestDailyService(client=FakeLatestClient(), output_root=tmp)
            result = service.pull_latest(as_of_date="04-04-2026", max_lookback_days=3, save_parsed=True)
            self.assertEqual(result.trade_date, "03-04-2026")
            manifest = json.loads(Path(result.manifest_path).read_text(encoding="utf-8"))
            self.assertEqual(sorted(manifest["reports"].keys()), ["fii_stats", "participant_oi", "participant_volume"])
            self.assertTrue(Path(result.output_dir, "raw", "oi.csv").exists())

    def test_history_backfill_writes_manifest_and_missing(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            service = HistoryBackfillService(client=FakeBackfillClient(), output_root=tmp)
            result = service.backfill(
                start_date="03-10-2023",
                end_date="04-10-2023",
                save_parsed=False,
                continue_on_error=True,
            )
            manifest_df = pd.read_csv(result.manifest_path)
            missing_df = pd.read_csv(result.missing_path)
            self.assertEqual(len(manifest_df), 5)  # 3 for 03-Oct, 2 for 04-Oct
            self.assertEqual(len(missing_df), 1)
            self.assertEqual(missing_df.iloc[0]["report_key"], "fii_stats")


if __name__ == "__main__":
    unittest.main()
