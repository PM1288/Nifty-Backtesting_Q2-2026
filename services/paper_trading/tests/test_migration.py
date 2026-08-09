import os
from pathlib import Path

import psycopg
import pytest


@pytest.mark.skipif(not os.getenv("TEST_DATABASE_URL"), reason="TEST_DATABASE_URL not configured")
def test_migration_is_idempotent_and_core_views_exist() -> None:
    schema = "paper_trading_test"
    body = (Path(__file__).parents[1] / "migrations/001_init.sql").read_text().replace("__SCHEMA__", schema)
    with psycopg.connect(os.environ["TEST_DATABASE_URL"]) as conn:
        conn.execute(f"DROP SCHEMA IF EXISTS {schema} CASCADE")
        conn.execute(body)
        conn.execute(body)
        tables = {
            x[0]
            for x in conn.execute(
                "select table_name from information_schema.tables where table_schema=%s", (schema,)
            ).fetchall()
        }
        assert {
            "trade_intents",
            "trade_groups",
            "trade_legs",
            "target_tracks",
            "webhook_outbox",
            "daily_summaries",
        } <= tables
        conn.execute(f"DROP SCHEMA {schema} CASCADE")
