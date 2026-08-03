from __future__ import annotations

import contextlib
from pathlib import Path
from typing import Iterable, Optional

from psycopg import Connection
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from .config import get_settings

_POOL: ConnectionPool[Connection] | None = None


def get_pool() -> ConnectionPool[Connection]:
    global _POOL
    if _POOL is not None:
        return _POOL

    settings = get_settings()
    _POOL = ConnectionPool(
        conninfo=settings.pg_dsn,
        min_size=settings.db_pool_min_size,
        max_size=settings.db_pool_max_size,
        timeout=settings.db_pool_timeout_seconds,
        max_idle=settings.db_pool_max_idle_seconds,
        kwargs={"row_factory": dict_row},
        open=True,
    )
    return _POOL


@contextlib.contextmanager
def get_conn():
    with get_pool().connection() as conn:
        yield conn


def fetch_all(sql: str, params: Optional[dict] = None) -> list[dict]:
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(sql, params or {})
        return list(cur.fetchall())


def fetch_one(sql: str, params: Optional[dict] = None) -> dict | None:
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(sql, params or {})
        row = cur.fetchone()
        return dict(row) if row else None


def fetch_val(sql: str, params: Optional[dict] = None):
    row = fetch_one(sql, params)
    if not row:
        return None
    return next(iter(row.values()))


def execute(sql: str, params: Optional[dict] = None) -> None:
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(sql, params or {})
        conn.commit()


def execute_many(sql: str, seq_of_params: Iterable[dict]) -> None:
    with get_conn() as conn, conn.cursor() as cur:
        cur.executemany(sql, seq_of_params)
        conn.commit()


def execute_sql_file(path: str | Path) -> None:
    sql_text = Path(path).read_text(encoding="utf-8")
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(sql_text)
        conn.commit()
