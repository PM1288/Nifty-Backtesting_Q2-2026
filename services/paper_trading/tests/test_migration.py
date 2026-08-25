import os
from decimal import Decimal
from pathlib import Path

import psycopg
import pytest


@pytest.mark.skipif(not os.getenv("TEST_DATABASE_URL"), reason="TEST_DATABASE_URL not configured")
def test_migration_is_idempotent_and_core_views_exist() -> None:
    schema = "paper_trading_test"
    body = (Path(__file__).parents[1] / "migrations/001_init.sql").read_text().replace("__SCHEMA__", schema)
    target_lifecycle = (
        Path(__file__).parents[1] / "migrations/002_target_lifecycle.sql"
    ).read_text().replace("__SCHEMA__", schema)
    incident_history = (
        Path(__file__).parents[1] / "migrations/003_data_quality_incident_history.sql"
    ).read_text().replace("__SCHEMA__", schema)
    valuation_fix = (
        Path(__file__).parents[1] / "migrations/004_position_valuation_and_standard_ladders.sql"
    ).read_text().replace("__SCHEMA__", schema)
    evaluation_rules = (
        Path(__file__).parents[1] / "migrations/005_evaluation_rules_and_intraday_040.sql"
    ).read_text().replace("__SCHEMA__", schema)
    exit_policy = (
        Path(__file__).parents[1] / "migrations/006_target_exit_policy_intraday_1_swing_3.sql"
    ).read_text().replace("__SCHEMA__", schema)
    target_finalization = (
        Path(__file__).parents[1] / "migrations/007_target_window_finalization.sql"
    ).read_text().replace("__SCHEMA__", schema)
    admin_trade_comments = (
        Path(__file__).parents[1] / "migrations/008_admin_trade_comments.sql"
    ).read_text().replace("__SCHEMA__", schema)
    trade_quality = (
        Path(__file__).parents[1] / "migrations/009_trade_quality_assessments.sql"
    ).read_text().replace("__SCHEMA__", schema)
    quality_reviews = (
        Path(__file__).parents[1] / "migrations/010_trade_quality_reviews.sql"
    ).read_text().replace("__SCHEMA__", schema)
    quality_estimated_status = (
        Path(__file__).parents[1] / "migrations/011_trade_quality_estimated_status.sql"
    ).read_text().replace("__SCHEMA__", schema)
    intraday_monotonic = (
        Path(__file__).parents[1] / "migrations/012_intraday_040_monotonic_backfill.sql"
    ).read_text().replace("__SCHEMA__", schema)
    entry_market_evidence = (
        Path(__file__).parents[1] / "migrations/013_entry_market_book_evidence.sql"
    ).read_text().replace("__SCHEMA__", schema)
    with psycopg.connect(os.environ["TEST_DATABASE_URL"]) as conn:
        conn.execute(f"DROP SCHEMA IF EXISTS {schema} CASCADE")
        conn.execute(body)
        conn.execute(body)
        conn.execute(target_lifecycle)
        conn.execute(target_lifecycle)
        conn.execute(incident_history)
        conn.execute(incident_history)
        conn.execute(valuation_fix)
        conn.execute(valuation_fix)
        conn.execute(evaluation_rules)
        conn.execute(evaluation_rules)
        conn.execute(exit_policy)
        conn.execute(exit_policy)
        conn.execute(target_finalization)
        conn.execute(target_finalization)
        conn.execute(admin_trade_comments)
        conn.execute(admin_trade_comments)
        conn.execute(trade_quality)
        conn.execute(trade_quality)
        conn.execute(quality_reviews)
        conn.execute(quality_reviews)
        conn.execute(quality_estimated_status)
        conn.execute(quality_estimated_status)
        conn.execute(intraday_monotonic)
        conn.execute(intraday_monotonic)
        conn.execute(entry_market_evidence)
        conn.execute(entry_market_evidence)
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
            "evaluation_rule_sets",
            "trade_comments",
            "trade_quality_assessments",
            "trade_quality_criteria",
            "trade_quality_reviews",
            "entry_market_evidence",
        } <= tables
        conn.execute(
            f"INSERT INTO {schema}.data_quality_incidents(exchange,instrument_token,incident_type,status,detail) "
            "VALUES ('NSE','1','STALE','RECOVERED','{}'::jsonb),"
            "('NSE','1','STALE','RECOVERED','{}'::jsonb)"
        )
        assert conn.execute(
            "SELECT count(*) FROM pg_indexes WHERE schemaname=%s AND indexname='data_quality_incidents_one_open_idx'",
            (schema,),
        ).fetchone()[0] == 1
        assert conn.execute(
            f"SELECT count(*) FROM {schema}.schema_migrations WHERE version='004_position_valuation_and_standard_ladders'"
        ).fetchone()[0] == 1
        assert conn.execute(
            f"SELECT count(*) FROM {schema}.schema_migrations WHERE version='005_evaluation_rules_and_intraday_040'"
        ).fetchone()[0] == 1
        assert conn.execute(
            f"SELECT count(*) FROM {schema}.schema_migrations WHERE version='007_target_window_finalization'"
        ).fetchone()[0] == 1
        assert conn.execute(
            f"SELECT count(*) FROM {schema}.schema_migrations WHERE version='008_admin_trade_comments'"
        ).fetchone()[0] == 1
        assert conn.execute(
            f"SELECT count(*) FROM {schema}.schema_migrations WHERE version='009_trade_quality_assessments'"
        ).fetchone()[0] == 1
        assert conn.execute(
            f"SELECT count(*) FROM {schema}.schema_migrations WHERE version='010_trade_quality_reviews'"
        ).fetchone()[0] == 1
        assert conn.execute(
            f"SELECT count(*) FROM {schema}.schema_migrations WHERE version='011_trade_quality_estimated_status'"
        ).fetchone()[0] == 1
        assert conn.execute(
            f"SELECT count(*) FROM {schema}.schema_migrations WHERE version='013_entry_market_book_evidence'"
        ).fetchone()[0] == 1
        assert conn.execute(
            f"SELECT intraday_targets FROM {schema}.evaluation_rule_sets WHERE status='ACTIVE'"
        ).fetchone()[0] == [Decimal("0.0030000000"), Decimal("0.0040000000"), Decimal("0.0050000000"), Decimal("0.0100000000")]
        conn.execute(f"DROP SCHEMA {schema} CASCADE")
