from __future__ import annotations

from datetime import date, datetime, time
from decimal import Decimal
from enum import StrEnum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class FrozenModel(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")


class InstrumentKind(StrEnum):
    EQUITY = "equity"
    INDEX = "index"
    FUTURE = "future"
    OPTION = "option"
    VIX = "vix"


class OptionRight(StrEnum):
    CALL = "CE"
    PUT = "PE"


class ProductType(StrEnum):
    EQUITY_INTRADAY = "equity_intraday"
    EQUITY_DELIVERY = "equity_delivery"
    INDEX_OPTION = "index_option"
    STOCK_OPTION = "stock_option"


class Side(StrEnum):
    BUY = "buy"
    SELL = "sell"


class DecisionState(StrEnum):
    NO_TRADE = "NO_TRADE"
    WATCH = "WATCH"
    ELIGIBLE = "ELIGIBLE"


class InstrumentKey(FrozenModel):
    instrument_id: str
    exchange: str = "NSE"
    segment: str
    symbol: str
    series: str | None = None
    kind: InstrumentKind
    expiry: date | None = None
    strike: Decimal | None = None
    option_right: OptionRight | None = None
    lot_size: int = 1
    tick_size: Decimal = Decimal("0.05")
    active_from: datetime | None = None
    active_to: datetime | None = None
    source_token: str | None = None

    @model_validator(mode="after")
    def validate_derivative_fields(self) -> "InstrumentKey":
        if self.kind == InstrumentKind.OPTION:
            if self.expiry is None or self.strike is None or self.option_right is None:
                raise ValueError("options require expiry, strike and option_right")
            if self.lot_size <= 0:
                raise ValueError("option lot_size must be positive")
        if self.tick_size <= 0:
            raise ValueError("tick_size must be positive")
        return self


class MarketBar(FrozenModel):
    instrument_id: str
    symbol: str
    event_ts: datetime
    available_at: datetime
    interval: str
    open: Decimal
    high: Decimal
    low: Decimal
    close: Decimal
    volume: int = 0
    turnover: Decimal | None = None
    trades: int | None = None
    vwap: Decimal | None = None
    source: str
    source_version: str
    quality_flags: tuple[str, ...] = ()

    @field_validator("event_ts", "available_at")
    @classmethod
    def require_timezone(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("timestamps must be timezone-aware")
        return value

    @model_validator(mode="after")
    def validate_ohlc(self) -> "MarketBar":
        if min(self.open, self.high, self.low, self.close) <= 0:
            raise ValueError("OHLC values must be positive")
        if self.high < max(self.open, self.close, self.low):
            raise ValueError("high is inconsistent with OHLC")
        if self.low > min(self.open, self.close, self.high):
            raise ValueError("low is inconsistent with OHLC")
        if self.available_at < self.event_ts:
            raise ValueError("available_at cannot precede event_ts")
        if self.volume < 0:
            raise ValueError("volume cannot be negative")
        return self


class SessionProfile(FrozenModel):
    profile_id: str
    exchange: str = "NSE"
    segment: str
    timezone: str = "Asia/Kolkata"
    effective_from: date
    effective_to: date | None = None
    pre_open_start: time | None = None
    regular_open: time
    regular_close: time
    expiry_close: time | None = None
    bar_timestamp_semantics: Literal["bar_start", "bar_end"] = "bar_start"
    bar_close_inclusive: bool = False

    @model_validator(mode="after")
    def validate_range(self) -> "SessionProfile":
        if self.effective_to is not None and self.effective_to < self.effective_from:
            raise ValueError("effective_to precedes effective_from")
        if self.regular_close <= self.regular_open:
            raise ValueError("regular_close must be after regular_open")
        return self


class ExpiryRule(FrozenModel):
    rule_id: str
    underlying_scope: str
    frequency: Literal["weekly", "monthly"]
    weekday: int = Field(ge=0, le=6)
    effective_from: date
    effective_to: date | None = None
    holiday_adjustment: Literal["previous_trading_day", "next_trading_day"] = "previous_trading_day"


class DataSnapshot(FrozenModel):
    snapshot_id: str
    created_at: datetime
    as_of: datetime
    source_hashes: dict[str, str]
    schema_fingerprints: dict[str, str] = Field(default_factory=dict)
    quality_status: Literal["PASS", "WARN", "FAIL"]
    notes: str | None = None


class FeatureSnapshot(FrozenModel):
    instrument_id: str
    symbol: str
    event_ts: datetime
    available_at: datetime
    feature_set_id: str
    feature_version: str
    values: dict[str, float | int | bool | str | None]
    quality_flags: tuple[str, ...] = ()

    @field_validator("event_ts", "available_at")
    @classmethod
    def require_timezone(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("timestamps must be timezone-aware")
        return value

    @model_validator(mode="after")
    def validate_availability(self) -> "FeatureSnapshot":
        if self.available_at < self.event_ts:
            raise ValueError("available_at cannot precede event_ts")
        return self


class SignalIntent(FrozenModel):
    signal_id: str
    strategy_version_id: str
    instrument_id: str
    symbol: str
    decision_ts: datetime
    available_at: datetime
    side: Side
    intent_type: Literal["enter", "exit", "carry_review"]
    reason_codes: tuple[str, ...]
    feature_snapshot_id: str | None = None
    confidence_score: float | None = Field(default=None, ge=0, le=1)
    metadata: dict[str, Any] = Field(default_factory=dict)

    @field_validator("decision_ts", "available_at")
    @classmethod
    def signal_timezone(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("signal timestamps must be timezone-aware")
        return value


class OrderIntent(FrozenModel):
    order_intent_id: str
    signal_id: str
    instrument_id: str
    symbol: str
    side: Side
    quantity: int = Field(gt=0)
    order_type: Literal["market", "limit", "stop"]
    submit_after: datetime
    limit_price: Decimal | None = None
    stop_price: Decimal | None = None
    product: ProductType
    metadata: dict[str, Any] = Field(default_factory=dict)


class CostBreakdown(FrozenModel):
    entry_value: Decimal
    exit_value: Decimal
    turnover: Decimal
    gross_pnl: Decimal
    brokerage: Decimal
    stt: Decimal
    exchange_transaction_charge: Decimal
    sebi_charge: Decimal
    ipft_charge: Decimal = Decimal("0")
    stamp_duty: Decimal
    gst: Decimal
    dp_charge: Decimal = Decimal("0")
    slippage: Decimal = Decimal("0")
    impact: Decimal = Decimal("0")
    total_cost: Decimal
    net_pnl: Decimal


class TradeResult(FrozenModel):
    trade_id: str
    strategy_version_id: str
    symbol: str
    entry_ts: datetime
    exit_ts: datetime
    entry_price: Decimal
    exit_price: Decimal
    quantity: int
    exit_reason: str
    gross_pnl: Decimal
    net_pnl: Decimal
    cost: CostBreakdown
    bars_held: int
    ambiguous_path: bool = False
    metadata: dict[str, Any] = Field(default_factory=dict)
