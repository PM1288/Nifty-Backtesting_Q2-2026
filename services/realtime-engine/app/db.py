from __future__ import annotations

from contextlib import contextmanager
from typing import Iterator

from psycopg import connect
from psycopg.rows import dict_row

from .config import get_settings


@contextmanager
def db_conn() -> Iterator:
    settings = get_settings()
    with connect(settings.database_url, row_factory=dict_row) as conn:
        yield conn
