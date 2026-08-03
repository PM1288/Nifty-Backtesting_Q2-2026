from __future__ import annotations

import logging
import random
import time
from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Optional

from sqlalchemy import text
from sqlalchemy.engine import Connection, Result
from sqlalchemy.exc import DBAPIError, OperationalError

logger = logging.getLogger(__name__)

TRANSIENT_EXC = (OperationalError,)


@dataclass
class ExecOptions:
    retries: int = 3
    base_sleep_s: float = 0.3


def exec_text(conn: Connection, sql: str, params: Optional[Dict[str, Any]] = None, options: ExecOptions = ExecOptions()) -> Result:
    params = params or {}
    attempt = 0
    while True:
        try:
            return conn.execute(text(sql), params)
        except TRANSIENT_EXC:
            attempt += 1
            if attempt > options.retries:
                raise
            sleep_s = options.base_sleep_s * (2 ** (attempt - 1)) * (1 + random.random() * 0.2)
            logger.warning("Transient DB error, retrying", extra={"attempt": attempt, "sleep_s": sleep_s})
            time.sleep(sleep_s)
        except DBAPIError:
            raise


def fetch_all(conn: Connection, sql: str, params: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
    res = exec_text(conn, sql, params)
    cols = list(res.keys())
    return [dict(zip(cols, row)) for row in res.fetchall()]


def fetch_one(conn: Connection, sql: str, params: Optional[Dict[str, Any]] = None) -> Optional[Dict[str, Any]]:
    res = exec_text(conn, sql, params)
    row = res.fetchone()
    if row is None:
        return None
    cols = list(res.keys())
    return dict(zip(cols, row))


def run_many(conn: Connection, sql: str, rows: Iterable[Dict[str, Any]]) -> None:
    conn.execute(text(sql), list(rows))
