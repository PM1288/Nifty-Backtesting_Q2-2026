from dataclasses import replace
from datetime import date
from pathlib import Path

import pytest

from ai_stock_research.config import APPROVED_CONSOLIDATED_ENDPOINT, Settings


def settings() -> Settings:
    return Settings(
        database_url="postgresql://example",
        prompt_path=Path(__file__),
        start_date=date(2026, 9, 20),
        enabled=True,
        delivery_enabled=False,
        poll_seconds=15,
        request_timeout_seconds=600,
        research_max_attempts=1,
        delivery_max_attempts=8,
        log_level="INFO",
        whatsapp_url="https://gateway.example/webhook/send",
        whatsapp_token_file=Path("/unneeded/when/delivery/disabled"),
        whatsapp_chat_id="group@g.us",
        consolidated_endpoint=APPROVED_CONSOLIDATED_ENDPOINT,
        consolidation_provider="claude",
        consolidation_effort="high",
    )


def test_tailscale_final_only_endpoint_is_accepted() -> None:
    settings().validate()


def test_individual_or_non_tailscale_endpoint_is_rejected() -> None:
    with pytest.raises(ValueError, match="approved Tailscale URL"):
        replace(settings(), consolidated_endpoint="http://100.120.233.3:8009/query").validate()


def test_consolidation_route_values_are_allow_listed() -> None:
    with pytest.raises(ValueError, match="PROVIDER"):
        replace(settings(), consolidation_provider="qwen").validate()
    with pytest.raises(ValueError, match="EFFORT"):
        replace(settings(), consolidation_effort="ultra").validate()
