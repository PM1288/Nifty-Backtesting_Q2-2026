from __future__ import annotations

import os
import uuid
from datetime import UTC, date, datetime

import httpx
import pytest
from fastapi.testclient import TestClient
from psycopg import connect

from papertrade.api import app
from papertrade.config import Settings, get_settings
from papertrade.db import Database
from papertrade.events import append_event
from papertrade.scheduler import Scheduler
from papertrade.webhook import WebhookWorker

pytestmark = pytest.mark.skipif(not os.getenv("TEST_DATABASE_URL"), reason="TEST_DATABASE_URL not configured")


def configure(monkeypatch: pytest.MonkeyPatch) -> str:
    dsn = os.environ["TEST_DATABASE_URL"]
    values = {
        "PAPER_TRADING_ONLY": "true",
        "DATABASE_URL": dsn,
        "API_SERVICE_TOKENS": "test-service-token-long-enough",
        "N8N_WEBHOOK_URL": "https://receiver.invalid/webhook",
        "N8N_BASIC_USERNAME": "mock-user",
        "N8N_BASIC_PASSWORD": "mock-password",
        "WEBHOOK_SIGNING_SECRET": "test-signing-secret-at-least-24-characters",
    }
    for key, value in values.items():
        monkeypatch.setenv(key, value)
    get_settings.cache_clear()
    return dsn


def reset(dsn: str) -> Database:
    with connect(dsn, autocommit=True) as conn:
        conn.execute("DROP SCHEMA IF EXISTS paper_trading CASCADE")
    db = Database(get_settings())
    db.open()
    db.migrate()
    return db


def stock_payload() -> dict:
    now = datetime.now(UTC).isoformat()
    return {
        "schema_version": "1.0",
        "client_event_id": "api-smoke-1",
        "account_id": "paper-main",
        "environment": "PAPER",
        "source": {"service": "api-test"},
        "strategy": {
            "strategy_id": "API_TEST",
            "strategy_name": "API Test",
            "strategy_version": "1.0",
            "signal_id": "api-signal-1",
        },
        "signal": {"occurred_at": now, "direction": "LONG"},
        "trade_group": {
            "client_group_id": "api-group-1",
            "asset_class": "EQUITY",
            "expected_leg_count": 1,
            "performance_basis": {"type": "ENTRY_NOTIONAL", "currency": "INR"},
        },
        "legs": [
            {
                "client_leg_id": "leg-1",
                "instrument": {
                    "instrument_id": "NSE:CASH:TEST",
                    "instrument_token": "TESTAPI",
                    "exchange": "NSE",
                    "segment": "CASH",
                    "symbol": "TEST",
                    "lot_size": "1",
                    "contract_multiplier": "1",
                },
                "side": "BUY",
                "quantity": {"value": "1", "unit": "SHARES"},
                "entry_order": {"type": "MARKET"},
            }
        ],
        "execution_policy": {},
        "analytics_policy": {},
        "cost_profile_id": "india-equity-current",
        "tax_profile_id": "management-profit-tax-35pct",
    }


def test_api_auth_idempotency_queries_and_health(monkeypatch: pytest.MonkeyPatch) -> None:
    dsn = configure(monkeypatch)
    db = reset(dsn)
    db.close()
    headers = {"Authorization": "Bearer test-service-token-long-enough", "Idempotency-Key": "api-idem-0001"}
    payload = stock_payload()
    with TestClient(app) as client:
        assert client.get("/health/live").status_code == 200
        assert client.get("/health/ready").status_code == 200
        assert client.post("/api/v1/trade-intents", json=payload).status_code == 401
        created = client.post("/api/v1/trade-intents", headers=headers, json=payload)
        assert created.status_code == 202
        group_id = created.json()["trade_group_id"]
        repeated = client.post("/api/v1/trade-intents", headers=headers, json=payload)
        assert repeated.json()["trade_group_id"] == group_id
        changed = payload | {}
        changed["metadata"] = {"changed": True}
        assert client.post("/api/v1/trade-intents", headers=headers, json=changed).status_code == 409
        auth = {"Authorization": headers["Authorization"]}
        assert client.get(f"/api/v1/trade-groups/{group_id}", headers=auth).status_code == 200
        assert client.get("/api/v1/trade-groups", headers=auth).json()["items"]
        assert client.get("/api/v1/accounts/paper-main/summary", headers=auth).status_code == 200
        assert client.get("/api/v1/strategies/API_TEST/performance", headers=auth).status_code == 200
        assert client.get("/metrics").status_code == 200


def test_webhook_delivery_and_summary_events(monkeypatch: pytest.MonkeyPatch) -> None:
    dsn = configure(monkeypatch)
    db = reset(dsn)
    settings: Settings = get_settings()
    aggregate = str(uuid.uuid4())
    correlation = str(uuid.uuid4())
    with db.connection() as conn:
        append_event(
            conn,
            settings.PAPER_TRADING_SCHEMA,
            "system",
            aggregate,
            "com.papertrading.system.processing_error.v1",
            correlation,
            {"event_name": "test", "severity": "TEST"},
        )
    received: list[httpx.Request] = []

    def receiver(request: httpx.Request) -> httpx.Response:
        received.append(request)
        return httpx.Response(202, text="accepted")

    client = httpx.Client(transport=httpx.MockTransport(receiver))
    worker = WebhookWorker(db, settings, "pytest-webhook", client)
    assert worker.drain(10) == 1
    assert received[0].headers["X-Paper-Signature-256"]
    assert received[0].headers["Authorization"].startswith("Basic ")
    scheduler = Scheduler(db, settings)
    finalized = scheduler.finalize_target_windows(date.today())
    assert set(finalized) == {"targets_inferred_monotonic", "intraday_missed", "swing_timed_out"}
    daily = scheduler.daily(date.today())
    assert daily["environment"] == "PAPER"
    assert scheduler.daily(date.today()) == daily
    weekly = scheduler.weekly(date.today())
    assert weekly["environment"] == "PAPER"
    db.close()
