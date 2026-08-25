from __future__ import annotations

import base64
from types import SimpleNamespace
from unittest.mock import MagicMock

from papertrade.whatsapp import (
    build_gateway_payload,
    classify,
    load_entry_evidence,
    render_entry_chart,
    render_message,
)

SETTINGS = SimpleNamespace(
    WA_DATA_ALERT_MIN_AFFECTED=10,
    WA_DATA_ALERT_MIN_DURATION_SECONDS=1200,
)


def event(event_type: str, data: dict | None = None) -> dict:
    return {
        "id": "evt-1",
        "type": event_type,
        "time": "2026-08-25T08:33:01+00:00",
        "subject": "trade-group/group-1",
        "data": {"environment": "PAPER", **(data or {})},
    }


def test_low_noise_policy_sends_lifecycle_events_and_suppresses_precursors() -> None:
    assert classify(event("com.papertrading.trade_leg.opened.v1"), SETTINGS).kind == "ENTRY"
    assert classify(event("com.papertrading.target_track.closed.v1"), SETTINGS).kind == "TARGET"
    assert classify(event("com.papertrading.trade_group.closed.v1"), SETTINGS).kind == "EXIT"
    assert classify(event("com.papertrading.trade_intent.rejected.v1"), SETTINGS).send is True
    assert classify(event("com.papertrading.trade_intent.accepted.v1"), SETTINGS).send is False
    assert classify(event("com.papertrading.execution_target.hit.v1"), SETTINGS).send is False


def test_sustained_outage_uses_doubled_twenty_minute_threshold() -> None:
    transient = classify(
        event("com.papertrading.market_data.stale.v1", {"affected_count": 1, "duration_seconds": 1199}),
        SETTINGS,
    )
    sustained = classify(
        event("com.papertrading.market_data.stale.v1", {"affected_count": 1, "duration_seconds": 1200}),
        SETTINGS,
    )
    assert transient.send is False and transient.reason == "TRANSIENT_DATA_FLAP"
    assert sustained.send is True and sustained.reason == "SUSTAINED_OUTAGE"


def test_entry_message_is_compact_explicit_and_factor_aware() -> None:
    payload = event(
        "com.papertrading.trade_leg.opened.v1",
        {
            "symbol": "OFSS",
            "side": "BUY",
            "fill_price": "11604",
            "fill_quantity": "100",
            "strategy_name": "OIIS Daily Selection",
            "client_group_id": "oiis-2026-ofss",
            "active_exit_target": {"target_price": "11720.04"},
            "swing_exit_target": {"target_price": "11952.12"},
        },
    )
    message = render_message(
        payload, classify(payload, SETTINGS), {"ofactor": "78.3", "xfactor": "74.1", "rsi14": "61.8"}
    )
    assert "*PAPER ENTRY*" in message
    assert "`LONG`" in message
    assert "O factor" in message and "78.3" in message
    assert "Simulation only" in message
    assert "₹11,604.00" in message


def test_entry_chart_and_gateway_media_envelope() -> None:
    bars = []
    for index in range(30):
        opened = 100 + index * 0.2
        closed = opened + (0.35 if index % 3 else -0.15)
        bars.append(
            {
                "open": opened,
                "high": max(opened, closed) + 0.2,
                "low": min(opened, closed) - 0.2,
                "close": closed,
            }
        )
    chart = render_entry_chart(bars, "104.50", "TEST", {"ofactor": "80", "xfactor": "75", "rsi14": "63"})
    assert chart and chart.startswith(b"\x89PNG\r\n\x1a\n")
    payload_event = event(
        "com.papertrading.trade_leg.opened.v1", {"symbol": "TEST", "side": "BUY", "fill_price": "104.50"}
    )
    envelope = build_gateway_payload(
        payload_event, classify(payload_event, SETTINGS), "group@g.us", {}, chart
    )
    assert envelope["chatId"] == "group@g.us"
    assert envelope["media"]["mimetype"] == "image/png"
    assert base64.b64decode(envelope["media"]["data"]).startswith(b"\x89PNG")
    assert envelope["asDocument"] is False


def test_entry_evidence_accepts_nse_cash_symbols_with_eq_suffix() -> None:
    factor_row = {"ofactor": "80", "xfactor": "75", "rsi14": "63", "atr14": "120"}
    instrument_row = {"symbol_token": "10738"}
    bar_rows = [{"open": "100", "high": "101", "low": "99", "close": "100.5"}]
    connection = MagicMock()
    connection.execute.return_value.fetchone.side_effect = [factor_row, instrument_row]
    connection.execute.return_value.fetchall.return_value = bar_rows
    context = MagicMock()
    context.__enter__.return_value = connection
    database = MagicMock()
    database.connection.return_value = context

    factors, bars = load_entry_evidence(
        database,
        event(
            "com.papertrading.trade_leg.opened.v1",
            {"symbol": "OFSS", "side": "BUY", "fill_time": "2026-08-25T08:32:00+00:00"},
        ),
    )

    assert factors["ofactor"] == "80"
    assert bars == bar_rows
    instrument_sql = str(connection.execute.call_args_list[1].args[0])
    assert "tradingsymbol)=upper(%s || '-EQ')" in instrument_sql
