from pathlib import Path

import pandas as pd

from nifty100_pipeline.config import Settings
from nifty100_pipeline.pipeline import run_pipeline


def test_pipeline_emits_only_requested_datasets(monkeypatch, tmp_path: Path) -> None:
    universe_df = pd.DataFrame(
        {
            "run_id": ["run1", "run1"],
            "fetched_at": ["2026-04-03T00:00:00+00:00", "2026-04-03T00:00:00+00:00"],
            "index_category": ["BroadMarketIndices", "BroadMarketIndices"],
            "index_name": ["Nifty 100", "Nifty 100"],
            "company_name": ["Reliance Industries Ltd.", "Infosys Ltd."],
            "industry": ["Oil", "IT"],
            "symbol": ["RELIANCE", "INFY"],
            "series": ["EQ", "EQ"],
            "isin_code": ["INE002A01018", "INE009A01021"],
            "yahoo_symbol": ["RELIANCE.NS", "INFY.NS"],
            "source": ["test", "test"],
        }
    )
    yf_df = pd.DataFrame(
        {
            "run_id": ["run1"],
            "fetched_at": ["2026-04-03T00:00:00+00:00"],
            "symbol": ["RELIANCE"],
            "statement_name": ["income_statement"],
            "period_type": ["annual"],
            "period_end": ["2025-03-31"],
            "metric_name": ["total_revenue"],
            "metric_value": ["1000"],
            "metric_value_num": [1000.0],
            "source": ["test"],
        }
    )
    nse_fin_df = pd.DataFrame(
        {
            "run_id": ["run1"],
            "fetched_at": ["2026-04-03T00:00:00+00:00"],
            "symbol": ["RELIANCE"],
            "company_name": ["Reliance Industries Ltd."],
            "scrip_code": ["500325"],
            "financial_statement_period": ["Quarterly"],
            "reporting_quarter": ["Q4"],
            "period_start_date": ["2025-01-01"],
            "period_end_date": ["2025-03-31"],
            "board_meeting_date": ["2025-04-18"],
            "audited_status": ["Audited"],
            "report_nature": ["Standalone"],
            "presentation_currency": ["INR"],
            "metric_name": ["revenuefromoperations"],
            "metric_value": ["1000"],
            "metric_value_num": [1000.0],
            "source": ["test"],
        }
    )
    ca_df = pd.DataFrame(
        {
            "run_id": ["run1"],
            "fetched_at": ["2026-04-03T00:00:00+00:00"],
            "symbol": ["RELIANCE"],
            "company_name": ["Reliance Industries Ltd."],
            "series": ["EQ"],
            "purpose": ["Dividend"],
            "face_value": [10.0],
            "ex_date": ["2025-08-15"],
            "record_date": ["2025-08-16"],
            "book_closure_start_date": [""],
            "book_closure_end_date": [""],
            "source": ["test"],
            "raw_json": ["{}"],
        }
    )
    event_df = pd.DataFrame(
        {
            "run_id": ["run1"],
            "fetched_at": ["2026-04-03T00:00:00+00:00"],
            "symbol": ["RELIANCE"],
            "company_name": ["Reliance Industries Ltd."],
            "purpose": ["Board Meeting"],
            "details": ["Quarterly Results"],
            "event_date": ["2025-04-18"],
            "attachment": [""],
            "broadcast_datetime": ["2025-04-18T18:30:00+00:00"],
            "source": ["test"],
            "raw_json": ["{}"],
        }
    )

    monkeypatch.setattr("nifty100_pipeline.pipeline.fetch_nifty100_universe", lambda settings, logger: (universe_df, []))
    monkeypatch.setattr("nifty100_pipeline.pipeline.fetch_yf_financial_statements_for_symbol", lambda row, settings, logger: (yf_df.assign(symbol=row["symbol"]), []))
    monkeypatch.setattr("nifty100_pipeline.pipeline.fetch_nse_financial_results", lambda symbols, settings, logger: (nse_fin_df, []))
    monkeypatch.setattr("nifty100_pipeline.pipeline.fetch_nse_corporate_actions", lambda symbols, settings, logger: (ca_df, []))
    monkeypatch.setattr("nifty100_pipeline.pipeline.fetch_nse_event_calendar", lambda symbols, settings, logger: (event_df, []))

    settings = Settings(project_root=tmp_path, output_dir=Path("data"), symbols=["RELIANCE"])
    result = run_pipeline(settings, load_postgres=False)

    combined_files = sorted(path.name for path in result.combined_dir.glob("*.csv"))
    assert combined_files == [
        "nse_corporate_actions.csv",
        "nse_event_calendar.csv",
        "nse_financial_results.csv",
        "yf_financial_statements.csv",
    ]

    manifest_df = pd.read_csv(result.manifest_path)
    assert set(manifest_df["dataset_name"]) == {
        "nse_corporate_actions",
        "nse_event_calendar",
        "nse_financial_results",
        "yf_financial_statements",
    }


def test_pipeline_requires_full_nifty100_universe_for_default_runs(monkeypatch, tmp_path: Path) -> None:
    universe_df = pd.DataFrame(
        {
            "run_id": ["run1", "run1"],
            "fetched_at": ["2026-04-03T00:00:00+00:00", "2026-04-03T00:00:00+00:00"],
            "index_category": ["BroadMarketIndices", "BroadMarketIndices"],
            "index_name": ["Nifty 100", "Nifty 100"],
            "company_name": ["Reliance Industries Ltd.", "Infosys Ltd."],
            "industry": ["Oil", "IT"],
            "symbol": ["RELIANCE", "INFY"],
            "series": ["EQ", "EQ"],
            "isin_code": ["INE002A01018", "INE009A01021"],
            "yahoo_symbol": ["RELIANCE.NS", "INFY.NS"],
            "source": ["test", "test"],
        }
    )

    monkeypatch.setattr("nifty100_pipeline.pipeline.fetch_nifty100_universe", lambda settings, logger: (universe_df, []))
    monkeypatch.setattr(
        "nifty100_pipeline.pipeline.fetch_yf_financial_statements_for_symbol",
        lambda row, settings, logger: (pd.DataFrame(), []),
    )
    monkeypatch.setattr("nifty100_pipeline.pipeline.fetch_nse_financial_results", lambda symbols, settings, logger: (pd.DataFrame(), []))
    monkeypatch.setattr("nifty100_pipeline.pipeline.fetch_nse_corporate_actions", lambda symbols, settings, logger: (pd.DataFrame(), []))
    monkeypatch.setattr("nifty100_pipeline.pipeline.fetch_nse_event_calendar", lambda symbols, settings, logger: (pd.DataFrame(), []))

    settings = Settings(project_root=tmp_path, output_dir=Path("data"))

    try:
        run_pipeline(settings, load_postgres=False)
        raise AssertionError("Expected the pipeline to fail when the default universe is incomplete")
    except RuntimeError as exc:
        assert "Expected a full Nifty 100 universe" in str(exc)
