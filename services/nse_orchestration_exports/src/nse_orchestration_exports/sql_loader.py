from __future__ import annotations

from pathlib import Path

from .db import execute_sql_file
from .logging_utils import get_logger

log = get_logger(__name__)


def install_sql(base_dir: str | Path | None = None) -> None:
    if base_dir is None:
        base_dir = Path(__file__).resolve().parents[2] / "sql"
    base_path = Path(base_dir)
    for sql_path in sorted(base_path.glob("*.sql")):
        log.info("Installing SQL file %s", sql_path.name)
        execute_sql_file(sql_path)
