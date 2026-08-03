from __future__ import annotations

import json
from pathlib import Path
from typing import Iterable, Sequence

import psycopg
from psycopg import sql
from psycopg.types.json import Jsonb


def connect(database_url: str) -> psycopg.Connection:
    return psycopg.connect(database_url)


def run_migrations(conn: psycopg.Connection, sql_dir: Path) -> None:
    for path in sorted(sql_dir.glob("*.sql")):
        with path.open("r", encoding="utf-8") as f:
            conn.execute(f.read())
    conn.commit()


def create_ingest_run(conn: psycopg.Connection, run_mode: str, backfill_start=None, backfill_end=None, notes=None) -> int:
    row = conn.execute(
        '''
        INSERT INTO nse.ingest_runs (run_mode, backfill_start, backfill_end, notes)
        VALUES (%s, %s, %s, %s)
        RETURNING run_id
        ''',
        (run_mode, backfill_start, backfill_end, notes),
    ).fetchone()
    conn.commit()
    return row[0]


def finish_ingest_run(conn: psycopg.Connection, run_id: int, status: str, metrics: dict | None = None) -> None:
    conn.execute(
        '''
        UPDATE nse.ingest_runs
           SET finished_at = NOW(),
               status = %s,
               metrics = COALESCE(%s, '{}'::jsonb)
         WHERE run_id = %s
        ''',
        (status, Jsonb(metrics or {}), run_id),
    )
    conn.commit()


def start_run_report(conn: psycopg.Connection, run_id: int, report_name: str, source_date, file_name: str) -> int:
    row = conn.execute(
        '''
        INSERT INTO nse.ingest_run_reports (run_id, report_name, source_date, file_name, status)
        VALUES (%s, %s, %s, %s, %s)
        RETURNING run_report_id
        ''',
        (run_id, report_name, source_date, file_name, "running"),
    ).fetchone()
    conn.commit()
    return row[0]


def finish_run_report(
    conn: psycopg.Connection,
    run_report_id: int,
    status: str,
    rows_loaded: int = 0,
    bytes_downloaded: int | None = None,
    file_sha256: str | None = None,
    message: str | None = None,
    metadata: dict | None = None,
) -> None:
    conn.execute(
        '''
        UPDATE nse.ingest_run_reports
           SET finished_at = NOW(),
               status = %s,
               rows_loaded = %s,
               bytes_downloaded = %s,
               file_sha256 = %s,
               message = %s,
               metadata = COALESCE(%s, '{}'::jsonb)
         WHERE run_report_id = %s
        ''',
        (status, rows_loaded, bytes_downloaded, file_sha256, message, Jsonb(metadata or {}), run_report_id),
    )
    conn.commit()


def register_file(
    conn: psycopg.Connection,
    report_name: str,
    source_date,
    file_name: str,
    file_sha256: str,
    bytes_count: int,
    load_status: str,
    rows_loaded: int,
    metadata: dict | None = None,
) -> None:
    conn.execute(
        '''
        INSERT INTO nse.file_registry (
            report_name, source_date, file_name, file_sha256, bytes, load_status, rows_loaded, metadata
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, COALESCE(%s, '{}'::jsonb))
        ON CONFLICT (report_name, source_date, file_name)
        DO UPDATE SET
            file_sha256 = EXCLUDED.file_sha256,
            bytes = EXCLUDED.bytes,
            load_status = EXCLUDED.load_status,
            rows_loaded = EXCLUDED.rows_loaded,
            metadata = EXCLUDED.metadata,
            loaded_at = NOW()
        ''',
        (report_name, source_date, file_name, file_sha256, bytes_count, load_status, rows_loaded, Jsonb(metadata or {})),
    )
    conn.commit()


def is_file_loaded(conn: psycopg.Connection, report_name: str, source_date, file_name: str) -> bool:
    row = conn.execute(
        '''
        SELECT 1
          FROM nse.file_registry
         WHERE report_name = %s
           AND source_date = %s
           AND file_name = %s
           AND load_status = 'loaded'
         LIMIT 1
        ''',
        (report_name, source_date, file_name),
    ).fetchone()
    return row is not None


def upsert_rows(
    conn: psycopg.Connection,
    table: str,
    rows: list[dict],
    conflict_cols: Sequence[str],
    update_cols: Sequence[str] | None = None,
) -> int:
    if not rows:
        return 0

    cols = list(rows[0].keys())
    update_cols = list(update_cols) if update_cols is not None else [c for c in cols if c not in conflict_cols]
    table_ident = sql.Identifier(*(table.split(".")))

    insert_stmt = sql.SQL(
        "INSERT INTO {table} ({cols}) VALUES ({vals}) ON CONFLICT ({conflict_cols}) DO UPDATE SET {updates}"
    ).format(
        table=table_ident,
        cols=sql.SQL(", ").join(map(sql.Identifier, cols)),
        vals=sql.SQL(", ").join(sql.Placeholder() for _ in cols),
        conflict_cols=sql.SQL(", ").join(map(sql.Identifier, conflict_cols)),
        updates=sql.SQL(", ").join(
            sql.SQL("{col} = EXCLUDED.{col}").format(col=sql.Identifier(c)) for c in update_cols
        ),
    )

    def adapt(value):
        if isinstance(value, dict):
            return Jsonb(value)
        return value

    values = [[adapt(row.get(c)) for c in cols] for row in rows]

    with conn.cursor() as cur:
        cur.executemany(insert_stmt, values)
    conn.commit()
    return len(rows)


def purge_old_data(conn: psycopg.Connection, retention_days: int, log_retention_days: int) -> dict:
    metrics: dict[str, int] = {}
    facts = [
        ("nse.fact_eod_prices", "trade_date"),
        ("nse.fact_bhavcopy_udiff", "trade_date"),
        ("nse.fact_daily_volatility", "trade_date"),
        ("nse.fact_market_activity_kv", "trade_date"),
        ("nse.fact_market_activity_index", "trade_date"),
        ("nse.fact_52_week_high_low", "report_date"),
        ("nse.fact_bulk_deals", "trade_date"),
        ("nse.fact_block_deals", "trade_date"),
        ("nse.fact_short_selling", "trade_date"),
        ("nse.fact_surveillance_indicators", "report_date"),
        ("nse.fact_corporate_actions", "report_date"),
        ("nse.fact_text_events", "report_date"),
        ("nse.fact_margin_trading_summary", "report_date"),
        ("nse.fact_margin_trading_scrip", "report_date"),
        ("nse.fact_var_margin", "report_date"),
        ("nse.dim_security_master_snapshot", "snapshot_date"),
    ]
    with conn.cursor() as cur:
        for table, col in facts:
            q = sql.SQL("DELETE FROM {table} WHERE {col} < CURRENT_DATE - %s::int").format(
                table=sql.Identifier(*(table.split("."))),
                col=sql.Identifier(col),
            )
            cur.execute(q, (retention_days,))
            metrics[f"{table}_deleted"] = cur.rowcount

        cur.execute(
            "DELETE FROM nse.ingest_run_reports WHERE started_at < NOW() - (%s || ' days')::interval",
            (log_retention_days,),
        )
        metrics["nse.ingest_run_reports_deleted"] = cur.rowcount

        cur.execute(
            "DELETE FROM nse.ingest_runs WHERE started_at < NOW() - (%s || ' days')::interval",
            (log_retention_days,),
        )
        metrics["nse.ingest_runs_deleted"] = cur.rowcount

        cur.execute(
            "DELETE FROM nse.file_registry WHERE loaded_at < NOW() - (%s || ' days')::interval",
            (log_retention_days,),
        )
        metrics["nse.file_registry_deleted"] = cur.rowcount

    conn.commit()
    return metrics
