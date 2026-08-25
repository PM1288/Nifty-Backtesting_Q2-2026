from __future__ import annotations

import hashlib
from decimal import Decimal
from functools import lru_cache
from typing import Literal

from pydantic import AnyHttpUrl, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=None, case_sensitive=True, extra="ignore")

    PAPER_TRADING_ONLY: bool
    DATABASE_URL: SecretStr
    MARKET_DATA_DATABASE_URL: SecretStr | None = None
    PAPER_TRADING_SCHEMA: str = "paper_trading"
    API_SERVICE_TOKENS: SecretStr
    EXCHANGE_TIMEZONE: str = "Asia/Kolkata"
    MARKET_DATA_SCHEMA: str = "public"
    MARKET_DATA_BAR_TABLE: str = "bars_1m"
    MARKET_DATA_INSTRUMENT_TABLE: str = "instruments"
    POLL_INTERVAL_SECONDS: Decimal = Decimal("2")
    MARKET_DATA_STALE_SECONDS: int = 360
    SAME_BAR_AMBIGUITY_POLICY: Literal["WORST_CASE", "TARGET_FIRST", "STOP_FIRST"] = "WORST_CASE"
    DEFAULT_ACCOUNT_ID: str = "paper-main"
    STARTING_PAPER_CAPITAL: Decimal = Decimal("1600000")
    DEFAULT_INCOME_TAX_RATE: Decimal = Decimal("0.35")
    N8N_WEBHOOK_URL: AnyHttpUrl
    N8N_CRITICAL_WEBHOOK_URL: AnyHttpUrl | None = None
    N8N_BASIC_USERNAME: str
    N8N_BASIC_PASSWORD: SecretStr
    WEBHOOK_SIGNING_SECRET: SecretStr
    WEBHOOK_TIMEOUT_SECONDS: Decimal = Decimal("10")
    WEBHOOK_MAX_ATTEMPTS: int = 12
    WEBHOOK_BASE_RETRY_SECONDS: int = 5
    DAILY_SUMMARY_TIME: str = "16:00"
    WEEKLY_SUMMARY_DAY: int = 5
    WEEKLY_SUMMARY_TIME: str = "10:00"
    VALUATION_SNAPSHOT_MODE: Literal["EVENTS_ONLY", "EVENTS_AND_EOD", "EVERY_BAR"] = "EVENTS_AND_EOD"
    LOG_LEVEL: str = "INFO"
    METRICS_ENABLED: bool = True

    @field_validator(
        "PAPER_TRADING_SCHEMA", "MARKET_DATA_SCHEMA", "MARKET_DATA_BAR_TABLE", "MARKET_DATA_INSTRUMENT_TABLE"
    )
    @classmethod
    def safe_identifier(cls, value: str) -> str:
        if not value.replace("_", "").isalnum() or value[0].isdigit():
            raise ValueError("must be a safe SQL identifier")
        return value

    @model_validator(mode="after")
    def paper_only(self) -> Settings:
        if self.PAPER_TRADING_ONLY is not True:
            raise ValueError("PAPER_TRADING_ONLY=true is mandatory; no live path exists")
        if not self.API_SERVICE_TOKENS.get_secret_value().strip():
            raise ValueError("API_SERVICE_TOKENS is mandatory")
        if len(self.WEBHOOK_SIGNING_SECRET.get_secret_value()) < 24:
            raise ValueError("WEBHOOK_SIGNING_SECRET must contain at least 24 characters")
        if not (Decimal("0") <= self.DEFAULT_INCOME_TAX_RATE <= Decimal("1")):
            raise ValueError("DEFAULT_INCOME_TAX_RATE must be between 0 and 1")
        return self

    @property
    def database_url(self) -> str:
        return self.DATABASE_URL.get_secret_value()

    @property
    def market_database_url(self) -> str:
        return (
            self.MARKET_DATA_DATABASE_URL.get_secret_value()
            if self.MARKET_DATA_DATABASE_URL
            else self.database_url
        )

    def token_hashes(self) -> set[str]:
        return {
            hashlib.sha256(item.strip().encode()).hexdigest()
            for item in self.API_SERVICE_TOKENS.get_secret_value().split(",")
            if item.strip()
        }


@lru_cache
def get_settings() -> Settings:
    return Settings()
