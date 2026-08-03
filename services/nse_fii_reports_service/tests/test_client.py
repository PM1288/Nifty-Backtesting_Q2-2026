from __future__ import annotations

import unittest

from nse_fii_services.client import NSEFIIReportsClient, NSEReportNotFound


class FakeResponse:
    def __init__(self, status_code: int, content: bytes = b"", text: str = "", headers: dict | None = None):
        self.status_code = status_code
        self.content = content
        self.text = text
        self.headers = headers or {}


class FakeSession:
    def __init__(self, responses: dict[str, FakeResponse]):
        self.responses = responses
        self.headers = {}
        self.called_urls: list[str] = []

    def get(self, url, headers=None, timeout=None):
        self.called_urls.append(url)
        return self.responses.get(url, FakeResponse(404, text="not found", headers={"Content-Type": "text/plain"}))

    def mount(self, *_args, **_kwargs):
        return None


class ClientTests(unittest.TestCase):
    def test_fetch_report_uses_archive_fallback(self) -> None:
        session = FakeSession(
            {
                "https://nsearchives.nseindia.com/content/nsccl/fao_participant_oi_03102023.csv": FakeResponse(404, text="missing"),
                "https://archives.nseindia.com/content/nsccl/fao_participant_oi_03102023.csv": FakeResponse(200, content=b"csvdata", headers={"Content-Type": "text/csv"}),
            }
        )
        client = NSEFIIReportsClient(session=session, enable_reports_api_fallback=False)
        report = client.fetch_report("participant_oi", "03-10-2023")
        self.assertEqual(report.filename, "fao_participant_oi_03102023.csv")
        self.assertEqual(report.source_url, "https://archives.nseindia.com/content/nsccl/fao_participant_oi_03102023.csv")
        self.assertEqual(report.content, b"csvdata")

    def test_fetch_report_raises_when_missing(self) -> None:
        session = FakeSession({})
        client = NSEFIIReportsClient(session=session, enable_reports_api_fallback=False)
        with self.assertRaises(NSEReportNotFound):
            client.fetch_report("participant_volume", "03-10-2023")


if __name__ == "__main__":
    unittest.main()
