from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any
import re

import pandas as pd
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Connection, Engine


@dataclass(slots=True)
class RegistryPaths:
    database_url: str
    schema_name: str | None
    schema_sql_path: Path
    analytics_sql_path: Path


@dataclass(slots=True)
class NormalizedTable:
    table_name: str
    columns: list[str]
    partition_columns: list[str]


NORMALIZED_TABLES: dict[str, NormalizedTable] = {
    "nse_fii_dii_nse_only": NormalizedTable(
        "normalized_nse_fii_dii",
        ["market_date", "participant_type", "buy_value", "sell_value", "net_value", "exchange_scope", "source_dataset"],
        ["market_date", "source_dataset"],
    ),
    "nse_fii_dii_combined": NormalizedTable(
        "normalized_nse_fii_dii",
        ["market_date", "participant_type", "buy_value", "sell_value", "net_value", "exchange_scope", "source_dataset"],
        ["market_date", "source_dataset"],
    ),
    "nse_cm_bhavcopy": NormalizedTable(
        "normalized_nse_cm_bhavcopy",
        [
            "market_date",
            "symbol",
            "series",
            "open",
            "high",
            "low",
            "close",
            "last",
            "prev_close",
            "volume",
            "delivery_qty",
            "delivery_pct",
            "turnover",
            "trades",
            "isin",
            "source_dataset",
        ],
        ["market_date", "source_dataset"],
    ),
    "nse_bulk_deals": NormalizedTable(
        "normalized_nse_bulk_block",
        ["market_date", "deal_date", "symbol", "buyer_name", "seller_name", "quantity", "price", "value", "deal_kind", "source_dataset"],
        ["market_date", "source_dataset"],
    ),
    "nse_block_deals": NormalizedTable(
        "normalized_nse_bulk_block",
        ["market_date", "deal_date", "symbol", "buyer_name", "seller_name", "quantity", "price", "value", "deal_kind", "source_dataset"],
        ["market_date", "source_dataset"],
    ),
    "nse_short_selling": NormalizedTable(
        "normalized_nse_bulk_block",
        ["market_date", "deal_date", "symbol", "buyer_name", "seller_name", "quantity", "price", "value", "deal_kind", "source_dataset"],
        ["market_date", "source_dataset"],
    ),
    "nse_fo_participant_open_interest": NormalizedTable(
        "normalized_nse_derivatives_participants",
        [
            "market_date",
            "client_type",
            "instrument_type",
            "buy_contracts",
            "sell_contracts",
            "open_interest_long",
            "open_interest_short",
            "call_long",
            "call_short",
            "put_long",
            "put_short",
            "source_dataset",
        ],
        ["market_date", "source_dataset"],
    ),
    "nse_fo_participant_trading_volumes": NormalizedTable(
        "normalized_nse_derivatives_participants",
        [
            "market_date",
            "client_type",
            "instrument_type",
            "buy_contracts",
            "sell_contracts",
            "open_interest_long",
            "open_interest_short",
            "call_long",
            "call_short",
            "put_long",
            "put_short",
            "source_dataset",
        ],
        ["market_date", "source_dataset"],
    ),
    "nse_fii_derivatives_statistics": NormalizedTable(
        "normalized_nse_derivatives_participants",
        [
            "market_date",
            "client_type",
            "instrument_type",
            "buy_contracts",
            "sell_contracts",
            "open_interest_long",
            "open_interest_short",
            "call_long",
            "call_short",
            "put_long",
            "put_short",
            "source_dataset",
        ],
        ["market_date", "source_dataset"],
    ),
    "nse_shareholding_pattern": NormalizedTable(
        "normalized_nse_shareholding",
        ["filing_date", "as_on_date", "symbol", "company_name", "category", "subcategory", "shares", "percent_hold", "source_dataset"],
        ["as_on_date", "source_dataset"],
    ),
    "bse_index_history_sensex": NormalizedTable(
        "normalized_bse_index_history",
        ["market_date", "index_name", "open", "high", "low", "close", "volume", "turnover", "source_dataset"],
        ["market_date", "source_dataset"],
    ),
    "nse_reference_isin_sector_map": NormalizedTable(
        "normalized_reference_isin_sector_map",
        ["as_on_date", "isin", "sector_name", "industry_name", "source_dataset"],
        ["as_on_date", "source_dataset"],
    ),
    "nsdl_daily_trends": NormalizedTable(
        "normalized_nsdl_daily_trends",
        ["market_date", "equity_net", "debt_net", "hybrid_net", "total_net", "source_kind", "source_dataset"],
        ["market_date", "source_dataset"],
    ),
    "nsdl_monthly_history": NormalizedTable(
        "normalized_nsdl_monthly_history",
        [
            "period_start",
            "equity_gross_purchase",
            "equity_gross_sales",
            "equity_net",
            "debt_gross_purchase",
            "debt_gross_sales",
            "debt_net",
            "hybrid_gross_purchase",
            "hybrid_gross_sales",
            "hybrid_net",
            "total_net",
            "source_dataset",
        ],
        ["period_start", "source_dataset"],
    ),
    "nsdl_yearly_history": NormalizedTable(
        "normalized_nsdl_yearly_history",
        [
            "period_start",
            "equity_gross_purchase",
            "equity_gross_sales",
            "equity_net",
            "debt_gross_purchase",
            "debt_gross_sales",
            "debt_net",
            "hybrid_gross_purchase",
            "hybrid_gross_sales",
            "hybrid_net",
            "total_net",
            "source_dataset",
        ],
        ["period_start", "source_dataset"],
    ),
    "nsdl_fortnightly_sector_latest": NormalizedTable(
        "normalized_nsdl_fortnightly_sector",
        [
            "market_date",
            "date_code",
            "sector",
            "equity_auc_inr",
            "debt_auc_inr",
            "hybrid_auc_inr",
            "total_auc_inr",
            "equity_net_inr",
            "debt_net_inr",
            "hybrid_net_inr",
            "total_net_inr",
            "source_dataset",
        ],
        ["market_date", "source_dataset"],
    ),
    "nsdl_fortnightly_sector_history": NormalizedTable(
        "normalized_nsdl_fortnightly_sector",
        [
            "market_date",
            "date_code",
            "sector",
            "equity_auc_inr",
            "debt_auc_inr",
            "hybrid_auc_inr",
            "total_auc_inr",
            "equity_net_inr",
            "debt_net_inr",
            "hybrid_net_inr",
            "total_net_inr",
            "source_dataset",
        ],
        ["market_date", "source_dataset"],
    ),
    "nsdl_tradewise_monthly": NormalizedTable(
        "normalized_nsdl_tradewise_monthly",
        ["period_start", "sector", "buy_cr", "sell_cr", "net_cr", "tx_count", "unmapped_isin_count", "source_dataset"],
        ["period_start", "source_dataset"],
    ),
}


class Registry:
    """PostgreSQL-backed registry, completeness, and analytical warehouse."""

    _POSTGRES_SCHEMA_LOCK_KEY = 901240112345678901

    def __init__(self, paths: RegistryPaths) -> None:
        self.paths = paths
        connect_args: dict[str, Any] = {}
        if paths.database_url.startswith("sqlite"):
            connect_args["check_same_thread"] = False
        self.engine: Engine = create_engine(paths.database_url, future=True, connect_args=connect_args)

    def initialize(self) -> None:
        if self.engine.dialect.name.startswith("postgresql"):
            with self.engine.begin() as conn:
                self._set_search_path(conn)
                conn.execute(text("SELECT pg_advisory_xact_lock(:lock_key)"), {"lock_key": self._POSTGRES_SCHEMA_LOCK_KEY})
                self._execute_script_on_connection(conn, self.paths.schema_sql_path)
                if self.paths.analytics_sql_path.exists():
                    self._execute_script_on_connection(conn, self.paths.analytics_sql_path)
            return
        self._execute_script(self.paths.schema_sql_path)
        self.refresh_analytics_views()

    def refresh_analytics_views(self) -> None:
        if not self.paths.analytics_sql_path.exists():
            return
        if self.engine.dialect.name.startswith("postgresql"):
            with self.engine.begin() as conn:
                self._set_search_path(conn)
                conn.execute(text("SELECT pg_advisory_xact_lock(:lock_key)"), {"lock_key": self._POSTGRES_SCHEMA_LOCK_KEY})
                self._execute_script_on_connection(conn, self.paths.analytics_sql_path)
            return
        self._execute_script(self.paths.analytics_sql_path)

    def close(self) -> None:
        self.engine.dispose()

    def _execute_script(self, path: Path) -> None:
        script = path.read_text(encoding="utf-8")
        with self.engine.begin() as conn:
            self._execute_script_on_connection(conn, path, script)

    def _execute_script_on_connection(self, conn: Connection, path: Path, script: str | None = None) -> None:
        script = script or path.read_text(encoding="utf-8")
        if conn.dialect.name == "sqlite":
            sanitized = re.sub(r"(?im)^\s*CREATE SCHEMA IF NOT EXISTS .+?;\s*", "", script)
            sanitized = re.sub(r"(?im)^\s*SET search_path TO .+?;\s*", "", sanitized)
            driver_conn = conn.connection.driver_connection
            driver_conn.executescript(sanitized)
            return
        self._set_search_path(conn)
        conn.exec_driver_sql(script.replace("%", "%%"))

    def _set_search_path(self, conn: Connection) -> None:
        if conn.dialect.name.startswith("postgresql") and self.paths.schema_name:
            conn.execute(text(f'SET search_path TO "{self.paths.schema_name}", public'))

    def write_registry_event(self, payload: dict[str, Any]) -> None:
        columns = list(payload.keys())
        statement = text(
            f"INSERT INTO ingestion_registry ({', '.join(columns)}) VALUES ({', '.join(f':{column}' for column in columns)})"
        )
        with self.engine.begin() as conn:
            self._set_search_path(conn)
            conn.execute(statement, payload)

    def write_completeness(self, payload: dict[str, Any]) -> None:
        columns = list(payload.keys())
        insert_stmt = text(
            f"INSERT INTO dataset_completeness ({', '.join(columns)}) VALUES ({', '.join(f':{column}' for column in columns)})"
        )
        with self.engine.begin() as conn:
            self._set_search_path(conn)
            conn.execute(
                text("DELETE FROM dataset_completeness WHERE dataset_name = :dataset_name AND expected_date = :expected_date"),
                {"dataset_name": payload["dataset_name"], "expected_date": payload["expected_date"]},
            )
            conn.execute(insert_stmt, payload)

    def write_capability(self, payload: dict[str, Any]) -> None:
        columns = list(payload.keys())
        insert_stmt = text(
            f"INSERT INTO source_capabilities ({', '.join(columns)}) VALUES ({', '.join(f':{column}' for column in columns)})"
        )
        with self.engine.begin() as conn:
            self._set_search_path(conn)
            conn.execute(
                text("DELETE FROM source_capabilities WHERE dataset_name = :dataset_name AND source_system = :source_system"),
                {"dataset_name": payload["dataset_name"], "source_system": payload["source_system"]},
            )
            conn.execute(insert_stmt, payload)

    def raw_version_exists(self, dataset_name: str, market_date: date | None, file_name: str, checksum_sha256: str) -> bool:
        with self.engine.begin() as conn:
            self._set_search_path(conn)
            result = conn.execute(
                text(
                    """
                    SELECT COUNT(*)
                    FROM raw_file_versions
                    WHERE dataset_name = :dataset_name
                      AND ((market_date IS NULL AND :market_date IS NULL) OR market_date = :market_date)
                      AND file_name = :file_name
                      AND checksum_sha256 = :checksum_sha256
                    """
                ),
                {
                    "dataset_name": dataset_name,
                    "market_date": market_date,
                    "file_name": file_name,
                    "checksum_sha256": checksum_sha256,
                },
            ).scalar_one()
        return bool(result)

    def record_raw_version(self, dataset_name: str, market_date: date | None, file_name: str, checksum_sha256: str, local_raw_path: str) -> None:
        with self.engine.begin() as conn:
            self._set_search_path(conn)
            conn.execute(
                text(
                    """
                    INSERT INTO raw_file_versions
                    (dataset_name, market_date, file_name, checksum_sha256, local_raw_path, created_at)
                    VALUES (:dataset_name, :market_date, :file_name, :checksum_sha256, :local_raw_path, :created_at)
                    """
                ),
                {
                    "dataset_name": dataset_name,
                    "market_date": market_date,
                    "file_name": file_name,
                    "checksum_sha256": checksum_sha256,
                    "local_raw_path": local_raw_path,
                    "created_at": datetime.now(UTC),
                },
            )

    def normalized_dates(self, dataset_name: str, start_date: date, end_date: date) -> set[date]:
        partition_column = self._partition_date_column(dataset_name)
        if partition_column is None:
            return set()
        mapping = NORMALIZED_TABLES.get(dataset_name)
        if mapping is None:
            return set()
        with self.engine.begin() as conn:
            self._set_search_path(conn)
            rows = conn.execute(
                text(
                    f"""
                    SELECT DISTINCT {partition_column}
                    FROM {mapping.table_name}
                    WHERE source_dataset = :dataset_name
                      AND {partition_column} BETWEEN :start_date AND :end_date
                    """
                ),
                {"dataset_name": dataset_name, "start_date": start_date, "end_date": end_date},
            ).fetchall()
        return {row[0] for row in rows if row[0] is not None}

    def has_normalized_content(self, dataset_name: str) -> bool:
        mapping = NORMALIZED_TABLES.get(dataset_name)
        if mapping is None:
            return False
        with self.engine.begin() as conn:
            self._set_search_path(conn)
            result = conn.execute(
                text(
                    f"""
                    SELECT COUNT(*)
                    FROM {mapping.table_name}
                    WHERE source_dataset = :dataset_name
                    """
                ),
                {"dataset_name": dataset_name},
            ).scalar_one()
        return bool(result)

    def partition_is_loaded(self, dataset_name: str, market_date: date | None) -> bool:
        if market_date is None:
            return self.has_normalized_content(dataset_name)
        partition_column = self._partition_date_column(dataset_name)
        mapping = NORMALIZED_TABLES.get(dataset_name)
        if partition_column is None or mapping is None:
            return False
        with self.engine.begin() as conn:
            self._set_search_path(conn)
            result = conn.execute(
                text(
                    f"""
                    SELECT COUNT(*)
                    FROM {mapping.table_name}
                    WHERE source_dataset = :dataset_name
                      AND {partition_column} = :market_date
                    """
                ),
                {"dataset_name": dataset_name, "market_date": market_date},
            ).scalar_one()
        return bool(result)

    def completion_is_valid(self, run_marker_path: Path) -> bool:
        if not run_marker_path.exists():
            return False
        with self.engine.begin() as conn:
            self._set_search_path(conn)
            count = conn.execute(
                text(
                    """
                    SELECT COUNT(*)
                    FROM dataset_completeness
                    WHERE is_expected_trading_day = TRUE
                      AND is_present = FALSE
                    """
                )
            ).scalar_one()
        return count == 0

    def store_normalized_frame(self, dataset_name: str, frame: pd.DataFrame) -> None:
        mapping = NORMALIZED_TABLES.get(dataset_name)
        if mapping is None:
            return
        normalized = frame.copy()
        normalized["source_dataset"] = dataset_name
        for column in mapping.columns:
            if column not in normalized.columns:
                normalized[column] = None
        normalized = normalized[mapping.columns]
        with self.engine.begin() as conn:
            self._set_search_path(conn)
            self._delete_existing_partition(conn, mapping, normalized)
            normalized.to_sql(
                mapping.table_name,
                con=conn,
                if_exists="append",
                index=False,
                schema=self.paths.schema_name if conn.dialect.name.startswith("postgresql") else None,
                method="multi",
            )
        self.refresh_analytics_views()

    def fetch_isin_sector_map(self) -> dict[str, str]:
        table_name = "normalized_reference_isin_sector_map"
        with self.engine.begin() as conn:
            self._set_search_path(conn)
            rows = conn.execute(
                text(
                    f"""
                    SELECT isin, sector_name
                    FROM {table_name}
                    WHERE COALESCE(isin, '') <> ''
                    """
                )
            ).fetchall()
        return {str(row[0]): str(row[1]) for row in rows if row[0] and row[1]}

    def _delete_existing_partition(self, conn: Connection, mapping: NormalizedTable, frame: pd.DataFrame) -> None:
        if frame.empty or not mapping.partition_columns:
            return
        partition_values = frame[mapping.partition_columns].drop_duplicates()
        for payload in partition_values.to_dict("records"):
            predicates = " AND ".join(f"{column} IS NOT DISTINCT FROM :{column}" for column in mapping.partition_columns)
            conn.execute(text(f"DELETE FROM {mapping.table_name} WHERE {predicates}"), payload)

    def _partition_date_column(self, dataset_name: str) -> str | None:
        mapping = NORMALIZED_TABLES.get(dataset_name)
        if mapping is None:
            return None
        for column in mapping.partition_columns:
            if column != "source_dataset":
                return column
        return None
