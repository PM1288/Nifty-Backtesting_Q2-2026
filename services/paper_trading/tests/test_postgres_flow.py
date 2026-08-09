from __future__ import annotations

import os
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from psycopg import connect

from papertrade.config import Settings
from papertrade.contracts import BuildingGroupRequest, CloseIntent, ExitRule, Leg, TradeIntent
from papertrade.db import Database
from papertrade.monitor import Monitor
from papertrade.service import PaperService

pytestmark = pytest.mark.skipif(not os.getenv("TEST_DATABASE_URL"), reason="TEST_DATABASE_URL not configured")


def _settings(dsn: str) -> Settings:
    return Settings(
        PAPER_TRADING_ONLY=True,
        DATABASE_URL=dsn,
        API_SERVICE_TOKENS="test-service-token-long-enough",
        N8N_WEBHOOK_URL="http://127.0.0.1:9/webhook",
        N8N_BASIC_USERNAME="test",
        N8N_BASIC_PASSWORD="test",
        WEBHOOK_SIGNING_SECRET="test-signing-secret-at-least-24-characters",
    )


def _intent(now: datetime) -> TradeIntent:
    return TradeIntent.model_validate(
        {
            "schema_version": "1.0",
            "client_event_id": "pg-flow-1",
            "account_id": "paper-main",
            "environment": "PAPER",
            "source": {"service": "pytest", "instance": "test"},
            "strategy": {
                "strategy_id": "TEST",
                "strategy_name": "Integration Test",
                "strategy_version": "1.0",
                "signal_id": "signal-pg-flow-1",
            },
            "signal": {
                "occurred_at": now.isoformat(),
                "direction": "LONG",
                "reason_codes": ["TEST"],
                "features": {},
            },
            "trade_group": {
                "client_group_id": "pg-flow-group-1",
                "asset_class": "EQUITY",
                "expected_leg_count": 1,
                "group_entry_policy": "ATOMIC",
                "group_close_policy": "ALL_LEGS",
                "performance_basis": {"type": "ENTRY_NOTIONAL", "currency": "INR"},
            },
            "legs": [
                {
                    "client_leg_id": "leg-1",
                    "instrument": {
                        "instrument_id": "NSE:CASH:TEST",
                        "instrument_token": "TEST1",
                        "exchange": "NSE",
                        "segment": "CASH",
                        "symbol": "TEST",
                        "underlying": "TEST",
                        "lot_size": "1",
                        "contract_multiplier": "1",
                    },
                    "side": "BUY",
                    "quantity": {"value": "100", "unit": "SHARES"},
                    "entry_order": {"type": "MARKET"},
                }
            ],
            "execution_policy": {"mode": "EXTERNAL_EXIT", "exit_rules": []},
            "analytics_policy": {"apply_default_ladders": True},
            "cost_profile_id": "india-equity-current",
            "tax_profile_id": "management-profit-tax-35pct",
        }
    )


def test_postgres_entry_targets_close_and_continued_observation() -> None:
    dsn = os.environ["TEST_DATABASE_URL"]
    with connect(dsn, autocommit=True) as raw:
        raw.execute("DROP SCHEMA IF EXISTS paper_trading CASCADE")
        raw.execute("DROP TABLE IF EXISTS public.bars_1m")
        raw.execute(
            """CREATE TABLE public.bars_1m(
               ts timestamptz NOT NULL, exchange text NOT NULL, symbol_token text NOT NULL,
               open numeric NOT NULL, high numeric NOT NULL, low numeric NOT NULL,
               close numeric NOT NULL, volume bigint, source text,
               PRIMARY KEY(exchange,symbol_token,ts))"""
        )

    settings = _settings(dsn)
    db = Database(settings)
    db.open()
    db.migrate()
    service = PaperService(db, settings.PAPER_TRADING_SCHEMA)
    now = datetime.now(UTC)
    response, code = service.create_trade(_intent(now), "integration-create-0001")
    assert code == 202
    group_id = response["trade_group_id"]

    first_bar = now + timedelta(minutes=1)
    with db.connection() as conn:
        conn.execute(
            "INSERT INTO public.bars_1m VALUES (%s,'NSE','TEST1',100,101.20,99.40,100.80,1000,'TEST')",
            (first_bar,),
        )
    monitor = Monitor(db, settings, "pytest-monitor")
    result = monitor.once()
    assert result == {"fills": 1, "bars": 1, "stale": 0, "recovered": 0}
    with db.connection() as conn:
        statuses = conn.execute(
            "SELECT status,count(*) n FROM paper_trading.target_tracks GROUP BY status"
        ).fetchall()
        assert {row["status"]: row["n"] for row in statuses} == {"ACTIVE": 2, "CLOSED_AT_TARGET": 4}
        assert (
            conn.execute(
                "SELECT status FROM paper_trading.trade_groups WHERE trade_group_id=%s", (group_id,)
            ).fetchone()["status"]
            == "OPEN"
        )

    close = CloseIntent.model_validate(
        {
            "schema_version": "1.0",
            "client_event_id": "pg-close-1",
            "occurred_at": (now + timedelta(minutes=2)).isoformat(),
            "reason": "STRATEGY_EXIT",
            "scope": "GROUP",
            "price_policy": "NEXT_AVAILABLE_BAR_OPEN",
            "legs": [],
        }
    )
    service.close_trade(group_id, close, "integration-close-0001")
    monitor.once()
    second_bar = now + timedelta(minutes=3)
    with db.connection() as conn:
        conn.execute(
            "INSERT INTO public.bars_1m VALUES (%s,'NSE','TEST1',102,105.50,101.50,105,1000,'TEST')",
            (second_bar,),
        )
    monitor.once()
    with db.connection() as conn:
        group = conn.execute(
            "SELECT status,fully_closed FROM paper_trading.trade_groups WHERE trade_group_id=%s",
            (group_id,),
        ).fetchone()
        assert group == {"status": "CLOSED", "fully_closed": True}
        assert conn.execute("SELECT count(*) n FROM paper_trading.target_hits").fetchone()["n"] == 6
        assert (
            conn.execute(
                "SELECT count(*) n FROM paper_trading.trade_events WHERE event_type='com.papertrading.trade_group.closed.v1'"
            ).fetchone()["n"]
            == 1
        )
        tax = conn.execute(
            "SELECT provision_amount FROM paper_trading.income_tax_provision_ledger"
        ).fetchone()["provision_amount"]
        assert tax >= Decimal("0")
    db.close()


def test_incremental_multileg_group_commit() -> None:
    dsn = os.environ["TEST_DATABASE_URL"]
    with connect(dsn, autocommit=True) as raw:
        raw.execute("DROP SCHEMA IF EXISTS paper_trading CASCADE")
    settings = _settings(dsn)
    db = Database(settings)
    db.open()
    db.migrate()
    service = PaperService(db, settings.PAPER_TRADING_SCHEMA)
    now = datetime.now(UTC)
    request = BuildingGroupRequest.model_validate(
        {
            "schema_version": "1.0",
            "client_event_id": "build-spread-1",
            "account_id": "paper-main",
            "environment": "PAPER",
            "source": {"service": "pytest-options"},
            "strategy": {
                "strategy_id": "SPREAD",
                "strategy_name": "Bull Call Spread",
                "strategy_version": "1.0",
                "signal_id": "spread-signal-1",
            },
            "signal": {"occurred_at": now.isoformat(), "direction": "MIXED"},
            "trade_group": {
                "client_group_id": "spread-group-1",
                "asset_class": "OPTION",
                "expected_leg_count": 2,
                "group_entry_policy": "ATOMIC",
                "group_close_policy": "ALL_LEGS",
                "performance_basis": {"type": "NET_DEBIT", "currency": "INR"},
            },
            "execution_policy": {"mode": "EXTERNAL_EXIT"},
            "analytics_policy": {"apply_default_ladders": True},
            "cost_profile_id": "india-options-current",
            "tax_profile_id": "management-profit-tax-35pct",
        }
    )
    created, code = service.create_building_group(request, "build-spread-idempotency-1")
    assert code == 201
    group_id = created["trade_group_id"]
    for index, (side, strike) in enumerate((("BUY", "2500"), ("SELL", "2600")), 1):
        leg = Leg.model_validate(
            {
                "client_leg_id": f"leg-{index}",
                "instrument": {
                    "instrument_id": f"NFO:OPT:TEST:{strike}",
                    "instrument_token": f"OPT{index}",
                    "exchange": "NFO",
                    "segment": "OPT",
                    "symbol": f"TEST{strike}CE",
                    "underlying": "TEST",
                    "expiry": (now.date() + timedelta(days=30)).isoformat(),
                    "strike": strike,
                    "option_type": "CALL",
                    "lot_size": "50",
                    "contract_multiplier": "1",
                },
                "side": side,
                "quantity": {"value": "1", "unit": "LOTS"},
                "entry_order": {"type": "MARKET"},
            }
        )
        service.add_building_leg(group_id, leg)
    committed = service.commit_building_group(group_id)
    assert committed["status"] == "PENDING_ENTRY"
    with db.connection() as conn:
        assert (
            conn.execute(
                "SELECT count(*) n FROM paper_trading.paper_orders WHERE trade_group_id=%s", (group_id,)
            ).fetchone()["n"]
            == 2
        )
        assert (
            conn.execute(
                "SELECT count(*) n FROM paper_trading.target_tracks t JOIN paper_trading.trade_legs l USING(trade_leg_id) WHERE l.trade_group_id=%s",
                (group_id,),
            ).fetchone()["n"]
            == 12
        )
    db.close()


def test_execution_target_closes_only_actual_position_and_higher_analytics_continue() -> None:
    dsn = os.environ["TEST_DATABASE_URL"]
    with connect(dsn, autocommit=True) as raw:
        raw.execute("DROP SCHEMA IF EXISTS paper_trading CASCADE")
        raw.execute("DROP TABLE IF EXISTS public.bars_1m")
        raw.execute(
            "CREATE TABLE public.bars_1m(ts timestamptz,exchange text,symbol_token text,open numeric,high numeric,low numeric,close numeric,volume bigint,source text,PRIMARY KEY(exchange,symbol_token,ts))"
        )
    settings = _settings(dsn)
    db = Database(settings)
    db.open()
    db.migrate()
    now = datetime.now(UTC)
    intent = _intent(now)
    intent.client_event_id = "execution-target-1"
    intent.strategy.signal_id = "execution-target-signal-1"
    intent.trade_group.client_group_id = "execution-target-group-1"
    intent.execution_policy.exit_rules = [
        ExitRule(
            rule_id="exit-at-half-percent",
            kind="TARGET_PCT",
            value=Decimal("0.005"),
            action="FULL_CLOSE",
        )
    ]
    group_id = PaperService(db, settings.PAPER_TRADING_SCHEMA).create_trade(
        intent, "execution-target-idem-1"
    )[0]["trade_group_id"]
    with db.connection() as conn:
        conn.execute(
            "INSERT INTO public.bars_1m VALUES (%s,'NSE','TEST1',100,100.60,99.40,100.50,1000,'TEST')",
            (now + timedelta(minutes=1),),
        )
    monitor = Monitor(db, settings, "execution-target-worker")
    monitor.once()
    with db.connection() as conn:
        assert (
            conn.execute(
                "SELECT count(*) n FROM paper_trading.paper_orders WHERE trade_group_id=%s AND position_effect='CLOSE' AND status='ACCEPTED'",
                (group_id,),
            ).fetchone()["n"]
            == 1
        )
        assert (
            conn.execute(
                "SELECT fully_closed FROM paper_trading.trade_groups WHERE trade_group_id=%s", (group_id,)
            ).fetchone()["fully_closed"]
            is False
        )
        conn.execute(
            "INSERT INTO public.bars_1m VALUES (%s,'NSE','TEST1',100.80,101.20,100.70,101.10,1000,'TEST')",
            (now + timedelta(minutes=2),),
        )
    monitor.once()
    with db.connection() as conn:
        assert (
            conn.execute(
                "SELECT fully_closed FROM paper_trading.trade_groups WHERE trade_group_id=%s", (group_id,)
            ).fetchone()["fully_closed"]
            is True
        )
        assert (
            conn.execute(
                "SELECT count(*) n FROM paper_trading.target_hits h JOIN paper_trading.target_tracks t USING(target_track_id) JOIN paper_trading.target_definitions d USING(target_definition_id) WHERE d.trade_group_id=%s AND d.target_pct=0.010",
                (group_id,),
            ).fetchone()["n"]
            == 2
        )
    db.close()
