from __future__ import annotations

import hashlib
import json
import uuid
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_serializer

EventType = Literal[
    "market.open.snapshot.v1",
    "market.movers.snapshot.v1",
    "market.oiis.candidates.changed.v1",
    "market.close.snapshot.v1",
]


class Source(BaseModel):
    provider: str
    mode: Literal["CACHE", "DATABASE", "API"]


class Quality(BaseModel):
    status: Literal["VALID"] = "VALID"
    coverage_count: int
    expected_count: int
    max_age_seconds: int


class Envelope(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_: Literal["market-status-whatsapp.v1"] = Field(alias="schema", default="market-status-whatsapp.v1")
    event_id: uuid.UUID
    event_type: EventType
    environment: Literal["MARKET_INTELLIGENCE"] = "MARKET_INTELLIGENCE"
    trade_date: date
    generated_at: datetime
    data_as_of: datetime
    timezone: Literal["Asia/Kolkata"] = "Asia/Kolkata"
    dedupe_key: str
    correlation_id: uuid.UUID
    source: Source
    quality: Quality
    payload: dict[str, Any]

    @field_serializer("generated_at", "data_as_of")
    def serialize_timestamp(self, value: datetime) -> str:
        return value.astimezone(UTC).isoformat().replace("+00:00", "Z")

    @field_serializer("event_id", "correlation_id")
    def serialize_uuid(self, value: uuid.UUID) -> str:
        return str(value)

    @field_serializer("trade_date")
    def serialize_date(self, value: date) -> str:
        return value.isoformat()


def decimal_text(value: Decimal | str | int) -> str:
    return format(Decimal(str(value)), "f")


def fingerprint_membership(membership: dict[str, list[str]]) -> str:
    canonical = {
        "long": sorted({symbol.upper() for symbol in membership.get("long", [])}),
        "short": sorted({symbol.upper() for symbol in membership.get("short", [])}),
    }
    return hashlib.sha256(json.dumps(canonical, separators=(",", ":"), sort_keys=True).encode()).hexdigest()


def directional_memberships(membership: dict[str, list[str]]) -> set[str]:
    return {f"LONG:{symbol}" for symbol in membership.get("long", [])} | {
        f"SHORT:{symbol}" for symbol in membership.get("short", [])
    }


def build_envelope(
    *,
    event_type: EventType,
    trade_date: date,
    data_as_of: datetime,
    dedupe_key: str,
    source_provider: str,
    source_mode: Literal["CACHE", "DATABASE", "API"],
    coverage_count: int,
    expected_count: int,
    max_age_seconds: int,
    payload: dict[str, Any],
) -> Envelope:
    return Envelope(
        event_id=uuid.uuid5(uuid.NAMESPACE_URL, f"market-status-v1:{dedupe_key}"),
        event_type=event_type,
        trade_date=trade_date,
        generated_at=datetime.now(UTC),
        data_as_of=data_as_of,
        dedupe_key=dedupe_key,
        correlation_id=uuid.uuid4(),
        source=Source(provider=source_provider, mode=source_mode),
        quality=Quality(
            coverage_count=coverage_count,
            expected_count=expected_count,
            max_age_seconds=max_age_seconds,
        ),
        payload=payload,
    )
