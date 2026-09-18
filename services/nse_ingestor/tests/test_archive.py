from datetime import date
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
from unittest import TestCase
from unittest.mock import Mock, patch

from app.config import load_report_catalog
from app.ingestor import Ingestor

class ArchiveTests(TestCase):
    def test_catalog_extends_current_cash_and_derivatives_without_fake_parsers(self):
        catalog = load_report_catalog(Path("config/report_catalog.yml"))["reports"]
        self.assertEqual(len(catalog), 63)
        self.assertEqual(catalog["bhavcopy_udiff"]["parser"], "bhavcopy_udiff")
        self.assertEqual(catalog["fo_udiff"]["parser"], "archive_only")
        self.assertNotIn("fo_legacy_csv", catalog)

    @patch("app.ingestor.db.start_run_report", return_value=1)
    @patch("app.ingestor.db.finish_run_report")
    @patch("app.ingestor.db.register_file")
    def test_raw_archive_retains_revision_without_claiming_loaded_rows(self, register, finish, start):
        with TemporaryDirectory() as directory:
            settings=SimpleNamespace(staging_dir=Path(directory),request_timeout_seconds=1,nse_http_user_agent="test",keep_downloads=False,staging_retention_days=3)
            ingestor=Ingestor(Mock(), settings, {})
            file=Path(directory)/"report.bin"
            file.write_bytes(b"symbol,oi\nTEST,100")
            result=ingestor.process_file(1,"fo_test","archive_only",date(2026,9,18),file)
            self.assertEqual(result.rows_loaded,0)
            self.assertEqual(register.call_args.kwargs["load_status"],"archived")
            self.assertFalse(register.call_args.kwargs["metadata"]["analytics_ready"])
            archive=Path(register.call_args.kwargs["metadata"]["archive_path"])
            self.assertEqual(archive.read_bytes(),file.read_bytes())
            self.assertEqual(ingestor.cleanup_staging(),0)
            self.assertTrue(archive.exists())
