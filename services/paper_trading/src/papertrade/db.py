from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

from psycopg import Connection, sql
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from .config import Settings


class Database:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.pool = ConnectionPool(
            settings.database_url, min_size=1, max_size=10, kwargs={"row_factory": dict_row}, open=False
        )

    def open(self) -> None:
        self.pool.open(wait=True)

    def close(self) -> None:
        self.pool.close()

    @contextmanager
    def connection(self) -> Iterator[Connection]:
        with self.pool.connection() as conn:
            yield conn

    def ping(self) -> bool:
        with self.connection() as conn:
            row = conn.execute("SELECT 1").fetchone()
            return bool(row and row[0] == 1)

    def migrate(self) -> None:
        candidates = (
            Path("/app/migrations"),
            Path(__file__).resolve().parents[2] / "migrations",
            Path.cwd() / "migrations",
        )
        directory = next((path for path in candidates if (path / "001_init.sql").exists()), None)
        if directory is None:
            raise FileNotFoundError("paper-trading SQL migrations are not available")
        migrations = sorted(directory.glob("[0-9][0-9][0-9]_*.sql"))
        with self.connection() as conn:
            conn.execute(
                "SELECT pg_advisory_xact_lock(hashtext(%s))",
                (f"{self.settings.PAPER_TRADING_SCHEMA}:migrate",),
            )
            for migration in migrations:
                body = migration.read_text(encoding="utf-8").replace(
                    "__SCHEMA__", self.settings.PAPER_TRADING_SCHEMA
                )
                conn.execute(body)

    def market_relation(self, table: str) -> sql.Composed:
        return sql.SQL("{}.{}").format(
            sql.Identifier(self.settings.MARKET_DATA_SCHEMA), sql.Identifier(table)
        )
