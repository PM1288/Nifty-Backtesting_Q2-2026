from __future__ import annotations

from contextlib import contextmanager
from typing import Iterator

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Connection, Engine

from nse_reco_state_aware_engine.core.config import settings


def make_engine() -> Engine:
    return create_engine(
        settings.DATABASE_URL,
        pool_pre_ping=True,
        pool_size=settings.DB_POOL_SIZE,
        max_overflow=settings.DB_POOL_MAX_OVERFLOW,
        pool_timeout=settings.DB_POOL_TIMEOUT_SECONDS,
        pool_recycle=settings.DB_POOL_RECYCLE_SECONDS,
        pool_use_lifo=True,
    )


ENGINE = make_engine()


@contextmanager
def db_conn() -> Iterator[Connection]:
    with ENGINE.connect() as conn:
        yield conn


def ping(conn: Connection) -> None:
    conn.execute(text("SELECT 1"))
