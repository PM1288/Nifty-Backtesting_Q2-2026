from pathlib import Path

from nifty100_pipeline.db_schema import dataset_to_table_map


def test_dataset_to_table_map_respects_custom_schema() -> None:
    mapping = dataset_to_table_map("custom_market", "custom_audit")
    assert mapping["nse_financial_results"] == "custom_market.nse_financial_results"
    assert mapping["manifest"] == "custom_audit.load_manifest"


def test_repo_migration_covers_only_requested_tables_and_indexes() -> None:
    migration_path = Path(__file__).resolve().parents[3] / "db" / "sql" / "011_nifty100_disclosures.sql"
    sql = migration_path.read_text(encoding="utf-8")

    assert "CREATE TABLE IF NOT EXISTS market_data.nse_financial_results" in sql
    assert "CREATE TABLE IF NOT EXISTS market_data.yf_financial_statements" in sql
    assert "CREATE TABLE IF NOT EXISTS market_data.nse_corporate_actions" in sql
    assert "CREATE TABLE IF NOT EXISTS market_data.nse_event_calendar" in sql
    assert "CREATE TABLE IF NOT EXISTS audit.load_manifest" in sql
    assert "idx_nse_financial_results_symbol_period" in sql
    assert "idx_yf_financial_statements_symbol_period" in sql
    assert "idx_nse_corporate_actions_symbol_exdate" in sql
    assert "idx_nse_event_calendar_symbol_eventdate" in sql
