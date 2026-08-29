from types import SimpleNamespace

from ai_stock_research.runtime import Runtime


class FailedProviderRepository:
    def __init__(self) -> None:
        self.failed = False
        self.succeeded = False

    def claim_provider(self, provider: str, worker_id: str) -> dict:
        return {
            "provider_evaluation_id": "provider-1",
            "evaluation_id": "evaluation-1",
            "endpoint": "http://100.120.233.3:8009/query",
            "input_snapshot": {},
            "source_strategy": "OIIS",
            "symbol": "SBIN",
            "attempt_count": 1,
        }

    def provider_failed(self, row: dict, exc: Exception, max_attempts: int) -> str:
        self.failed = True
        return "RETRY"

    def provider_succeeded(self, *args: object, **kwargs: object) -> None:
        self.succeeded = True


def test_provider_failure_never_creates_a_delivery(monkeypatch) -> None:
    repository = FailedProviderRepository()
    runtime = Runtime.__new__(Runtime)
    runtime.repository = repository
    runtime.worker_id = "test-worker"
    runtime.prompt = "Return JSON only"
    runtime.settings = SimpleNamespace(
        claude_model="Sonnet 5",
        qwen_model="Qwen3.7-Plus",
        request_timeout_seconds=1,
        provider_max_attempts=5,
        delivery_enabled=True,
        whatsapp_chat_id="group@g.us",
    )

    def fail_call(*args: object, **kwargs: object) -> None:
        raise RuntimeError("provider unavailable")

    monkeypatch.setattr("ai_stock_research.runtime.call_provider", fail_call)
    assert runtime.process_provider("CLAUDE") is True
    assert repository.failed is True
    assert repository.succeeded is False
