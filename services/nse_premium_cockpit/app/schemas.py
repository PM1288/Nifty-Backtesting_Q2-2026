from __future__ import annotations

from datetime import datetime
from pydantic import BaseModel, Field


class TickerItem(BaseModel):
    symbol: str
    last: float
    change_pct: float


class MarketState(BaseModel):
    ts: datetime
    index_symbol: str = "NIFTY50"
    index_last: float
    index_change_pct: float
    breadth_pct_advancers: float = Field(ge=0.0, le=1.0)
    breadth_pct_above_vwap: float = Field(ge=0.0, le=1.0)
    volatility_pulse: float = Field(ge=0.0, le=1.0)
    leadership_concentration: float = Field(ge=0.0, le=1.0)
    regime_label: str
    market_heat_score: float = Field(ge=0.0, le=100.0)


class LeaderPoint(BaseModel):
    symbol: str
    security_name: str
    residual_strength: float
    volume_ratio: float
    anomaly_score: float
    change_pct: float
    last: float


class StockSignal(BaseModel):
    symbol: str
    security_name: str
    bucket: str
    score: float
    change_pct: float
    last: float
    reason_tags: list[str]


class AnomalyItem(BaseModel):
    symbol: str
    security_name: str
    anomaly_score: float
    reasons: list[str]


class StockBar1m(BaseModel):
    ts: datetime
    symbol: str
    open: float
    high: float
    low: float
    close: float
    vwap: float
    volume: float


class StockDetail(BaseModel):
    symbol: str
    security_name: str
    sector: str | None = None
    last: float
    change_pct: float
    day_open: float
    day_high: float
    day_low: float
    bars: list[StockBar1m]


class Snapshot(BaseModel):
    ts: datetime
    ticker: list[TickerItem]
    market: MarketState
    leaders: list[LeaderPoint]
    ladder: list[StockSignal]
    anomalies: list[AnomalyItem]
