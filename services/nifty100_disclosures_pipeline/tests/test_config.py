from __future__ import annotations

from pathlib import Path

from nifty100_pipeline.config import Settings


def test_from_env_reads_dates_symbols_and_output_dir(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setenv("OUTPUT_DIR", "runtime/data")
    monkeypatch.setenv("SYMBOLS", "reliance, infy, RELIANCE")
    monkeypatch.setenv("NSE_FIN_START_DATE", "2024-01-01")
    monkeypatch.setenv("NSE_FIN_END_DATE", "2024-03-31")
    monkeypatch.setenv("CORP_ACTIONS_START_DATE", "2024-02-01")
    monkeypatch.setenv("CORP_ACTIONS_END_DATE", "2024-04-30")
    monkeypatch.setenv("EVENT_START_DATE", "2024-01-15")
    monkeypatch.setenv("EVENT_END_DATE", "2024-05-15")
    monkeypatch.setenv("REQUEST_RETRIES", "5")
    monkeypatch.setenv("REQUEST_SLEEP_SECONDS", "0.75")
    monkeypatch.setenv("POSTGRES_HOST", "db")
    monkeypatch.setenv("POSTGRES_PORT", "5433")
    monkeypatch.setenv("POSTGRES_DB", "stocks")
    monkeypatch.setenv("POSTGRES_USER", "loader")
    monkeypatch.setenv("POSTGRES_PASSWORD", "secret")
    monkeypatch.setenv("POSTGRES_SCHEMA", "market_data")
    monkeypatch.setenv("POSTGRES_AUDIT_SCHEMA", "audit")
    monkeypatch.setenv("TRUNCATE_TABLES_ON_LOAD", "false")

    settings = Settings.from_env(project_root=tmp_path, env_path=tmp_path / ".env.missing")

    assert settings.output_dir == Path("runtime/data")
    assert settings.absolute_output_dir == (tmp_path / "runtime/data").resolve()
    assert settings.symbols == ["RELIANCE", "INFY"]
    assert settings.request_retries == 5
    assert settings.request_sleep_seconds == 0.75
    assert settings.postgres_host == "db"
    assert settings.postgres_port == 5433
    assert settings.postgres_db == "stocks"
    assert settings.postgres_user == "loader"
    assert settings.postgres_password == "secret"
    assert settings.postgres_schema == "market_data"
    assert settings.audit_schema == "audit"
    assert settings.truncate_tables_on_load is False


def test_ensure_runtime_dirs_creates_service_and_run_layout(tmp_path: Path) -> None:
    settings = Settings(project_root=tmp_path, output_dir=Path("data"))

    settings.ensure_runtime_dirs()

    assert settings.absolute_output_dir.exists()
    assert settings.service_logs_dir.exists()
    assert settings.run_root.exists()
    assert settings.raw_dir.exists()
    assert settings.combined_dir.exists()
    assert settings.audit_dir.exists()
    assert settings.logs_dir.exists()
