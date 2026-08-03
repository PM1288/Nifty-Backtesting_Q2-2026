from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class AnalystResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    pack_id: str
    analyst_name: str
    produced_at: datetime
    symbol: str
    stance: Literal["avoid", "watch", "eligible", "insufficient_evidence"]
    expected_direction: Literal["up", "down", "uncertain"]
    confidence: float | None = Field(default=None, ge=0, le=1)
    time_horizon: str
    thesis: str
    supporting_evidence: tuple[str, ...]
    contrary_evidence: tuple[str, ...]
    invalidation_conditions: tuple[str, ...]
    source_references: tuple[str, ...]
    limitations: tuple[str, ...] = ()
    order_authority: bool = False
