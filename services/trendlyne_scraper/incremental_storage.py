"""PostgreSQL coordination and append-only incremental persistence."""
from __future__ import annotations

import json
import uuid
from contextlib import contextmanager
from datetime import date
from typing import Iterable, Iterator

import psycopg2.extras
from psycopg2 import sql as psy_sql

from models import synthetic_report_id
from postgres import (
    COLUMN_MAPPING,
    SCHEMA,
    TABLE,
    PostgresStorageError,
    _actual_columns,
    _prepare_row,
    _table_exists,
    get_connection,
)
from utils import LOGGER

LOCK_NAME = "trendlyne_scraper_incremental_v1"


class IncrementalRunAlreadyActive(RuntimeError):
    pass


@contextmanager
def advisory_lock() -> Iterator[None]:
    """Hold a database advisory lock for the complete scrape/write cycle."""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT pg_try_advisory_lock(hashtext(%s))", (LOCK_NAME,))
            if not cur.fetchone()[0]:
                raise IncrementalRunAlreadyActive("another Trendlyne incremental run is active")
        yield
    finally:
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT pg_advisory_unlock(hashtext(%s))", (LOCK_NAME,))
        finally:
            conn.close()


def ensure_operational_tables() -> None:
    """Create only the scheduler's additive run ledger and durable outbox."""
    conn = get_connection()
    try:
        with conn, conn.cursor() as cur:
            cur.execute(
                psy_sql.SQL(
                    """
                    CREATE TABLE IF NOT EXISTS {}.trendlyne_scraper_run (
                        run_id text PRIMARY KEY,
                        trigger text NOT NULL,
                        status text NOT NULL,
                        started_at timestamptz NOT NULL DEFAULT now(),
                        completed_at timestamptz,
                        cutoff_date date,
                        pages_scraped integer NOT NULL DEFAULT 0,
                        reports_seen integer NOT NULL DEFAULT 0,
                        reports_inserted integer NOT NULL DEFAULT 0,
                        known_reports_skipped integer NOT NULL DEFAULT 0,
                        errors integer NOT NULL DEFAULT 0,
                        detail jsonb NOT NULL DEFAULT '{{}}'::jsonb
                    );

                    CREATE TABLE IF NOT EXISTS {}.trendlyne_new_report_outbox (
                        report_id text PRIMARY KEY,
                        run_id text NOT NULL,
                        payload jsonb NOT NULL,
                        status text NOT NULL DEFAULT 'PENDING',
                        attempts integer NOT NULL DEFAULT 0,
                        created_at timestamptz NOT NULL DEFAULT now(),
                        delivered_at timestamptz,
                        last_attempt_at timestamptz,
                        last_error text
                    );

                    CREATE INDEX IF NOT EXISTS trendlyne_new_report_outbox_pending_idx
                    ON {}.trendlyne_new_report_outbox (status, created_at);
                    """
                ).format(
                    psy_sql.Identifier(SCHEMA),
                    psy_sql.Identifier(SCHEMA),
                    psy_sql.Identifier(SCHEMA),
                )
            )
    finally:
        conn.close()


def abandon_interrupted_runs() -> int:
    """Close stale RUNNING ledger rows after this process owns the global lock."""
    conn = get_connection()
    try:
        with conn, conn.cursor() as cur:
            cur.execute(
                psy_sql.SQL(
                    "UPDATE {}.trendlyne_scraper_run "
                    "SET status='ABORTED', completed_at=now(), "
                    "detail=detail || %s::jsonb WHERE status='RUNNING'"
                ).format(psy_sql.Identifier(SCHEMA)),
                (json.dumps({"reason": "previous process ended before run completion"}),),
            )
            return int(cur.rowcount)
    finally:
        conn.close()


def existing_report_state() -> tuple[set[str], date | None]:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            if not _table_exists(cur):
                raise PostgresStorageError(f"Required table {SCHEMA}.{TABLE} does not exist")
            cur.execute(
                psy_sql.SQL("SELECT report_id, report_date FROM {}.{}").format(
                    psy_sql.Identifier(SCHEMA), psy_sql.Identifier(TABLE)
                )
            )
            ids: set[str] = set()
            newest: date | None = None
            for report_id, report_date in cur:
                if report_id:
                    ids.add(str(report_id))
                if report_date:
                    try:
                        parsed = date.fromisoformat(str(report_date)[:10])
                    except ValueError:
                        continue
                    newest = parsed if newest is None or parsed > newest else newest
            return ids, newest
    finally:
        conn.close()


def begin_run(trigger: str, cutoff_date: date | None) -> str:
    run_id = str(uuid.uuid4())
    conn = get_connection()
    try:
        with conn, conn.cursor() as cur:
            cur.execute(
                psy_sql.SQL(
                    "INSERT INTO {}.trendlyne_scraper_run(run_id,trigger,status,cutoff_date) "
                    "VALUES (%s,%s,'RUNNING',%s)"
                ).format(psy_sql.Identifier(SCHEMA)),
                (run_id, trigger, cutoff_date),
            )
        return run_id
    finally:
        conn.close()


def finish_run(run_id: str, status: str, stats: dict, detail: dict | None = None) -> None:
    conn = get_connection()
    try:
        with conn, conn.cursor() as cur:
            cur.execute(
                psy_sql.SQL(
                    """
                    UPDATE {}.trendlyne_scraper_run
                    SET status=%s, completed_at=now(), pages_scraped=%s, reports_seen=%s,
                        reports_inserted=%s, known_reports_skipped=%s, errors=%s, detail=%s::jsonb
                    WHERE run_id=%s
                    """
                ).format(psy_sql.Identifier(SCHEMA)),
                (
                    status,
                    int(stats.get("pages_scraped", 0)),
                    int(stats.get("reports_scraped", 0)),
                    int(stats.get("reports_inserted", 0)),
                    int(stats.get("database_known_skipped", 0)),
                    int(stats.get("errors", 0)),
                    json.dumps(detail or {}, default=str),
                    run_id,
                ),
            )
    finally:
        conn.close()


def insert_new_reports(records: Iterable[dict], run_id: str) -> list[dict]:
    """Insert unseen canonical IDs and enqueue exactly those inserted rows."""
    unique: dict[str, dict] = {}
    for raw in records:
        record = dict(raw)
        report_id = str(record.get("report_id") or synthetic_report_id(record))
        record["report_id"] = report_id
        unique[report_id] = record
    if not unique:
        return []

    columns = list(COLUMN_MAPPING.values())
    rows = []
    ordered_ids = []
    for report_id, record in unique.items():
        prepared = _prepare_row(record)
        if prepared is not None:
            ordered_ids.append(report_id)
            rows.append(prepared)
    if not rows:
        return []

    conn = get_connection()
    try:
        with conn, conn.cursor() as cur:
            actual = _actual_columns(cur)
            missing = [column for column in columns if column not in actual]
            if missing:
                raise PostgresStorageError(f"{SCHEMA}.{TABLE} is missing columns: {missing}")
            cols_sql = psy_sql.SQL(", ").join(psy_sql.Identifier(column) for column in columns)
            statement = psy_sql.SQL(
                "INSERT INTO {}.{} ({}) VALUES %s "
                "ON CONFLICT (report_id) DO NOTHING RETURNING report_id"
            ).format(psy_sql.Identifier(SCHEMA), psy_sql.Identifier(TABLE), cols_sql)
            returned = psycopg2.extras.execute_values(cur, statement, rows, page_size=500, fetch=True)
            inserted_ids = {str(row[0]) for row in returned}
            inserted = [unique[report_id] for report_id in ordered_ids if report_id in inserted_ids]
            if inserted:
                outbox_rows = [
                    (record["report_id"], run_id, psycopg2.extras.Json(record)) for record in inserted
                ]
                psycopg2.extras.execute_values(
                    cur,
                    psy_sql.SQL(
                        "INSERT INTO {}.trendlyne_new_report_outbox(report_id,run_id,payload) VALUES %s "
                        "ON CONFLICT (report_id) DO NOTHING"
                    ).format(psy_sql.Identifier(SCHEMA)),
                    outbox_rows,
                    page_size=500,
                )
            LOGGER.info(
                "Incremental insert complete: candidates=%d inserted=%d conflicts=%d",
                len(rows), len(inserted), len(rows) - len(inserted),
            )
            return inserted
    finally:
        conn.close()


def pending_outbox(limit: int) -> list[dict]:
    conn = get_connection()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                psy_sql.SQL(
                    "SELECT report_id,run_id,payload,attempts FROM {}.trendlyne_new_report_outbox "
                    "WHERE status='PENDING' ORDER BY created_at,report_id LIMIT %s"
                ).format(psy_sql.Identifier(SCHEMA)),
                (limit,),
            )
            return [dict(row) for row in cur.fetchall()]
    finally:
        conn.close()


def mark_outbox_delivered(report_ids: list[str]) -> None:
    if not report_ids:
        return
    conn = get_connection()
    try:
        with conn, conn.cursor() as cur:
            cur.execute(
                psy_sql.SQL(
                    "UPDATE {}.trendlyne_new_report_outbox SET status='DELIVERED', "
                    "attempts=attempts+1,last_attempt_at=now(),delivered_at=now(),last_error=NULL "
                    "WHERE report_id=ANY(%s) AND status='PENDING'"
                ).format(psy_sql.Identifier(SCHEMA)),
                (report_ids,),
            )
    finally:
        conn.close()


def mark_outbox_failed(report_ids: list[str], error: str) -> None:
    if not report_ids:
        return
    conn = get_connection()
    try:
        with conn, conn.cursor() as cur:
            cur.execute(
                psy_sql.SQL(
                    "UPDATE {}.trendlyne_new_report_outbox SET attempts=attempts+1, "
                    "last_attempt_at=now(),last_error=%s WHERE report_id=ANY(%s) AND status='PENDING'"
                ).format(psy_sql.Identifier(SCHEMA)),
                (error[:1000], report_ids),
            )
    finally:
        conn.close()
