from __future__ import annotations

import hashlib
import hmac
import json
import uuid
from datetime import UTC, datetime
from typing import Any


def canonical_json(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), default=str, ensure_ascii=False).encode()


def request_hash(value: Any) -> str:
    return hashlib.sha256(canonical_json(value)).hexdigest()


def sign(timestamp: str, body: bytes, secret: str) -> str:
    return hmac.new(secret.encode(), timestamp.encode() + b"." + body, hashlib.sha256).hexdigest()


def cloud_event(
    event_id: str, event_type: str, subject: str, correlation_id: str, sequence: int, data: dict[str, Any]
) -> dict[str, Any]:
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
        "data": {"environment": "PAPER", "display_label": "PAPER TRADE", **data},
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
    if not subscriptions:
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
