from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Source(StrictModel):
    service: str = Field(min_length=1, max_length=100)
    instance: str | None = None


class Strategy(StrictModel):
    strategy_id: str
    strategy_name: str
    strategy_family: str | None = None
    strategy_version: str
    strategy_run_id: str | None = None
    signal_id: str
    tags: list[str] = []


class Signal(StrictModel):
    occurred_at: datetime
    exchange_timezone: str = "Asia/Kolkata"
    direction: Literal["LONG", "SHORT", "MIXED"]
    confidence: Decimal | None = Field(default=None, ge=0, le=1)
    reason_codes: list[str] = []
    features: dict[str, Any] = {}


class PerformanceBasis(StrictModel):
    type: Literal[
        "NET_DEBIT", "PREMIUM_PAID", "CAPITAL_AT_RISK", "MARGIN_RESERVED", "ENTRY_NOTIONAL", "ABSOLUTE_BASIS"
    ]
    amount: Decimal | None = Field(default=None, gt=0)
    currency: str = "INR"


class TradeGroupSpec(StrictModel):
    client_group_id: str
    asset_class: Literal["EQUITY", "OPTION", "FUTURE"]
    expected_leg_count: int = Field(ge=1, le=32)
    group_entry_policy: Literal["ATOMIC", "ALL_OR_NONE", "INDEPENDENT"] = "ATOMIC"
    group_close_policy: Literal["ALL_LEGS", "INDEPENDENT", "NET_PNL"] = "ALL_LEGS"
    performance_basis: PerformanceBasis


class Instrument(StrictModel):
    instrument_id: str
    instrument_token: str | None = None
    exchange: str
    segment: Literal["CASH", "OPT", "FUT"]
    symbol: str
    isin: str | None = None
    underlying: str | None = None
    expiry: date | None = None
    strike: Decimal | None = None
    option_type: Literal["CALL", "PUT"] | None = None
    lot_size: Decimal = Field(gt=0)
    contract_multiplier: Decimal = Field(gt=0)
    currency: str = "INR"

    @model_validator(mode="after")
    def option_identity(self) -> Instrument:
        if self.segment == "OPT" and (
            self.expiry is None or self.strike is None or self.option_type is None or not self.underlying
        ):
            raise ValueError("option requires expiry, positive strike, option_type and underlying")
        if self.strike is not None and self.strike <= 0:
            raise ValueError("strike must be positive")
        return self


class Quantity(StrictModel):
    value: Decimal = Field(gt=0)
    unit: Literal["SHARES", "LOTS", "CONTRACT_UNITS"]


class EntryOrder(StrictModel):
    type: Literal["MARKET", "LIMIT", "STOP", "STOP_LIMIT"]
    limit_price: Decimal | None = Field(default=None, gt=0)
    stop_price: Decimal | None = Field(default=None, gt=0)
    time_in_force: Literal["DAY", "GTC"] = "DAY"
    price_source: Literal["NEXT_AVAILABLE_BAR_OPEN", "LATEST_TRADABLE", "EXPLICIT"] = (
        "NEXT_AVAILABLE_BAR_OPEN"
    )
    explicit_price: Decimal | None = Field(default=None, gt=0)

    @model_validator(mode="after")
    def required_prices(self) -> EntryOrder:
        if self.type in {"LIMIT", "STOP_LIMIT"} and self.limit_price is None:
            raise ValueError("limit price required")
        if self.type in {"STOP", "STOP_LIMIT"} and self.stop_price is None:
            raise ValueError("stop price required")
        if self.price_source == "EXPLICIT" and self.explicit_price is None:
            raise ValueError("explicit price required")
        return self


class Leg(StrictModel):
    client_leg_id: str
    role: str = "PRIMARY"
    position_effect: Literal["OPEN"] = "OPEN"
    instrument: Instrument
    side: Literal["BUY", "SELL"]
    quantity: Quantity
    entry_order: EntryOrder


class ExitRule(StrictModel):
    rule_id: str
    kind: Literal["TARGET_PCT", "STOP_PCT", "TRAILING_STOP_PCT", "TIME", "GROUP_NET_PNL"]
    value: Decimal
    action: Literal["TRACK_ONLY", "PARTIAL_CLOSE", "FULL_CLOSE"]
    quantity_pct: Decimal | None = Field(default=None, gt=0, le=1)


class ExecutionPolicy(StrictModel):
    mode: Literal["EXTERNAL_EXIT", "RULES"] = "EXTERNAL_EXIT"
    intraday_square_off: bool = False
    square_off_time: str | None = None
    exit_rules: list[ExitRule] = []


class AnalyticsPolicy(StrictModel):
    apply_default_ladders: bool = True
    intraday_targets_pct: list[Decimal] = [Decimal("0.003"), Decimal("0.005"), Decimal("0.010")]
    swing_targets_pct: list[Decimal] = [Decimal("0.010"), Decimal("0.030"), Decimal("0.050")]
    horizons_trading_sessions: list[int] = [5, 30]
    track_after_execution_close: bool = True
    snapshot_cadence: Literal["EVENTS_ONLY", "EVENTS_AND_EOD", "EVERY_BAR"] = "EVENTS_AND_EOD"

    @model_validator(mode="after")
    def valid_targets(self) -> AnalyticsPolicy:
        values = self.intraday_targets_pct + self.swing_targets_pct
        if any(value <= 0 for value in values):
            raise ValueError("target percentages must be positive")
        if len(set(values)) < max(len(self.intraday_targets_pct), len(self.swing_targets_pct)):
            pass
        return self


class TradeIntent(StrictModel):
    schema_version: Literal["1.0"]
    client_event_id: str
    account_id: str
    environment: Literal["PAPER"]
    source: Source
    strategy: Strategy
    signal: Signal
    trade_group: TradeGroupSpec
    legs: list[Leg]
    execution_policy: ExecutionPolicy
    analytics_policy: AnalyticsPolicy
    cost_profile_id: str
    tax_profile_id: str
    metadata: dict[str, Any] = {}

    @model_validator(mode="after")
    def group_valid(self) -> TradeIntent:
        if self.trade_group.expected_leg_count != len(self.legs):
            raise ValueError("expected_leg_count must equal legs")
        if self.trade_group.asset_class == "OPTION" and any(
            leg.instrument.segment != "OPT" for leg in self.legs
        ):
            raise ValueError("OPTION group requires option legs")
        if self.trade_group.asset_class == "EQUITY" and (
            len(self.legs) != 1 or self.legs[0].instrument.segment != "CASH"
        ):
            raise ValueError("EQUITY group requires one cash leg")
        if any(
            leg.instrument.expiry and leg.instrument.expiry <= self.signal.occurred_at.date()
            for leg in self.legs
        ):
            raise ValueError("instrument expiry must be after signal date")
        return self


class BuildingGroupRequest(StrictModel):
    schema_version: Literal["1.0"]
    client_event_id: str
    account_id: str
    environment: Literal["PAPER"]
    source: Source
    strategy: Strategy
    signal: Signal
    trade_group: TradeGroupSpec
    execution_policy: ExecutionPolicy
    analytics_policy: AnalyticsPolicy
    cost_profile_id: str
    tax_profile_id: str
    metadata: dict[str, Any] = {}


class CloseLeg(StrictModel):
    client_leg_id: str
    quantity: Decimal = Field(gt=0)


class CloseIntent(StrictModel):
    schema_version: Literal["1.0"]
    client_event_id: str
    occurred_at: datetime
    reason: Literal["STRATEGY_EXIT", "MANUAL", "TARGET", "STOP", "TIME", "EXPIRY"]
    scope: Literal["GROUP", "LEGS"]
    price_policy: Literal["NEXT_AVAILABLE_BAR_OPEN", "LATEST_TRADABLE"]
    legs: list[CloseLeg] = []
    metadata: dict[str, Any] = {}


class Problem(BaseModel):
    type: str
    title: str
    status: int
    detail: str
    instance: str | None = None
