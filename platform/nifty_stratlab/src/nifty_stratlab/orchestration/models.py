from __future__ import annotations

from datetime import date, datetime, timezone
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from nifty_stratlab.util.hashing import stable_id


class ImmutableModel(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")


class RunStatus(StrEnum):
    PLANNED = "planned"
    RUNNING = "running"
    VALIDATING = "validating"
    VALIDATED = "validated"
    PUBLISHED = "published"
    FAILED = "failed"
    CANCELLED = "cancelled"


class ShardStatus(StrEnum):
    PLANNED = "planned"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class RunSpec(ImmutableModel):
    strategy_version_id: str
    data_snapshot_id: str
    feature_set_id: str
    feature_version: str
    fee_profile_id: str
    execution_model_id: str
    universe_snapshot_id: str
    date_start: date
    date_end: date
    symbols: tuple[str, ...]
    scenario_key: str
    simulation_config: dict[str, Any]
    code_hash: str
    random_seed: int = 0
    requested_by: str = "system"
    metadata: dict[str, Any] = Field(default_factory=dict)

    @field_validator("symbols", mode="before")
    @classmethod
    def normalise_symbols(cls, value):
        return tuple(sorted({str(item).strip().upper() for item in value if str(item).strip()}))

    @model_validator(mode="after")
    def validate_scope(self) -> "RunSpec":
        if self.date_end < self.date_start:
            raise ValueError("date_end precedes date_start")
        if not self.symbols:
            raise ValueError("at least one symbol is required")
        if len(set(self.symbols)) != len(self.symbols):
            raise ValueError("symbols must be unique")
        return self

    @property
    def run_id(self) -> str:
        return stable_id("run", self.model_dump(mode="json"), length=32)


class ShardSpec(ImmutableModel):
    run_id: str
    ordinal: int = Field(ge=0)
    date_start: date
    date_end: date
    symbols: tuple[str, ...]
    input_hash: str

    @model_validator(mode="after")
    def validate_shard(self) -> "ShardSpec":
        if self.date_end < self.date_start:
            raise ValueError("shard date_end precedes date_start")
        if not self.symbols:
            raise ValueError("shard requires symbols")
        return self

    @property
    def shard_id(self) -> str:
        return stable_id("shard", self.model_dump(mode="json"), length=32)


class RunRecord(BaseModel):
    model_config = ConfigDict(extra="forbid")

    spec: RunSpec
    status: RunStatus = RunStatus.PLANNED
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    started_at: datetime | None = None
    finished_at: datetime | None = None
    validation_status: str = "pending"
    published: bool = False
    summary: dict[str, Any] = Field(default_factory=dict)
    error: str | None = None


class ShardRecord(BaseModel):
    model_config = ConfigDict(extra="forbid")

    spec: ShardSpec
    status: ShardStatus = ShardStatus.PLANNED
    attempt_no: int = 0
    lease_owner: str | None = None
    lease_expires_at: datetime | None = None
    heartbeat_at: datetime | None = None
    cursor: dict[str, Any] = Field(default_factory=dict)
    output_uri: str | None = None
    output_checksum: str | None = None
    output_row_count: int = 0
    started_at: datetime | None = None
    finished_at: datetime | None = None
    error: str | None = None
