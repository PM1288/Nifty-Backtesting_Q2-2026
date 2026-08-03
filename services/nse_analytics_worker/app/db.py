from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

import pandas as pd
import psycopg
from psycopg.rows import dict_row

logger = logging.getLogger(__name__)


def connect(database_url: str) -> psycopg.Connection:
    conn = psycopg.connect(database_url, autocommit=False)
    return conn


def run_migrations(conn: psycopg.Connection, sql_dir: Path) -> None:
    files = sorted(sql_dir.glob("*.sql"))
    for file in files:
        logger.info("Applying migration %s", file.name)
        sql = file.read_text(encoding="utf-8")
        with conn.cursor() as cur:
            cur.execute(sql)
        conn.commit()


def execute(conn: psycopg.Connection, sql: str, params: dict[str, Any] | None = None) -> int:
    with conn.cursor() as cur:
        cur.execute(sql, params or {})
        rowcount = cur.rowcount
    conn.commit()
    return rowcount


def fetch_value(conn: psycopg.Connection, sql: str, params: dict[str, Any] | None = None) -> Any:
    with conn.cursor() as cur:
        cur.execute(sql, params or {})
        row = cur.fetchone()
    return None if row is None else row[0]


def query_df(conn: psycopg.Connection, sql: str, params: dict[str, Any] | None = None) -> pd.DataFrame:
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(sql, params or {})
        rows = cur.fetchall()
    return pd.DataFrame(rows)


def create_job_run(conn: psycopg.Connection, job_name: str, notes: str | None = None) -> int:
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO nse_app.job_runs (job_name, notes)
            VALUES (%s, %s)
            RETURNING job_run_id
            """,
            (job_name, notes),
        )
        run_id = cur.fetchone()[0]
    conn.commit()
    return run_id


def finish_job_run(conn: psycopg.Connection, job_run_id: int, status: str, metrics: dict[str, Any] | None = None) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE nse_app.job_runs
            SET finished_at = NOW(),
                status = %s,
                metrics = %s::jsonb
            WHERE job_run_id = %s
            """,
            (status, json.dumps(metrics or {}), job_run_id),
        )
    conn.commit()


def start_job_step(conn: psycopg.Connection, job_run_id: int, step_name: str, step_order: int) -> int:
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO nse_app.job_steps (job_run_id, step_name, step_order)
            VALUES (%s, %s, %s)
            RETURNING job_step_id
            """,
            (job_run_id, step_name, step_order),
        )
        step_id = cur.fetchone()[0]
    conn.commit()
    return step_id


def finish_job_step(
    conn: psycopg.Connection,
    job_step_id: int,
    status: str,
    message: str | None = None,
    metrics: dict[str, Any] | None = None,
) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE nse_app.job_steps
            SET finished_at = NOW(),
                status = %s,
                message = %s,
                metrics = %s::jsonb
            WHERE job_step_id = %s
            """,
            (status, message, json.dumps(metrics or {}), job_step_id),
        )
    conn.commit()


def record_quality_check_result(
    conn: psycopg.Connection,
    job_run_id: int | None,
    check_name: str,
    severity: str,
    status: str,
    observed_value: float | None,
    operator: str,
    threshold: float,
    details: dict[str, Any] | None = None,
) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO nse_app.quality_check_results (
                job_run_id, check_name, severity, status, observed_value, operator, threshold, details
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s::jsonb)
            """,
            (
                job_run_id,
                check_name,
                severity,
                status,
                observed_value,
                operator,
                threshold,
                json.dumps(details or {}),
            ),
        )
    conn.commit()
