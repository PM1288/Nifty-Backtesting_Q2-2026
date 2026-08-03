from __future__ import annotations

from pathlib import Path

from .db import execute_sql_file, fetch_val
from .logging_utils import get_logger

log = get_logger(__name__)


def _shared_integration_contract_exists() -> bool:
    return bool(
        fetch_val(
            """
            select to_regclass('integration.v_source_security_1m') is not null
               and to_regclass('integration.v_source_index_1m') is not null
               and to_regclass('integration.v_prev_security_daily') is not null
               and to_regclass('integration.v_prev_index_daily') is not null
               and to_regclass('integration.v_universe_membership') is not null
               and to_regclass('integration.v_index_daily_history') is not null
            """
        )
    )


def install_sql() -> None:
    root = Path(__file__).resolve().parents[2]
    sql_dir = root / "sql"
    shared_contract_exists = _shared_integration_contract_exists()
    for path in sorted(sql_dir.glob("*.sql")):
        if shared_contract_exists and path.name in {"005_integration_templates.sql", "006_compatibility_views.sql"}:
            log.info("Skipping SQL file because shared integration contract already exists: %s", path.name)
            continue
        log.info("Installing SQL file: %s", path.name)
        execute_sql_file(path)
