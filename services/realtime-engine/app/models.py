from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class TickerItem(BaseModel):
    symbol: str
    last: float
    change_pct: float


class BreadthState(BaseModel):
    pct_up: float = Field(ge=0.0, le=1.0)
    pct_above_vwap: float = Field(ge=0.0, le=1.0)
    pct_new_highs: float = Field(ge=0.0, le=1.0)
    pct_new_lows: float = Field(ge=0.0, le=1.0)
    up_volume_ratio: float = Field(ge=0.0)
    down_volume_ratio: float = Field(ge=0.0)
    volume_dispersion: float = Field(ge=0.0)


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
    volatility_ratio: float = Field(ge=0.0)
    pct_new_highs: float = Field(ge=0.0, le=1.0, default=0.0)
    pct_new_lows: float = Field(ge=0.0, le=1.0, default=0.0)
    up_volume_ratio: float = Field(ge=0.0, default=0.0)
    down_volume_ratio: float = Field(ge=0.0, default=0.0)
    volume_dispersion: float = Field(ge=0.0, default=0.0)
    participation_label: str | None = None


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
    signal_bucket: str | None = None
    residual_strength: float = 0.0
    volume_ratio: float = 0.0
    delivery_ratio: float = 0.0
    trend_score: float = 0.0
    conviction_score: float = 0.0
    risk_score: float = 0.0
    event_score: float = 0.0
    anomaly_score: float = 0.0


class StockSnapshot(BaseModel):
    symbol: str
    security_name: str
    sector: str | None = None
    price: float
    change_pct: float
    volume: float
    vwap: float
    residual_strength: float
    anomaly_score: float
    signal_bucket: str
    volume_ratio: float
    delivery_ratio: float
    trend_score: float
    conviction_score: float
    risk_score: float
    event_score: float
    momentum_5m: float = 0.0
    momentum_15m: float = 0.0
    momentum_30m: float = 0.0
    above_vwap: bool = False


class Snapshot(BaseModel):
    ts: datetime
    timestamp: datetime
    ticker: list[TickerItem]
    market: MarketState
    market_state: MarketState
    breadth: BreadthState
    leaders: list[LeaderPoint]
    ladder: list[StockSignal]
    anomalies: list[AnomalyItem]
    stocks: list[StockSnapshot]
