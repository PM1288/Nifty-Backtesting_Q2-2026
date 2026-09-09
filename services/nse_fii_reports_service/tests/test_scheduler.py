from __future__ import annotations

import sys
from datetime import datetime
from pathlib import Path
from types import SimpleNamespace
from zoneinfo import ZoneInfo

import pytest

from nse_fii_services.config import Settings
from nse_fii_services.scheduler import AutoPullScheduler, next_scheduled_run, parse_time_of_day


IST = ZoneInfo("Asia/Kolkata")


def settings(tmp_path: Path) -> Settings:
    return Settings(
        output_dir=tmp_path,
        request_timeout_seconds=30,
        enable_reports_api_fallback=True,
        auto_pull_enabled=True,
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


def test_schedule_is_six_am_india_time():
    assert parse_time_of_day("06:00") == (6, 0)
    before = datetime(2026, 9, 9, 5, 59, tzinfo=IST)
    after = datetime(2026, 9, 9, 6, 1, tzinfo=IST)
    assert next_scheduled_run(before, 6, 0).isoformat() == "2026-09-09T06:00:00+05:30"
    assert next_scheduled_run(after, 6, 0).isoformat() == "2026-09-10T06:00:00+05:30"


@pytest.mark.parametrize("value", ["6", "24:00", "06:60", "wrong"])
def test_invalid_schedule_is_rejected(value: str):
    with pytest.raises(ValueError):
        parse_time_of_day(value)


def test_refresh_pulls_and_loads_expected_completed_session(tmp_path, monkeypatch):
    calls: list[tuple[str, object]] = []

    class Cursor:
        def __init__(self):
            self.result = None

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def execute(self, query, _params):
            if "pg_try_advisory_lock" in query:
                self.result = (True,)
            elif "max(trade_date)" in query:
                self.result = ("2026-09-08",)
            else:
                self.result = (True,)

        def fetchone(self):
            return self.result

    class Connection:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def cursor(self):
            return Cursor()

    monkeypatch.setitem(sys.modules, "psycopg2", SimpleNamespace(connect=lambda _dsn: Connection()))
    monkeypatch.setattr(
        "nse_fii_services.scheduler.run_latest_pull",
        lambda *_args, **_kwargs: {"trade_date": "08-09-2026"},
    )
    monkeypatch.setattr(
        "nse_fii_services.scheduler.load_run",
        lambda *_args, **kwargs: calls.append(("load", kwargs["run_id"])),
    )

    scheduler = AutoPullScheduler(settings(tmp_path))
    assert scheduler._refresh_once() is True
    assert calls == [("load", "2026-09-08")]
    assert scheduler.last_trade_date == "08-09-2026"
    assert scheduler.last_error is None


def test_refresh_retries_when_latest_report_is_stale(tmp_path, monkeypatch):
    class Cursor:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def execute(self, query, _params):
            self.result = (True,) if "pg_try_advisory_lock" in query else (("2026-09-08",) if "max(trade_date)" in query else (True,))

        def fetchone(self):
            return self.result

    class Connection:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def cursor(self):
            return Cursor()

    monkeypatch.setitem(sys.modules, "psycopg2", SimpleNamespace(connect=lambda _dsn: Connection()))
    monkeypatch.setattr(
        "nse_fii_services.scheduler.run_latest_pull",
        lambda *_args, **_kwargs: {"trade_date": "07-09-2026"},
    )

    scheduler = AutoPullScheduler(settings(tmp_path))
    assert scheduler._refresh_once() is False
    assert scheduler.last_error == "RuntimeError"

