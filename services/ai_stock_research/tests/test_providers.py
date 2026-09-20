import json

import httpx
import pytest

from ai_stock_research.providers import MAX_PROMPT_CHARS, build_request, call_provider


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
OUTPUT = """SYMBOL: SBIN
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


def test_request_uses_one_final_only_consolidated_contract() -> None:
    request = build_request(PROMPT, INPUT)
    assert set(request) == {
        "prompt", "include_chatgpt", "consolidation_provider",
        "consolidation_effort", "consolidation_instruction",
    }
    assert request["include_chatgpt"] is False
    assert request["consolidation_provider"] == "claude"
    assert request["consolidation_effort"] == "high"
    assert "RESEARCH_INPUT_JSON:\n" in request["prompt"]
    model_input = json.loads(request["prompt"].split("RESEARCH_INPUT_JSON:\n", 1)[1])
    assert model_input["schema_version"] == "2.2"
    assert model_input["reference_price"] == 1082.4
    serialized = json.dumps(model_input)
    assert "ofactor" not in serialized and "xfactor" not in serialized
    assert "direction" not in serialized and "WAIT_FOR_XFACTOR" not in serialized


def test_final_plain_text_response_is_validated_without_provider_receipts() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert str(request.url) == "http://100.120.233.3:8012/query/final"
        assert request.headers["accept"] == "text/plain"
        payload = json.loads(request.content)
        assert payload["include_chatgpt"] is False
        return httpx.Response(
            200,
            text=OUTPUT,
            headers={"Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store"},
        )

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        result = call_provider(
            "http://100.120.233.3:8012/query/final", PROMPT, INPUT, 600, client=client
        )
    assert result.parsed_output["verdict"] == "WAIT"
    assert result.stored_response["final_text_only"] is True
    assert result.stored_response["intermediate_outputs_exposed"] is False
    assert "body_sha256" in result.stored_response


def test_final_endpoint_rejects_json_success_as_an_ai_answer() -> None:
    with httpx.Client(
        transport=httpx.MockTransport(
            lambda request: httpx.Response(200, json={"output": OUTPUT})
        )
    ) as client:
        with pytest.raises(RuntimeError, match="non-text"):
            call_provider(
                "http://100.120.233.3:8012/query/final", PROMPT, INPUT, 600, client=client
            )


def test_prompt_limit_keeps_recent_rows_and_never_exceeds_api_contract() -> None:
    stock_input = json.loads(json.dumps(INPUT))
    stock_input["price_history_1y"]["rows"] = [
        [f"session-{index:03d}", 1080, 1090, 1070, 1082, 1200000]
        for index in range(600)
    ]
    request = build_request("x" * 5_000, stock_input)
    assert len(request["prompt"]) < MAX_PROMPT_CHARS
    model_input = json.loads(request["prompt"].split("RESEARCH_INPUT_JSON:\n", 1)[1])
    rows = model_input["price_history_1y"]["rows"]
    assert len(rows) < 600
    assert rows[-1][0] == "session-599"
