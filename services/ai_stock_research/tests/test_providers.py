import json

import httpx

from ai_stock_research.providers import build_request, call_provider


PROMPT = "Return labelled lines only."
INPUT = {
    "analysis_date": "2026-08-29",
    "stock": {"symbol": "SBIN"},
    "strategy_snapshot": {"ofactor": 78, "xfactor": 74},
    "history_30d": [],
}
OUTPUT = {
    "schema_version": "1.0",
    "symbol": "SBIN",
    "analysis_date": "2026-08-29",
    "verdict": "WAIT",
    "confidence": 65,
    "news_signal": "MIXED",
    "summary": "Mixed current evidence.",
    "key_driver": "Stable business trend.",
    "key_risk": "Pending event risk.",
    "entry_view": "Wait for confirmation.",
    "invalidation": "Material deterioration.",
    "evidence": [],
    "data_quality_note": "",
}


def test_provider_payloads_use_each_verified_api_contract() -> None:
    claude = build_request("CLAUDE", PROMPT, INPUT, "Sonnet 5", "Qwen3.7-Plus")
    qwen = build_request("QWEN", PROMPT, INPUT, "Sonnet 5", "Qwen3.7-Plus")
    deepseek = build_request("DEEPSEEK", PROMPT, INPUT, "Sonnet 5", "Qwen3.7-Plus")
    assert claude["reasoning_effort"] == "medium" and claude["model"] == "Sonnet 5"
    assert qwen["model"] == "Qwen3.7-Plus" and "reasoning_effort" not in qwen
    assert deepseek["search"] is True and deepseek["deep_think"] is False
    assert "Do not return JSON or Markdown" in claude["prompt"]


def test_provider_response_is_validated_and_private_thinking_is_not_stored() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        payload = json.loads(request.content)
        assert payload["system_instruction"] == PROMPT
        return httpx.Response(
            200,
            json={
                "status": "success",
                "chat_id": "chat-1",
                "output": json.dumps(OUTPUT),
                "thinking": "private trace must not be stored",
            },
        )

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        result = call_provider(
            "DEEPSEEK",
            "http://100.120.233.3:8011/query",
            PROMPT,
            INPUT,
            "Sonnet 5",
            "Qwen3.7-Plus",
            30,
            client,
        )
    assert result.parsed_output["verdict"] == "WAIT"
    assert "thinking" not in result.stored_response
    assert result.stored_response["thinking_present"] is True


def test_provider_accepts_the_new_plain_text_wire_format() -> None:
    output = """SYMBOL: SBIN
DATE: 2026-08-29
VERDICT: WAIT
CONFIDENCE: 65
NEWS: MIXED
SUMMARY: Mixed current evidence.
DRIVER: Stable business trend.
RISK: Pending event risk.
ENTRY: Wait for confirmation.
INVALIDATION: Material deterioration.
QUALITY: Current sources checked."""
    with httpx.Client(
        transport=httpx.MockTransport(
            lambda request: httpx.Response(200, json={"status": "success", "output": output})
        )
    ) as client:
        result = call_provider(
            "CLAUDE", "http://100.120.233.3:8009/query", PROMPT, INPUT,
            "Sonnet 5", "Qwen3.7-Plus", 30, client,
        )
    assert result.output_text == output
    assert result.parsed_output["verdict"] == "WAIT"
