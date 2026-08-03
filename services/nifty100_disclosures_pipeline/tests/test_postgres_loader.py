from __future__ import annotations

from pathlib import Path

import pytest

from nifty100_pipeline.config import Settings
from nifty100_pipeline.postgres_loader import _assert_tables_exist


class _FakeCursor:
    def __init__(self, existing_tables: set[str]) -> None:
        self._existing_tables = existing_tables
        self._current: tuple[str | None] = (None,)

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        return None

    def execute(self, _query: str, params: tuple[str]) -> None:
        table_name = params[0]
        self._current = (table_name if table_name in self._existing_tables else None,)

    def fetchone(self) -> tuple[str | None]:
        return self._current


class _FakeConnection:
    def __init__(self, existing_tables: set[str]) -> None:
        self._existing_tables = existing_tables

    def cursor(self) -> _FakeCursor:
        return _FakeCursor(self._existing_tables)


def test_assert_tables_exist_raises_with_missing_repo_managed_tables(tmp_path: Path) -> None:
    settings = Settings(project_root=tmp_path, output_dir=Path("data"))
    conn = _FakeConnection(existing_tables={"market_data.nse_financial_results"})

    with pytest.raises(RuntimeError, match="db/sql/011_nifty100_disclosures.sql"):
        _assert_tables_exist(conn, settings)
