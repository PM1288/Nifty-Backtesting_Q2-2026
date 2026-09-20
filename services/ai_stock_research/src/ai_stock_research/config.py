from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from urllib.parse import urlparse


APPROVED_CONSOLIDATED_ENDPOINT = "http://100.120.233.3:8012/query/final"


def _bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _required(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise ValueError(f"{name} is required")
    return value


@dataclass(frozen=True)
class Settings:
    database_url: str
    prompt_path: Path
    start_date: date
    enabled: bool
    delivery_enabled: bool
    poll_seconds: int
    request_timeout_seconds: int
    research_max_attempts: int
    delivery_max_attempts: int
    log_level: str
    whatsapp_url: str
    whatsapp_token_file: Path
    whatsapp_chat_id: str
    consolidated_endpoint: str
    consolidation_provider: str
    consolidation_effort: str

    @classmethod
    def from_env(cls) -> "Settings":
        settings = cls(
            database_url=_required("DATABASE_URL"),
            prompt_path=Path(os.getenv("AI_RESEARCH_PROMPT_PATH", "/app/prompts/system_prompt.md")),
            start_date=date.fromisoformat(_required("AI_RESEARCH_START_DATE")),
            enabled=_bool("AI_STOCK_RESEARCH_ENABLED", True),
            delivery_enabled=_bool("AI_STOCK_RESEARCH_DELIVERY_ENABLED", True),
            poll_seconds=max(5, int(os.getenv("AI_RESEARCH_POLL_SECONDS", "15"))),
            request_timeout_seconds=max(600, int(os.getenv("AI_RESEARCH_REQUEST_TIMEOUT_SECONDS", "600"))),
            research_max_attempts=max(
                1, int(os.getenv("AI_RESEARCH_CONSOLIDATED_MAX_ATTEMPTS", "1"))
            ),
            delivery_max_attempts=max(1, int(os.getenv("AI_RESEARCH_DELIVERY_MAX_ATTEMPTS", "8"))),
            log_level=os.getenv("LOG_LEVEL", "INFO").upper(),
            whatsapp_url=os.getenv(
                "WA_GATEWAY_URL", "https://wweb.noviusrailtech.com/webhook/send"
            ).strip(),
            whatsapp_token_file=Path(
                os.getenv("WA_GATEWAY_API_TOKEN_FILE", "/run/secrets/whatsapp_gateway_api_token")
            ),
            whatsapp_chat_id=os.getenv(
                "WA_MYSELF_CHAT_ID", "120363428118961288@g.us"
            ).strip(),
            consolidated_endpoint=os.getenv(
                "AI_RESEARCH_CONSOLIDATED_URL", APPROVED_CONSOLIDATED_ENDPOINT
            ).strip(),
            consolidation_provider=os.getenv(
                "AI_RESEARCH_CONSOLIDATION_PROVIDER", "claude"
            ).strip().lower(),
            consolidation_effort=os.getenv(
                "AI_RESEARCH_CONSOLIDATION_EFFORT", "high"
            ).strip().lower(),
        )
        settings.validate()
        return settings

    def validate(self) -> None:
        if not self.prompt_path.is_file():
            raise ValueError(f"AI research prompt does not exist: {self.prompt_path}")
        if self.consolidated_endpoint != APPROVED_CONSOLIDATED_ENDPOINT:
            raise ValueError(
                "consolidated endpoint must be the approved Tailscale URL "
                f"{APPROVED_CONSOLIDATED_ENDPOINT}"
            )
        if self.consolidation_provider not in {"claude", "chatgpt"}:
            raise ValueError("AI_RESEARCH_CONSOLIDATION_PROVIDER must be claude or chatgpt")
        if self.consolidation_effort not in {"standard", "high"}:
            raise ValueError("AI_RESEARCH_CONSOLIDATION_EFFORT must be standard or high")
        parsed = urlparse(self.whatsapp_url)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise ValueError("WA_GATEWAY_URL must be an absolute HTTP(S) URL")
        if self.delivery_enabled:
            if not self.whatsapp_chat_id.endswith("@g.us"):
                raise ValueError("WA_MYSELF_CHAT_ID must identify a WhatsApp group")
            if not self.whatsapp_token_file.is_file():
                raise ValueError("WhatsApp gateway token file is missing")
            if not self.whatsapp_token_file.read_text(encoding="utf-8").strip():
                raise ValueError("WhatsApp gateway token file is empty")

    @property
    def whatsapp_token(self) -> str:
        return self.whatsapp_token_file.read_text(encoding="utf-8").strip()
