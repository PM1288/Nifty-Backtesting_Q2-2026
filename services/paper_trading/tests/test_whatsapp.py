from __future__ import annotations

import base64
import io
from types import SimpleNamespace
from unittest.mock import MagicMock

from PIL import Image

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
        payload,
        classify(payload, SETTINGS),
        {
            "company_name": "Oracle Financial Services Software Ltd.",
            "ofactor": "78.345",
            "xfactor": "74.126",
            "rsi14": "61.876",
            "week52_high": "13220",
            "week52_low": "7042.20",
            "week52_position_pct": "73.841",
            "trendlyne_buy_recommendations": [
                {"house": "Axis Direct", "report_date": "2026-08-20", "target_price": "12500"}
            ],
            "entry_market_book": {
                "availability_status": "CAPTURED",
                "quote_ts": "2026-08-25T08:32:59+00:00",
                "quote_age_ms": "2000",
                "ltp": "11603.50",
                "last_trade_qty": "3",
                "cumulative_volume": "554982",
                "total_buy_qty": "146149",
                "total_sell_qty": "155900",
                "best_bid_price": "11603.00",
                "best_bid_qty": "7",
                "best_ask_price": "11604.00",
                "best_ask_qty": "8",
                "bid_levels": [
                    {"price": "11603", "quantity": "7", "orders": "1"},
                    {"price": "11602.5", "quantity": "113", "orders": "3"},
                    {"price": "11602", "quantity": "33", "orders": "1"},
                ],
                "ask_levels": [
                    {"price": "11604", "quantity": "8", "orders": "1"},
                    {"price": "11604.5", "quantity": "87", "orders": "1"},
                    {"price": "11605", "quantity": "20", "orders": "1"},
                ],
            },
        },
    )
    assert "*PAPER ENTRY*" in message
    assert "`LONG`" in message
    assert "*Oracle Financial Services Software Ltd. (OFSS)*" in message
    assert "O factor" in message and "78.35" in message
    assert "X factor" in message and "74.13" in message
    assert "RSI 14" in message and "61.88" in message
    assert "52W high" in message and "52W position" in message
    assert "*BUY* · Axis Direct" in message and "target ₹12,500.00" in message
    assert "*MARKET BOOK AT ENTRY*" in message
    assert "Best bid" in message and "₹11,603.00 × 7" in message
    assert "Best ask" in message and "₹11,604.00 × 8" in message
    assert "*TOP 3 BID / ASK*" in message
    assert "L3  BID ₹11,602.00 × 33 · 1" in message
    assert "Strategy `" not in message
    assert "monitoring targets" not in message
    assert "Simulation only" not in message and "No live order" not in message
    assert "MFE" not in message and "MAE" not in message
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
    chart = render_entry_chart(
        bars,
        "104.50",
        "TEST",
        {
            "company_name": "Test Industries",
            "ofactor": "80",
            "xfactor": "75",
            "rsi14": "63",
            "week52_high": "125",
            "week52_low": "80",
            "week52_position_pct": "54.44",
        },
    )
    assert chart and chart.startswith(b"\x89PNG\r\n\x1a\n")
    with Image.open(io.BytesIO(chart)) as rendered:
        assert rendered.size == (1080, 1350)
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
    profile_row = {"company_name": "Oracle Financial Services Software Ltd."}
    range_row = {"week52_high": "13220", "week52_low": "7042.20"}
    market_book_row = {
        "availability_status": "CAPTURED",
        "best_bid_price": "11603",
        "best_bid_qty": "7",
        "best_ask_price": "11604",
        "best_ask_qty": "8",
        "bid_levels": [{"level": 1, "price": "11603", "quantity": "7", "orders": "1"}],
        "ask_levels": [{"level": 1, "price": "11604", "quantity": "8", "orders": "1"}],
    }
    recommendations = [{"report_date": "2026-08-20", "house": "Axis Direct", "target_price": "12500"}]
    bar_rows = [{"open": "100", "high": "101", "low": "99", "close": "100.5"}]
    connection = MagicMock()
    connection.execute.return_value.fetchone.side_effect = [
        factor_row,
        instrument_row,
        profile_row,
        range_row,
        market_book_row,
    ]
    connection.execute.return_value.fetchall.side_effect = [recommendations, bar_rows]
    context = MagicMock()
    context.__enter__.return_value = connection
    database = MagicMock()
    database.connection.return_value = context

    factors, bars = load_entry_evidence(
        database,
        event(
            "com.papertrading.trade_leg.opened.v1",
            {
                "symbol": "OFSS",
                "side": "BUY",
                "fill_price": "11604",
                "fill_time": "2026-08-25T08:32:00+00:00",
                "trade_leg_id": "11111111-1111-1111-1111-111111111111",
            },
        ),
    )

    assert factors["ofactor"] == "80"
    assert factors["company_name"].startswith("Oracle")
    assert factors["trendlyne_buy_recommendations"] == recommendations
    assert factors["entry_market_book"] == market_book_row
    assert round(float(factors["week52_position_pct"]), 2) == 73.84
    assert bars == bar_rows
    instrument_sql = str(connection.execute.call_args_list[1].args[0])
    assert "tradingsymbol)=upper(%s || '-EQ')" in instrument_sql


def test_no_trendlyne_buy_is_explicit_and_target_message_uses_52_week_context() -> None:
    entry_event = event(
        "com.papertrading.trade_leg.opened.v1",
        {"symbol": "TEST", "side": "BUY", "fill_price": "100"},
    )
    entry_message = render_message(
        entry_event,
        classify(entry_event, SETTINGS),
        {"trendlyne_buy_recommendations": []},
    )
    assert "No BUY suggestions found" in entry_message

    target_event = event(
        "com.papertrading.target_track.closed.v1",
        {
            "symbol": "TEST",
            "side": "BUY",
            "entry_price": "100",
            "quantity": "250",
            "opened_at": "2026-08-25T07:58:00+00:00",
            "current_price": "101.20",
            "newly_closed_target_tracks": [
                {
                    "target_id": "INTRADAY_0.010",
                    "target_pct": "0.01",
                    "target_price": "101",
                    "observed_price": "101.20",
                    "hit_at": "2026-08-25T08:33:00+00:00",
                }
            ],
            "mfe": "0.05",
            "mae": "-0.02",
        },
    )
    target_message = render_message(
        target_event,
        classify(target_event, SETTINGS),
        {"week52_high": "120", "week52_low": "80", "week52_position_pct": "53"},
    )
    assert "52W high" in target_message and "52W low" in target_message
    assert "Time to hit" in target_message and "00:35" in target_message
    assert "Profit/share" in target_message and "+₹1.00" in target_message
    assert "Gross profit" in target_message and "+₹250.00" in target_message
    assert "MFE" not in target_message and "MAE" not in target_message


def test_swing_target_uses_rounded_days_and_short_directional_profit() -> None:
    target_event = event(
        "com.papertrading.target_track.closed.v1",
        {
            "symbol": "TEST",
            "side": "SELL",
            "entry_price": "200",
            "quantity": "10",
            "opened_at": "2026-08-23T06:00:00+00:00",
            "newly_closed_target_tracks": [
                {
                    "target_id": "SWING_0.030",
                    "target_pct": "0.03",
                    "target_price": "194",
                    "observed_price": "193.80",
                    "hit_at": "2026-08-25T09:00:00+00:00",
                }
            ],
        },
    )
    target_message = render_message(target_event, classify(target_event, SETTINGS))
    assert "Target type" in target_message and "Swing" in target_message
    assert "Time to hit" in target_message and "2 days" in target_message
    assert "Profit/share" in target_message and "+₹6.00" in target_message
    assert "Gross profit" in target_message and "+₹60.00" in target_message
    assert "MFE" not in target_message and "MAE" not in target_message


def test_daily_summary_exposes_open_intraday_and_swing_counts() -> None:
    summary_event = event(
        "com.papertrading.summary.daily.v1",
        {
            "summary": {
                "groups_open_current": 7,
                "groups_opened": 3,
                "groups_closed": 1,
                "intraday_trades_hit": 2,
                "intraday_trades_missed": 1,
                "swing_trades_hit": 1,
                "swing_trades_open": 5,
                "analytical_targets_hit": 4,
                "net_realised_pnl": "1250.50",
            }
        },
    )
    message = render_message(summary_event, classify(summary_event, SETTINGS))
    assert "Open trades" in message and "Intraday hit" in message
    assert "Swing hit" in message and "Swing open" in message
    assert "+₹1,250.50" in message
