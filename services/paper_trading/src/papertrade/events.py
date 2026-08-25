from __future__ import annotations

import hashlib
import hmac
import json
import uuid
from datetime import UTC, datetime
from decimal import Decimal, InvalidOperation
from typing import Any

DEFAULT_WEBHOOK_EVENT_TYPES = {
    "com.papertrading.trade_intent.accepted.v1",
    "com.papertrading.trade_intent.rejected.v1",
    "com.papertrading.trade_leg.opened.v1",
    "com.papertrading.trade_leg.partially_closed.v1",
    "com.papertrading.trade_leg.closed.v1",
    "com.papertrading.trade_group.partially_closed.v1",
    "com.papertrading.trade_group.closed.v1",
    "com.papertrading.target_track.closed.v1",
    "com.papertrading.execution_target.hit.v1",
    "com.papertrading.observation.five_session_completed.v1",
    "com.papertrading.observation.thirty_session_completed.v1",
    "com.papertrading.market_data.stale.v1",
    "com.papertrading.market_data.recovered.v1",
    "com.papertrading.summary.daily.v1",
    "com.papertrading.summary.daily_corrected.v1",
    "com.papertrading.summary.weekly.v1",
    "com.papertrading.summary.weekly_corrected.v1",
    "com.papertrading.system.processing_error.v1",
    "com.papertrading.webhook.dead_lettered.v1",
}


def _plain_number(value: Any) -> str:
    if value in (None, ""):
        return ""
    try:
        decimal_value = Decimal(str(value))
    except (InvalidOperation, ValueError):
        return str(value)
    return format(decimal_value.normalize(), "f")


def _notification(event_type: str, data: dict[str, Any], context: dict[str, Any] | None = None) -> dict[str, Any]:
    context = context or {}
    symbol = str(context.get("symbol") or data.get("symbol") or "Portfolio")
    side = str(context.get("side") or data.get("side") or "").upper()
    quantity = _plain_number(data.get("fill_quantity") or context.get("remaining_quantity"))
    price = _plain_number(data.get("fill_price") or context.get("average_entry_price"))
    identity = " · ".join(part for part in (symbol, side, f"{quantity} units" if quantity else "") if part)
    title = "PAPER TRADE UPDATE"
    lines: list[str] = []
    category = "TRADE"
    if event_type.endswith("trade_intent.accepted.v1"):
        title, lines = "PAPER TRADE ACCEPTED", [identity, "Waiting for the next eligible paper fill."]
    elif event_type.endswith("trade_leg.opened.v1"):
        title = "PAPER POSITION OPENED"
        lines = [f"{identity} @ ₹{price}", "Targets: intraday +0.3 / +0.5 / +1% · swing +1 / +3 / +5%", "Observation: 5 and 30 trading sessions"]
    elif event_type.endswith("target_track.closed.v1"):
        title = "ANALYTICAL TARGET HIT"
        targets = data.get("newly_closed_target_tracks") or []
        target_text = ", ".join(f"{float(item.get('target_pct', 0)) * 100:g}%" for item in targets)
        lines = [identity, f"Targets reached: {target_text or 'see structured data'}", "The actual paper position remains separate from analytical tracking."]
    elif event_type.endswith("execution_target.hit.v1"):
        title, lines = "PAPER EXIT TRIGGERED", [identity, f"Execution target: {float(data.get('target_pct', 0)) * 100:g}%", f"Action: {data.get('execution_action', 'SEE DATA')}"]
    elif event_type.endswith("trade_group.closed.v1"):
        title, lines = "PAPER POSITION CLOSED", [identity, f"Net after tax provision: ₹{data.get('net_after_tax', '—')}", f"Costs: ₹{data.get('trading_costs', '—')}"]
    elif "five_session_completed" in event_type or "thirty_session_completed" in event_type:
        horizon = data.get("horizon_sessions", 5 if "five_" in event_type else 30)
        title, lines = f"{horizon}-SESSION OBSERVATION COMPLETE", [identity, f"Return: {float(data.get('closing_return', 0)) * 100:.2f}% · MFE: {float(data.get('mfe', 0)) * 100:.2f}% · MAE: {float(data.get('mae', 0)) * 100:.2f}%", f"Hypothetical after-tax P&L: ₹{data.get('after_tax_pnl', '—')}"]
    elif "market_data.stale" in event_type:
        category, title = "DATA", "PAPER MARKET DATA STALE"
        lines = [f"Affected instruments: {data.get('affected_count', 1)}", "New paper decisions are guarded until data recovers."]
    elif "market_data.recovered" in event_type:
        category, title = "DATA", "PAPER MARKET DATA RECOVERED"
        lines = [f"Recovered instruments: {data.get('affected_count', 1)}", "Normal paper monitoring has resumed."]
    elif ".summary." in event_type:
        category, title = "SUMMARY", "PAPER TRADING SUMMARY"
        summary = data.get("summary") or {}
        lines = [f"Requests: {summary.get('requests_received', 0)} · Opened: {summary.get('groups_opened', 0)} · Closed: {summary.get('groups_closed', 0)}", f"Gross realised P&L: ₹{summary.get('gross_realised_pnl', 0)}"]
    elif "rejected" in event_type:
        title, lines = "PAPER TRADE REJECTED", [identity, str(data.get("reason") or data.get("detail") or "See structured reason data.")]
    else:
        title, lines = "PAPER TRADING ALERT", [str(data.get("event_name") or event_type)]
    clean_lines = [line for line in lines if line and line.strip(" ·")]
    return {"category": category, "title": title, "message": "\n".join([title, *clean_lines]), "facts": clean_lines}


def canonical_json(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), default=str, ensure_ascii=False).encode()


def request_hash(value: Any) -> str:
    return hashlib.sha256(canonical_json(value)).hexdigest()


def sign(timestamp: str, body: bytes, secret: str) -> str:
    return hmac.new(secret.encode(), timestamp.encode() + b"." + body, hashlib.sha256).hexdigest()


def cloud_event(
    event_id: str, event_type: str, subject: str, correlation_id: str, sequence: int, data: dict[str, Any]
) -> dict[str, Any]:
    payload = {"environment": "PAPER", "display_label": "PAPER TRADE", **data}
    notification = payload.setdefault("notification", _notification(event_type, data))
    payload.setdefault("title", notification["title"])
    payload.setdefault("message", notification["message"])
    return {
        "specversion": "1.0",
        "id": event_id,
        "source": "urn:paper-trading-service",
        "type": event_type,
        "subject": subject,
        "time": datetime.now(UTC).isoformat(),
        "datacontenttype": "application/json",
        "dataschema": f"urn:papertrading:schema:{event_type}:1.0",
        "correlationid": correlation_id,
        "sequence": sequence,
        "data": payload,
    }


def append_event(
    conn: Any,
    schema: str,
    aggregate_type: str,
    aggregate_id: str,
    event_type: str,
    correlation_id: str,
    data: dict[str, Any],
) -> str:
    row = conn.execute(
        f"UPDATE {schema}.trade_groups SET event_sequence=event_sequence+1 WHERE trade_group_id=%s RETURNING event_sequence",
        (aggregate_id,),
    ).fetchone()
    if row:
        sequence = int(row["event_sequence"])
    else:
        prior = conn.execute(
            f"SELECT coalesce(max(sequence),0) n FROM {schema}.trade_events WHERE aggregate_id=%s",
            (aggregate_id,),
        ).fetchone()
        sequence = int(prior["n"]) + 1
    event_id = str(uuid.uuid4())
    subject = f"{aggregate_type.replace('_', '-')}/{aggregate_id}"
    context = conn.execute(
        f"""SELECT i.symbol,i.lot_size,l.side,l.total_units,l.remaining_quantity,
                   l.average_entry_price,l.average_exit_price,l.opened_at,l.closed_at,
                   g.strategy_id,g.strategy_version,g.client_group_id,sr.strategy_name,
                   o.mfe,o.mae,
                   (SELECT jsonb_build_object(
                               'target_code',d.target_code,'target_pct',d.target_pct,
                               'target_price',t.target_price,'lifecycle',d.lifecycle)
                      FROM {schema}.target_definitions d
                      JOIN {schema}.target_tracks t USING(target_definition_id)
                     WHERE d.trade_group_id=g.trade_group_id
                       AND t.trade_leg_id=l.trade_leg_id
                       AND d.lifecycle='INTRADAY'
                       AND d.execution_action<>'TRACK_ONLY'
                     ORDER BY d.target_pct LIMIT 1) AS active_exit_target,
                   (SELECT jsonb_build_object(
                               'target_code',d.target_code,'target_pct',d.target_pct,
                               'target_price',t.target_price,'lifecycle',d.lifecycle)
                      FROM {schema}.target_definitions d
                      JOIN {schema}.target_tracks t USING(target_definition_id)
                     WHERE d.trade_group_id=g.trade_group_id
                       AND t.trade_leg_id=l.trade_leg_id
                       AND d.lifecycle='SWING'
                       AND d.execution_action<>'TRACK_ONLY'
                     ORDER BY d.target_pct LIMIT 1) AS swing_exit_target,
                   (SELECT e.payload->'data'->>'target_id'
                      FROM {schema}.trade_events e
                     WHERE e.aggregate_id=g.trade_group_id
                       AND e.event_type='com.papertrading.execution_target.hit.v1'
                     ORDER BY e.sequence DESC LIMIT 1) AS last_execution_target_code
            FROM {schema}.trade_groups g
            LEFT JOIN {schema}.strategy_registry sr USING(strategy_id)
            LEFT JOIN {schema}.trade_legs l USING(trade_group_id)
            LEFT JOIN {schema}.instrument_snapshots i USING(instrument_snapshot_id)
            LEFT JOIN {schema}.observation_trackers o USING(trade_leg_id)
            WHERE g.trade_group_id=%s
            ORDER BY l.opened_at NULLS LAST,l.trade_leg_id LIMIT 1""",
        (aggregate_id,),
    ).fetchone()
    context_data = dict(context) if context else {}
    if context_data:
        data.setdefault("symbol", context_data.get("symbol"))
        data.setdefault("side", context_data.get("side"))
        data.setdefault("quantity", _plain_number(context_data.get("total_units")))
        data.setdefault("lot_size", _plain_number(context_data.get("lot_size")))
        data.setdefault("entry_price", _plain_number(context_data.get("average_entry_price")))
        data.setdefault("exit_price", _plain_number(context_data.get("average_exit_price")))
        data.setdefault("strategy_id", context_data.get("strategy_id"))
        data.setdefault("strategy_name", context_data.get("strategy_name"))
        data.setdefault("strategy_version", context_data.get("strategy_version"))
        data.setdefault("client_group_id", context_data.get("client_group_id"))
        data.setdefault("opened_at", context_data.get("opened_at"))
        data.setdefault("closed_at", context_data.get("closed_at"))
        data.setdefault("mfe", _plain_number(context_data.get("mfe")))
        data.setdefault("mae", _plain_number(context_data.get("mae")))
        data.setdefault("active_exit_target", context_data.get("active_exit_target"))
        data.setdefault("swing_exit_target", context_data.get("swing_exit_target"))
        data.setdefault("exit_reason_code", context_data.get("last_execution_target_code"))
    data = {**data, "notification": _notification(event_type, data, context_data)}
    envelope = cloud_event(event_id, event_type, subject, correlation_id, sequence, data)
    conn.execute(
        f"INSERT INTO {schema}.trade_events(event_id,aggregate_type,aggregate_id,sequence,event_type,correlation_id,subject,payload) VALUES (%s,%s,%s,%s,%s,%s,%s,%s::jsonb)",
        (
            event_id,
            aggregate_type,
            aggregate_id,
            sequence,
            event_type,
            correlation_id,
            subject,
            json.dumps(envelope, default=str),
        ),
    )
    subscriptions = conn.execute(
        f"SELECT subscription_id FROM {schema}.webhook_subscriptions WHERE enabled AND (cardinality(event_types)=0 OR %s=ANY(event_types))",
        (event_type,),
    ).fetchall()
    if not subscriptions and event_type in DEFAULT_WEBHOOK_EVENT_TYPES:
        conn.execute(
            f"INSERT INTO {schema}.webhook_outbox(event_id,subscription_id) VALUES (%s,NULL) ON CONFLICT DO NOTHING",
            (event_id,),
        )
    else:
        for item in subscriptions:
            conn.execute(
                f"INSERT INTO {schema}.webhook_outbox(event_id,subscription_id) VALUES (%s,%s) ON CONFLICT DO NOTHING",
                (event_id, item["subscription_id"]),
            )
    return event_id
