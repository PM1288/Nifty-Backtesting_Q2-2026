from __future__ import annotations

import json

from nse_fii_services.config import Settings
from nse_fii_services.postgres_loader import load_run_to_postgres


class FakeConnection:
    def __init__(self):
        self.committed = False
        self.closed = False

    def cursor(self):
        raise AssertionError("cursor() should not be used in this test")

    def commit(self):
        self.committed = True

    def close(self):
        self.closed = True


def test_load_run_to_postgres_builds_expected_dataset_counts(tmp_path, monkeypatch):
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

    run_dir = settings.history_backfill_root / "2026-03-01__2026-03-31" / "2026-03-02" / "parsed"
    run_dir.mkdir(parents=True, exist_ok=True)
    oi_path = run_dir / "fao_participant_oi_02032026.csv.parsed.csv"
    vol_path = run_dir / "fao_participant_vol_02032026.csv.parsed.csv"
    fii_path = run_dir / "fii_stats_02-Mar-2026.xls.parsed.csv"

    oi_path.write_text(
        "Client Type,Future Index Long,Future Index Short,Total Long Contracts,Total Short Contracts\n"
        "FII,10,20,30,40\n",
        encoding="utf-8",
    )
    vol_path.write_text(
        "Client Type,Future Index Long,Future Index Short,Total Long Contracts,Total Short Contracts\n"
        "FII,100,200,300,400\n",
        encoding="utf-8",
    )
    fii_path.write_text(
        "fii_derivatives,buy_contracts,buy_value_in_Cr,sell_contracts,sell_value_in_Cr,open_contracts,open_contracts_value_in_Cr\n"
        "INDEX FUTURES,1,2.5,3,4.5,5,6.5\n",
        encoding="utf-8",
    )

    manifest_path = settings.history_backfill_root / "2026-03-01__2026-03-31" / "manifest.csv"
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(
        "trade_date,report_key,parsed,parsed_path\n"
        f"02-03-2026,participant_oi,True,{oi_path}\n"
        f"02-03-2026,participant_volume,True,{vol_path}\n"
        f"02-03-2026,fii_stats,True,{fii_path}\n",
        encoding="utf-8",
    )

    copied_rows: dict[str, int] = {}
    fake_conn = FakeConnection()

    monkeypatch.setattr("nse_fii_services.postgres_loader._connect", lambda _settings: fake_conn)
    monkeypatch.setattr("nse_fii_services.postgres_loader._assert_tables_exist", lambda *_args, **_kwargs: None)
    monkeypatch.setattr("nse_fii_services.postgres_loader._delete_existing_run_rows", lambda *_args, **_kwargs: None)
    monkeypatch.setattr("nse_fii_services.postgres_loader._delete_existing_manifest_rows", lambda *_args, **_kwargs: None)

    def fake_copy_dataframe(_conn, df, table_name):
        copied_rows[table_name] = len(df.index)
        return len(df.index)

    monkeypatch.setattr("nse_fii_services.postgres_loader._copy_dataframe", fake_copy_dataframe)

    payload = load_run_to_postgres(
        settings,
        kind="backfill",
        run_id="2026-03-01__2026-03-31",
    )

    assert payload["run_id"] == "2026-03-01__2026-03-31"
    assert copied_rows["market_data.nse_fii_participant_open_interest"] == 1
    assert copied_rows["market_data.nse_fii_participant_volume"] == 1
    assert copied_rows["market_data.nse_fii_derivatives_stats"] == 1
    assert copied_rows["audit.load_manifest"] == 3
    assert fake_conn.committed is True
    assert fake_conn.closed is True
