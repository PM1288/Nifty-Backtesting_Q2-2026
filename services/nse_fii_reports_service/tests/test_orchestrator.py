from __future__ import annotations

import json
from pathlib import Path

from nse_fii_services.config import Settings
from nse_fii_services.orchestrator import get_run_detail, list_runs, load_run, read_latest_metadata, run_backfill, run_latest_pull


class FakeLatestService:
    def __init__(self, *args, **kwargs):
        pass

    def pull_latest(self, **kwargs):
        from nse_fii_services.live_service import LivePullResult

        output_dir = Path(kwargs.pop("output_root", ""))  # unused
        return LivePullResult(
            trade_date="03-04-2026",
            output_dir=str(output_dir or "tmp/latest_daily/2026-04-03"),
            manifest_path=str((output_dir or Path("tmp/latest_daily/2026-04-03")) / "manifest.json"),
            reports_found=("fii_stats", "participant_oi", "participant_volume"),
        )


def test_read_latest_metadata_empty(tmp_path):
    settings = Settings(
        output_dir=tmp_path,
        request_timeout_seconds=30,
        enable_reports_api_fallback=True,
        auto_pull_enabled=False,
        auto_pull_interval_minutes=60,
        auto_pull_max_lookback_days=10,
        auto_pull_save_parsed=True,
        log_level="INFO",
        postgres_host="postgres",
        postgres_port=5432,
        postgres_db="marketdata",
        postgres_user="trader",
        postgres_password="secret",
        postgres_schema="market_data",
        postgres_audit_schema="audit",
        truncate_tables_on_load=False,
    )
    payload = read_latest_metadata(settings)
    assert payload["latest_run"] is None


def test_run_latest_pull_writes_metadata(tmp_path, monkeypatch):
    settings = Settings(
        output_dir=tmp_path,
        request_timeout_seconds=30,
        enable_reports_api_fallback=True,
        auto_pull_enabled=False,
        auto_pull_interval_minutes=60,
        auto_pull_max_lookback_days=10,
        auto_pull_save_parsed=True,
        log_level="INFO",
        postgres_host="postgres",
        postgres_port=5432,
        postgres_db="marketdata",
        postgres_user="trader",
        postgres_password="secret",
        postgres_schema="market_data",
        postgres_audit_schema="audit",
        truncate_tables_on_load=False,
    )

    from nse_fii_services import orchestrator

    class StubLatestDailyService:
        def __init__(self, client=None, output_root=None):
            self.output_root = output_root

        def pull_latest(self, **kwargs):
            from nse_fii_services.live_service import LivePullResult

            out_dir = self.output_root / "2026-04-03"
            out_dir.mkdir(parents=True, exist_ok=True)
            manifest_path = out_dir / "manifest.json"
            manifest_path.write_text("{}", encoding="utf-8")
            return LivePullResult(
                trade_date="03-04-2026",
                output_dir=str(out_dir),
                manifest_path=str(manifest_path),
                reports_found=("fii_stats", "participant_oi", "participant_volume"),
            )

    monkeypatch.setattr(orchestrator, "LatestDailyService", StubLatestDailyService)
    payload = run_latest_pull(settings, max_lookback_days=3, save_parsed=False)
    assert payload["operation"] == "pull-latest"
    saved = json.loads(settings.latest_run_metadata_path.read_text(encoding="utf-8"))
    assert saved["trade_date"] == "03-04-2026"


def test_run_backfill_writes_metadata(tmp_path, monkeypatch):
    settings = Settings(
        output_dir=tmp_path,
        request_timeout_seconds=30,
        enable_reports_api_fallback=True,
        auto_pull_enabled=False,
        auto_pull_interval_minutes=60,
        auto_pull_max_lookback_days=10,
        auto_pull_save_parsed=True,
        log_level="INFO",
        postgres_host="postgres",
        postgres_port=5432,
        postgres_db="marketdata",
        postgres_user="trader",
        postgres_password="secret",
        postgres_schema="market_data",
        postgres_audit_schema="audit",
        truncate_tables_on_load=False,
    )

    from nse_fii_services import orchestrator

    class StubHistoryBackfillService:
        def __init__(self, client=None, output_root=None):
            self.output_root = output_root

        def backfill(self, **kwargs):
            from nse_fii_services.history_backfill_service import BackfillResult

            out_dir = self.output_root / "2023-10-02__2023-10-06"
            out_dir.mkdir(parents=True, exist_ok=True)
            manifest_path = out_dir / "manifest.csv"
            summary_path = out_dir / "summary.json"
            missing_path = out_dir / "missing.csv"
            manifest_path.write_text("a,b\n1,2\n", encoding="utf-8")
            summary_path.write_text("{}", encoding="utf-8")
            missing_path.write_text("trade_date,report_key,error\n", encoding="utf-8")
            return BackfillResult(
                start_date="02-10-2023",
                end_date="06-10-2023",
                output_dir=str(out_dir),
                manifest_path=str(manifest_path),
                summary_path=str(summary_path),
                missing_path=str(missing_path),
            )

    monkeypatch.setattr(orchestrator, "HistoryBackfillService", StubHistoryBackfillService)
    payload = run_backfill(settings, start_date="02-10-2023", end_date="06-10-2023")
    assert payload["operation"] == "backfill"
    saved = json.loads(settings.latest_backfill_metadata_path.read_text(encoding="utf-8"))
    assert saved["start_date"] == "02-10-2023"


def test_list_runs_and_get_backfill_detail(tmp_path):
    settings = Settings(
        output_dir=tmp_path,
        request_timeout_seconds=30,
        enable_reports_api_fallback=True,
        auto_pull_enabled=False,
        auto_pull_interval_minutes=60,
        auto_pull_max_lookback_days=10,
        auto_pull_save_parsed=True,
        log_level="INFO",
        postgres_host="postgres",
        postgres_port=5432,
        postgres_db="marketdata",
        postgres_user="trader",
        postgres_password="secret",
        postgres_schema="market_data",
        postgres_audit_schema="audit",
        truncate_tables_on_load=False,
    )

    backfill_dir = settings.history_backfill_root / "2026-03-01__2026-03-31"
    backfill_dir.mkdir(parents=True, exist_ok=True)
    (backfill_dir / "summary.json").write_text(
        json.dumps(
            {
                "generated_at": "2026-04-04T14:27:53Z",
                "start_date": "01-03-2026",
                "end_date": "31-03-2026",
                "dates_touched": 22,
                "reports_downloaded": 57,
                "reports_missing": 9,
            }
        ),
        encoding="utf-8",
    )
    (backfill_dir / "manifest.csv").write_text(
        "trade_date,report_key,row_count\n01-03-2026,fii_stats,7\n",
        encoding="utf-8",
    )
    (backfill_dir / "missing.csv").write_text(
        "trade_date,report_key,error\n02-03-2026,participant_oi,missing\n",
        encoding="utf-8",
    )

    daily_dir = settings.latest_daily_root / "2026-04-02"
    daily_dir.mkdir(parents=True, exist_ok=True)
    (daily_dir / "manifest.json").write_text(
        json.dumps(
            {
                "generated_at": "2026-04-04T14:25:13Z",
                "trade_date": "02-04-2026",
                "reports": {
                    "fii_stats": {
                        "source_url": "https://example.test/fii_stats.xls",
                        "raw_path": "/tmp/raw.xls",
                        "parsed_path": "/tmp/parsed.csv",
                        "bytes": 9216,
                        "parsed": True,
                        "row_count": 7,
                    }
                },
            }
        ),
        encoding="utf-8",
    )

    catalog = list_runs(settings, limit=10)
    assert catalog["backfill_runs"][0]["run_id"] == "2026-03-01__2026-03-31"
    assert catalog["daily_runs"][0]["run_id"] == "2026-04-02"

    backfill_detail = get_run_detail(settings, kind="backfill", run_id="2026-03-01__2026-03-31")
    assert backfill_detail["summary"]["reports_downloaded"] == 57
    assert backfill_detail["manifest_rows"][0]["report_key"] == "fii_stats"
    assert backfill_detail["missing_rows"][0]["error"] == "missing"

    daily_detail = get_run_detail(settings, kind="daily", run_id="2026-04-02")
    assert daily_detail["report_rows"][0]["report_key"] == "fii_stats"


def test_load_run_proxies_to_loader(tmp_path, monkeypatch):
    settings = Settings(
        output_dir=tmp_path,
        request_timeout_seconds=30,
        enable_reports_api_fallback=True,
        auto_pull_enabled=False,
        auto_pull_interval_minutes=60,
        auto_pull_max_lookback_days=10,
        auto_pull_save_parsed=True,
        log_level="INFO",
        postgres_host="postgres",
        postgres_port=5432,
        postgres_db="marketdata",
        postgres_user="trader",
        postgres_password="secret",
        postgres_schema="market_data",
        postgres_audit_schema="audit",
        truncate_tables_on_load=False,
    )

    from nse_fii_services import orchestrator

    monkeypatch.setattr(
        orchestrator,
        "load_run_to_postgres",
        lambda *_args, **_kwargs: {"run_id": "2026-03-01__2026-03-31", "load_results": [{"dataset_name": "participant_volume"}]},
    )
    payload = load_run(settings, kind="backfill", run_id="2026-03-01__2026-03-31")
    assert payload["run_id"] == "2026-03-01__2026-03-31"
