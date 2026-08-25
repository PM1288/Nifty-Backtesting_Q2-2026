from __future__ import annotations

from datetime import time
from pathlib import Path
from zoneinfo import ZoneInfo

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=None, extra="ignore")

    database_url: str = Field(alias="DATABASE_URL")
    notifications_enabled: bool = Field(False, alias="MARKET_STATUS_NOTIFICATIONS_ENABLED")
    dry_run: bool = Field(True, alias="MARKET_STATUS_DRY_RUN")
    timezone_name: str = Field("Asia/Kolkata", alias="MARKET_STATUS_TIMEZONE")
    destination_key: str = Field("market-status-whatsapp", alias="MARKET_STATUS_DESTINATION_KEY")
    webhook_url: str = Field("", alias="MARKET_STATUS_WEBHOOK_URL")
    webhook_username: str = Field("", alias="MARKET_STATUS_WEBHOOK_USERNAME")
    webhook_password: str = Field("", alias="MARKET_STATUS_WEBHOOK_PASSWORD")
    webhook_timeout_seconds: float = Field(10, alias="MARKET_STATUS_WEBHOOK_TIMEOUT_SECONDS")
    webhook_max_attempts: int = Field(6, alias="MARKET_STATUS_WEBHOOK_MAX_ATTEMPTS")
    schema_path: Path = Field(
        Path("/app/schemas/market-status-whatsapp.v1.schema.json"), alias="MARKET_STATUS_SCHEMA_PATH"
    )
    poll_seconds: int = Field(5, alias="MARKET_STATUS_POLL_SECONDS")

    market_open_send_time: time = Field(time(9, 16, 5), alias="MARKET_OPEN_SEND_TIME_IST")
    market_open_retry_deadline: time = Field(time(9, 18), alias="MARKET_OPEN_RETRY_DEADLINE_IST")
    movers_send_time: time = Field(time(9, 20, 5), alias="MARKET_MOVERS_SEND_TIME_IST")
    movers_retry_deadline: time = Field(time(9, 22), alias="MARKET_MOVERS_RETRY_DEADLINE_IST")
    movers_count: int = Field(3, alias="MARKET_MOVERS_COUNT")
    close_trigger_time: time = Field(time(15, 30), alias="MARKET_CLOSE_TRIGGER_TIME_IST")
    close_final_not_before: time = Field(time(15, 42), alias="MARKET_CLOSE_FINAL_NOT_BEFORE_IST")
    close_final_deadline: time = Field(time(15, 50), alias="MARKET_CLOSE_FINAL_DEADLINE_IST")
    close_delayed_cutoff: time = Field(time(18), alias="MARKET_CLOSE_DELAYED_CUTOFF_IST")

    index_max_age_seconds: int = Field(30, alias="MARKET_INDEX_MAX_AGE_SECONDS")
    constituent_max_age_seconds: int = Field(60, alias="MARKET_CONSTITUENT_MAX_AGE_SECONDS")
    required_constituent_count: int = Field(50, alias="MARKET_REQUIRED_CONSTITUENT_COUNT")
    required_fresh_quote_count: int = Field(50, alias="MARKET_REQUIRED_FRESH_QUOTE_COUNT")

    oiis_enabled: bool = Field(True, alias="OIIS_MARKET_NOTIFICATIONS_ENABLED")
    oiis_x_min_exclusive: str = Field("70", alias="OIIS_X_MIN_EXCLUSIVE")
    oiis_o_min_exclusive: str = Field("70", alias="OIIS_O_MIN_EXCLUSIVE")
    oiis_max_per_direction: int = Field(3, alias="OIIS_MAX_PER_DIRECTION")
    oiis_max_run_age_seconds: int = Field(300, alias="OIIS_MAX_RUN_AGE_SECONDS")
    oiis_notify_on_score_only_change: bool = Field(False, alias="OIIS_NOTIFY_ON_SCORE_ONLY_CHANGE")
    oiis_notify_on_rank_only_change: bool = Field(False, alias="OIIS_NOTIFY_ON_RANK_ONLY_CHANGE")
    oiis_send_clear_event: bool = Field(False, alias="OIIS_SEND_CLEAR_EVENT")

    ops_alerts_enabled: bool = Field(False, alias="MARKET_STATUS_OPS_ALERTS_ENABLED")
    ops_webhook_url: str = Field("", alias="MARKET_STATUS_OPS_WEBHOOK_URL")
    threshold_alerts_enabled: bool = Field(False, alias="MARKET_THRESHOLD_ALERTS_ENABLED")
    threshold_alert_percentages: str = Field(
        "1.0,1.5,2.0", alias="MARKET_THRESHOLD_ALERT_PERCENTAGES"
    )
    include_vix: bool = Field(False, alias="MARKET_INCLUDE_VIX")
    close_include_final_movers: bool = Field(False, alias="MARKET_CLOSE_INCLUDE_FINAL_MOVERS")

    @field_validator("timezone_name")
    @classmethod
    def valid_timezone(cls, value: str) -> str:
        ZoneInfo(value)
        if value != "Asia/Kolkata":
            raise ValueError("V1 requires Asia/Kolkata")
        return value

    @field_validator("movers_count", "oiis_max_per_direction")
    @classmethod
    def bounded_counts(cls, value: int) -> int:
        if not 1 <= value <= 10:
            raise ValueError("count must be between 1 and 10")
        return value

    @property
    def timezone(self) -> ZoneInfo:
        return ZoneInfo(self.timezone_name)

    def delivery_ready(self) -> bool:
        if not self.notifications_enabled or self.dry_run:
            return True
        return bool(self.webhook_url and self.webhook_username and self.webhook_password)
