from __future__ import annotations

import logging
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from typing import Any

from .config import Settings
from .contracts import render_whatsapp_message
from .providers import call_provider
from .repository import PROVIDERS, Repository
from .whatsapp import send_message

LOG = logging.getLogger("ai-stock-research")


class Runtime:
    def __init__(self, settings: Settings, repository: Repository | None = None) -> None:
        self.settings = settings
        self.repository = repository or Repository(settings.database_url)
        self.prompt = settings.prompt_path.read_text(encoding="utf-8").strip()
        self.repository.register_prompt(self.prompt)
        self.worker_id = f"ai-research-{uuid.uuid4()}"

    def close(self) -> None:
        self.repository.close()

    @property
    def models(self) -> dict[str, dict[str, str]]:
        return {
            "CLAUDE": {
                "model": self.settings.claude_model,
                "endpoint": self.settings.provider_endpoints["CLAUDE"],
            },
            "QWEN": {
                "model": self.settings.qwen_model,
                "endpoint": self.settings.provider_endpoints["QWEN"],
            },
            "DEEPSEEK": {
                "model": "DeepSeek Web Search",
                "endpoint": self.settings.provider_endpoints["DEEPSEEK"],
            },
        }

    def discover(self) -> dict[str, int]:
        result = self.repository.discover(self.settings.start_date, self.models)
        if result["new_evaluations"] or result["new_sources"]:
            LOG.info("candidate_discovery_completed", extra={"count": result["new_evaluations"]})
        return result

    def process_provider(self, provider: str) -> bool:
        row = self.repository.claim_provider(provider, f"{self.worker_id}-{provider.lower()}")
        if not row:
            return False
        started = time.monotonic()
        try:
            result = call_provider(
                provider,
                row["endpoint"],
                self.prompt,
                row["input_snapshot"],
                self.settings.claude_model,
                self.settings.qwen_model,
                self.settings.request_timeout_seconds,
            )
            message = render_whatsapp_message(
                provider, row["source_strategy"], row, result.parsed_output
            )
            duration_ms = int((time.monotonic() - started) * 1000)
            self.repository.provider_succeeded(
                row,
                result.request_payload,
                result.stored_response,
                result.output_text,
                result.parsed_output,
                message,
                result.chat_id,
                duration_ms,
                self.settings.delivery_enabled,
                self.settings.whatsapp_chat_id,
            )
            LOG.info(
                "provider_evaluation_succeeded",
                extra={
                    "provider": provider,
                    "evaluation_id": str(row["evaluation_id"]),
                    "symbol": row["symbol"],
                    "attempt": row["attempt_count"],
                    "duration_ms": duration_ms,
                },
            )
        except Exception as exc:
            state = self.repository.provider_failed(
                row, exc, self.settings.provider_max_attempts
            )
            log_method = LOG.warning if state == "DEAD" else LOG.debug
            log_method(
                "provider_evaluation_failed",
                extra={
                    "provider": provider,
                    "evaluation_id": str(row["evaluation_id"]),
                    "symbol": row["symbol"],
                    "attempt": row["attempt_count"],
                    "status": state,
                    "error_class": type(exc).__name__,
                },
            )
        return True

    def deliver_one(self) -> bool:
        if not self.settings.delivery_enabled:
            return False
        row = self.repository.claim_delivery(self.worker_id)
        if not row:
            return False
        status, excerpt, error, duration_ms = send_message(
            self.settings.whatsapp_url,
            self.settings.whatsapp_token,
            row,
        )
        state = self.repository.delivery_finished(
            row,
            status_code=status,
            response_excerpt=excerpt,
            error_class=error,
            duration_ms=duration_ms,
            max_attempts=self.settings.delivery_max_attempts,
        )
        if state == "DELIVERED":
            LOG.info(
                "research_message_delivered",
                extra={"evaluation_id": str(row["provider_evaluation_id"]), "duration_ms": duration_ms},
            )
        else:
            LOG.warning(
                "research_message_delivery_failed",
                extra={
                    "evaluation_id": str(row["provider_evaluation_id"]),
                    "attempt": row["attempt_count"],
                    "status": state,
                    "error_class": error,
                },
            )
        return True

    def run_once(self) -> dict[str, Any]:
        discovered = self.discover()
        with ThreadPoolExecutor(max_workers=3, thread_name_prefix="provider") as executor:
            provider_work = dict(
                zip(PROVIDERS, executor.map(self.process_provider, PROVIDERS), strict=True)
            )
        delivered = 0
        while delivered < 10 and self.deliver_one():
            delivered += 1
        result = {"discovery": discovered, "provider_work": provider_work, "delivered": delivered}
        self.repository.heartbeat("OK", result, True)
        return result

    def run_forever(self) -> None:
        LOG.info("service_started", extra={"status": "ENABLED" if self.settings.enabled else "DISABLED"})
        while True:
            if not self.settings.enabled:
                self.repository.heartbeat("DISABLED", {"start_date": self.settings.start_date}, True)
                time.sleep(max(60, self.settings.poll_seconds))
                continue
            try:
                self.run_once()
            except Exception as exc:
                self.repository.heartbeat(
                    "ERROR", {"error_class": type(exc).__name__}, False
                )
                LOG.exception("orchestrator_cycle_failed", extra={"error_class": type(exc).__name__})
            time.sleep(self.settings.poll_seconds)
