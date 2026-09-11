from __future__ import annotations

from datetime import datetime

import pytest

from nse_fii_services.client import DownloadedReport, NSEReportNotFound
from nse_fii_services.fovolt_service import FovoltDailyService, load_fovolt_result
from nse_fii_services.parsers import FOVOLT_SCHEMA


def report_bytes(day: datetime) -> bytes:
    header = ",".join(name for _key, name in FOVOLT_SCHEMA)
    values = [day.strftime("%d-%b-%y"), "TEST", "100", "99", "0.01", "0.02", "0.02", "0.38", "101", "100", "0.01", "0.02000000", "0.02010001", "0.38", "0.02", "0.38"]
    return (header + "\n" + ",".join(values) + "\n").encode()


class FakeClient:
    def fetch_report(self, key: str, day: datetime) -> DownloadedReport:
        if day.day == 2:
            raise NSEReportNotFound("synthetic missing report")
        return DownloadedReport(key, day.strftime("%d-%m-%Y"), "https://example.invalid/fovolt.csv", f"FOVOLT_{day:%d%m%Y}.csv", report_bytes(day))


def test_bounded_backfill_preserves_each_report_and_missing_date(tmp_path):
    result = FovoltDailyService(FakeClient(), tmp_path).pull_range(
        start_date="01-09-2026", end_date="03-09-2026", continue_on_error=True,
    )
    assert [item.report.trade_date for item in result.reports] == ["01-09-2026", "03-09-2026"]
    assert result.missing[0]["report_date"] == "2026-09-02"
    assert all(item.raw_path.exists() and item.manifest_path.exists() for item in result.reports)
    with pytest.raises(ValueError, match="limited"):
        FovoltDailyService(FakeClient(), tmp_path).pull_range(
            start_date="01-01-2025", end_date="02-01-2026",
        )


def test_loader_fails_calendar_gap_closed_instead_of_jumping_session(tmp_path):
    pulled = FovoltDailyService(FakeClient(), tmp_path).pull_date("01-09-2026")

    class Cursor:
        def __enter__(self): return self
        def __exit__(self, *_args): return False
        def execute(self, query, _params=None):
            self.result = ("market_data.nse_fovolt_report_row",) if "to_regclass" in query else ((None, "CALENDAR_COVERAGE_GAP") if "WITH candidate" in query else None)
        def fetchone(self): return self.result

    class Connection:
        def cursor(self): return Cursor()
        def commit(self): pass

    loaded = load_fovolt_result(Connection(), pulled)
    assert loaded["analysis_session"] is None
    assert loaded["calendar_state"] == "CALENDAR_COVERAGE_GAP"
