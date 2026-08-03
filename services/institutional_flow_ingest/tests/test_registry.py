from __future__ import annotations

from datetime import UTC, date, datetime
from pathlib import Path

import pandas as pd
from sqlalchemy import text

from market_ingest.registry import Registry, RegistryPaths


SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS ingestion_registry (
    dataset_name VARCHAR, market_date DATE, source_system VARCHAR, source_url VARCHAR, local_raw_path VARCHAR,
    checksum_sha256 VARCHAR, content_length BIGINT, http_status INTEGER, discovered_at TIMESTAMP, downloaded_at TIMESTAMP,
    normalized_at TIMESTAMP, row_count_raw BIGINT, row_count_normalized BIGINT, status VARCHAR, error_class VARCHAR,
    error_message VARCHAR, retry_count INTEGER, run_id VARCHAR
);
CREATE TABLE IF NOT EXISTS dataset_completeness (
    dataset_name VARCHAR, expected_date DATE, is_expected_trading_day BOOLEAN, is_present BOOLEAN,
    reason_missing VARCHAR, last_checked_at TIMESTAMP
);
CREATE TABLE IF NOT EXISTS source_capabilities (
    dataset_name VARCHAR, source_system VARCHAR, public_endpoint_verified BOOLEAN, requires_browser_fallback BOOLEAN,
    is_paid_only BOOLEAN, notes VARCHAR, last_verified_at TIMESTAMP
);
CREATE TABLE IF NOT EXISTS raw_file_versions (
    dataset_name VARCHAR, market_date DATE, file_name VARCHAR, checksum_sha256 VARCHAR, local_raw_path VARCHAR, created_at TIMESTAMP
);
CREATE TABLE IF NOT EXISTS normalized_nse_fii_dii (
    market_date DATE, participant_type VARCHAR, buy_value DOUBLE, sell_value DOUBLE, net_value DOUBLE, exchange_scope VARCHAR, source_dataset VARCHAR
);
CREATE TABLE IF NOT EXISTS normalized_nse_cm_bhavcopy (
    market_date DATE, symbol VARCHAR, series VARCHAR, open DOUBLE, high DOUBLE, low DOUBLE, close DOUBLE, last DOUBLE,
    prev_close DOUBLE, volume BIGINT, delivery_qty BIGINT, delivery_pct DOUBLE, turnover DOUBLE, trades BIGINT, isin VARCHAR, source_dataset VARCHAR
);
CREATE TABLE IF NOT EXISTS normalized_nse_bulk_block (
    market_date DATE, deal_date DATE, symbol VARCHAR, buyer_name VARCHAR, seller_name VARCHAR, quantity BIGINT,
    price DOUBLE, value DOUBLE, deal_kind VARCHAR, source_dataset VARCHAR
);
CREATE TABLE IF NOT EXISTS normalized_nse_derivatives_participants (
    market_date DATE, client_type VARCHAR, instrument_type VARCHAR, buy_contracts DOUBLE, sell_contracts DOUBLE,
    open_interest_long DOUBLE, open_interest_short DOUBLE, call_long DOUBLE, call_short DOUBLE, put_long DOUBLE, put_short DOUBLE, source_dataset VARCHAR
);
CREATE TABLE IF NOT EXISTS normalized_nse_shareholding (
    filing_date DATE, as_on_date DATE, symbol VARCHAR, company_name VARCHAR, category VARCHAR,
    subcategory VARCHAR, shares DOUBLE, percent_hold DOUBLE, source_dataset VARCHAR
);
CREATE TABLE IF NOT EXISTS normalized_bse_index_history (
    market_date DATE, index_name VARCHAR, open DOUBLE, high DOUBLE, low DOUBLE, close DOUBLE, volume DOUBLE, turnover DOUBLE, source_dataset VARCHAR
);
"""


def _registry(tmp_path: Path) -> Registry:
    schema = tmp_path / "schema.sql"
    analytics = tmp_path / "analytics.sql"
    schema.write_text(SCHEMA_SQL, encoding="utf-8")
    analytics.write_text(
        "DROP VIEW IF EXISTS daily_institutional_flow_summary; CREATE VIEW daily_institutional_flow_summary AS SELECT * FROM normalized_nse_fii_dii;",
        encoding="utf-8",
    )
    registry = Registry(RegistryPaths(f"sqlite:///{tmp_path / 'warehouse.sqlite'}", None, schema, analytics))
    registry.initialize()
    return registry


def test_registry_initializes_tables(tmp_path: Path) -> None:
    registry = _registry(tmp_path)
    registry.write_capability(
        {
            "dataset_name": "demo",
            "source_system": "NSE",
            "public_endpoint_verified": True,
            "requires_browser_fallback": False,
            "is_paid_only": False,
            "notes": "ok",
            "last_verified_at": datetime.now(UTC),
        }
    )
    with registry.engine.begin() as conn:
        rows = conn.execute(text("SELECT COUNT(*) FROM source_capabilities")).fetchone()
    assert rows and rows[0] == 1
    registry.close()


def test_store_normalized_frame_replaces_partition(tmp_path: Path) -> None:
    registry = _registry(tmp_path)
    first = pd.DataFrame(
        [{"market_date": date(2026, 3, 31), "participant_type": "FII/FPI", "buy_value": 10.0, "sell_value": 8.0, "net_value": 2.0, "exchange_scope": "nse_only"}]
    )
    second = pd.DataFrame(
        [{"market_date": date(2026, 3, 31), "participant_type": "DII", "buy_value": 5.0, "sell_value": 4.0, "net_value": 1.0, "exchange_scope": "nse_only"}]
    )
    registry.store_normalized_frame("nse_fii_dii_nse_only", first)
    registry.store_normalized_frame("nse_fii_dii_nse_only", second)
    with registry.engine.begin() as conn:
        rows = conn.execute(text("SELECT participant_type FROM normalized_nse_fii_dii")).fetchall()
    assert rows == [("DII",)]
    registry.close()
