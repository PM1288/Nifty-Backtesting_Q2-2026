import json

import httpx

from ai_stock_research.providers import build_request, call_provider


PROMPT = "Return labelled lines only."
INPUT = {
    "analysis_date": "2026-08-29",
    "stock": {"symbol": "SBIN", "company_name": "State Bank of India", "exchange": "NSE"},
    "strategy_snapshot": {
        "direction": "LONG", "status": "WAIT_FOR_XFACTOR",
        "ofactor": 78, "xfactor": 74, "reference_price": 1082.4,
    },
    "price_history_1y": {
        "columns": ["date", "open", "high", "low", "close", "volume"],
        "rows": [["2026-08-28", 1080, 1090, 1070, 1082, 1200000]],
    },
}
OUTPUT = {
    "schema_version": "1.0",
    "symbol": "SBIN",
    "analysis_date": "2026-08-29",
    "verdict": "WAIT",
    "confidence": 65,
    "news_signal": "MIXED",
    "earnings_state": "MIXED",
    "web_sentiment": "MIXED",
    "summary": "Mixed current evidence.",
    "positive_evidence": "Business conditions remain stable.",
    "negative_evidence": "Margin evidence is mixed.",
    "upcoming_risk": "A pending event may change the outlook.",
    "earnings_view": "Latest earnings evidence is mixed.",
    "market_view": "Published research is mixed.",
    "price_news_alignment": "Recent price and volume are NEUTRAL to sentiment.",
    "key_driver": "Stable business trend.",
    "key_risk": "Pending event risk.",
    "evidence": [],
    "data_quality_note": "No material evidence gaps identified.",
}


def test_provider_payloads_use_each_verified_api_contract() -> None:
    claude = build_request("CLAUDE", PROMPT, INPUT, "Sonnet 5", "Qwen3.7-Plus")
    qwen = build_request("QWEN", PROMPT, INPUT, "Sonnet 5", "Qwen3.7-Plus")
    deepseek = build_request("DEEPSEEK", PROMPT, INPUT, "Sonnet 5", "Qwen3.7-Plus")
    assert claude["reasoning_effort"] == "medium" and claude["model"] == "Sonnet 5"
    assert qwen["model"] == "Qwen3.7-Plus" and "reasoning_effort" not in qwen
    assert deepseek["search"] is True and deepseek["deep_think"] is False
    assert "Do not return JSON or Markdown" in claude["prompt"]
    model_input = json.loads(claude["prompt"].split("RESEARCH_INPUT_JSON:\n", 1)[1])
    assert model_input["schema_version"] == "2.1"
    assert model_input["reference_price"] == 1082.4
    assert model_input["price_history_1y"]["columns"] == [
        "date", "open", "high", "low", "close", "volume"
    ]
    assert model_input["price_history_1y"]["rows"][0][-1] == 1200000
    serialized = json.dumps(model_input)
    assert "ofactor" not in serialized and "xfactor" not in serialized
    assert "direction" not in serialized and "WAIT_FOR_XFACTOR" not in serialized


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
EARNINGS: MIXED
WEB_SENTIMENT: MIXED
SUMMARY: Mixed current evidence.
POSITIVE: Business conditions remain stable.
NEGATIVE: Margin evidence is mixed.
UPCOMING_RISK: A pending event may change the outlook.
EARNINGS_VIEW: Latest earnings evidence is mixed.
MARKET_VIEW: Published research is mixed.
PRICE_NEWS_ALIGNMENT: Recent price and volume are NEUTRAL to sentiment.
CATALYST: Stable business trend.
RISK: Pending event risk.
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


def test_qwen_skip_placeholder_uses_delayed_same_chat_final_answer() -> None:
    requests: list[dict] = []

    def handler(request: httpx.Request) -> httpx.Response:
        payload = json.loads(request.content)
        requests.append(payload)
        if len(requests) == 1:
            return httpx.Response(200, json={
                "status": "success", "chat_id": "qwen-chat-1",
                "output": "...\nSkip", "thinking": "private trace",
            })
        return httpx.Response(200, json={
            "status": "success", "chat_id": "qwen-chat-1",
            "output": """SYMBOL: SBIN
DATE: 2026-08-29VERDICT: WAITCONFIDENCE: 65NEWS: MIXEDEARNINGS: MIXED
WEB_SENTIMENT: MIXEDSUMMARY: Mixed current evidence.POSITIVE: Business conditions remain stable.
NEGATIVE: Margin evidence is mixed.UPCOMING_RISK: A pending event may change the outlook.
EARNINGS_VIEW: Latest earnings evidence is mixed.MARKET_VIEW: Published research is mixed.
PRICE_NEWS_ALIGNMENT: Recent price and volume are NEUTRAL to sentiment.
CATALYST: Stable business trend.RISK: Pending event risk.QUALITY: Current sources checked.""",
            "thinking": "private trace",
        })

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        result = call_provider(
            "QWEN", "http://100.120.233.3:8010/query", PROMPT, INPUT,
            "Sonnet 5", "Qwen3.7-Plus", 30, client,
            qwen_recovery_wait_seconds=0,
        )
    assert len(requests) == 2
    assert requests[1]["chat_id"] == "qwen-chat-1"
    assert requests[1]["prompt"].startswith("The research task has had time to complete")
    assert result.parsed_output["earnings_view"] == "Latest earnings evidence is mixed."
    assert result.stored_response["qwen_recovery_used"] is True
    assert "thinking" not in result.stored_response
