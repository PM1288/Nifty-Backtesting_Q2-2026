from __future__ import annotations

import csv
import logging
from pathlib import Path
from typing import Any

from .config import Settings
from .db_schema import dataset_to_table_map

LOAD_ORDER = [
    "nse_financial_results",
    "yf_financial_statements",
    "nse_corporate_actions",
    "nse_event_calendar",
    "manifest",
]


def _read_csv_header(csv_path: Path) -> list[str]:
    with csv_path.open("r", encoding="utf-8", newline="") as fp:
        reader = csv.reader(fp)
        return next(reader)


def _connect(settings: Settings):
    import psycopg2  # lazy import
    return psycopg2.connect(settings.postgres_dsn)


def _assert_tables_exist(conn, settings: Settings) -> None:
    dataset_map = dataset_to_table_map(settings.postgres_schema, settings.audit_schema)
    with conn.cursor() as cur:
        missing_tables: list[str] = []
        for table_name in dataset_map.values():
            cur.execute("SELECT to_regclass(%s)", (table_name,))
            exists = cur.fetchone()[0]
            if exists is None:
                missing_tables.append(table_name)

    if missing_tables:
        missing_list = ", ".join(missing_tables)
        raise RuntimeError(
            "Required disclosures tables are missing: "
            f"{missing_list}. Apply the repo migration db/sql/011_nifty100_disclosures.sql first."
        )


def _truncate_tables(conn, settings: Settings, logger: logging.Logger) -> None:
    dataset_map = dataset_to_table_map(settings.postgres_schema, settings.audit_schema)
    with conn.cursor() as cur:
        for dataset_name in reversed(LOAD_ORDER):
            table_name = dataset_map[dataset_name]
            logger.info("Truncating table %s", table_name)
            cur.execute(f"TRUNCATE TABLE {table_name};")
    conn.commit()


def _copy_csv(conn, csv_path: Path, table_name: str) -> int:
    header = _read_csv_header(csv_path)
    if not header:
        return 0
    columns = ", ".join(header)
    copy_sql = f"COPY {table_name} ({columns}) FROM STDIN WITH CSV HEADER NULL ''"
    with conn.cursor() as cur:
        with csv_path.open("r", encoding="utf-8", newline="") as fp:
            cur.copy_expert(copy_sql, fp)
    conn.commit()
    return _count_rows(conn, table_name)


def _count_rows(conn, table_name: str) -> int:
    with conn.cursor() as cur:
        cur.execute(f"SELECT COUNT(*) FROM {table_name};")
        row_count = cur.fetchone()[0]
    return int(row_count)


def load_combined_csvs_to_postgres(
    settings: Settings,
    combined_dir: Path,
    manifest_path: Path,
    logger: logging.Logger,
) -> list[dict[str, Any]]:
    dataset_map = dataset_to_table_map(settings.postgres_schema, settings.audit_schema)
    conn = _connect(settings)
    try:
        _assert_tables_exist(conn, settings)
        if settings.truncate_tables_on_load:
            _truncate_tables(conn, settings, logger)

        load_results: list[dict[str, Any]] = []
        for dataset_name in LOAD_ORDER:
            table_name = dataset_map[dataset_name]
            csv_path = manifest_path if dataset_name == "manifest" else combined_dir / f"{dataset_name}.csv"
            if not csv_path.exists():
                logger.info("Skipping %s because %s does not exist", dataset_name, csv_path)
                load_results.append(
                    {
                        "dataset_name": dataset_name,
                        "table_name": table_name,
                        "csv_path": str(csv_path),
                        "status": "SKIPPED",
                        "row_count": 0,
                    }
                )
                continue

            logger.info("Loading %s into %s from %s", dataset_name, table_name, csv_path)
            row_count = _copy_csv(conn, csv_path, table_name)
            load_results.append(
                {
                    "dataset_name": dataset_name,
                    "table_name": table_name,
                    "csv_path": str(csv_path),
                    "status": "LOADED",
                    "row_count": row_count,
                }
            )
        return load_results
    finally:
        conn.close()
