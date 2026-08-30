from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

import httpx

from .contracts import extract_provider_output, validate_output


@dataclass(frozen=True)
class ProviderResult:
    request_payload: dict[str, Any]
    stored_response: dict[str, Any]
    output_text: str
    parsed_output: dict[str, Any]
    chat_id: str | None


def build_request(
    provider: str,
    prompt: str,
    stock_input: dict[str, Any],
    claude_model: str,
    qwen_model: str,
) -> dict[str, Any]:
    strategy = stock_input.get("strategy_snapshot") or {}
    independent_input = {
        "schema_version": "2.0",
        "analysis_date": stock_input.get("analysis_date"),
        "stock": stock_input.get("stock") or {},
        "reference_price": strategy.get("reference_price"),
        "price_history_1y": stock_input.get("price_history_1y") or {
            "columns": ["date", "open", "high", "low", "close", "volume"],
            "rows": [],
        },
    }
    user_prompt = (
        "Independently research this stock. Use the compact one-year OHLCV matrix and current "
        "public evidence, then return exactly the labelled fields required by the system instruction. "
        "Do not return JSON or Markdown.\nRESEARCH_INPUT_JSON:\n"
        + json.dumps(independent_input, separators=(",", ":"), default=str)
    )
    common: dict[str, Any] = {"prompt": user_prompt, "system_instruction": prompt}
    if provider == "CLAUDE":
        return {**common, "model": claude_model, "reasoning_effort": "medium"}
    if provider == "QWEN":
        return {**common, "model": qwen_model}
    if provider == "DEEPSEEK":
        return {**common, "deep_think": False, "search": True}
    raise ValueError(f"unsupported provider: {provider}")


def call_provider(
    provider: str,
    endpoint: str,
    prompt: str,
    stock_input: dict[str, Any],
    claude_model: str,
    qwen_model: str,
    timeout_seconds: int,
    client: httpx.Client | None = None,
) -> ProviderResult:
    request_payload = build_request(provider, prompt, stock_input, claude_model, qwen_model)
    owned = client is None
    http = client or httpx.Client(timeout=httpx.Timeout(timeout_seconds, connect=10))
    try:
        response = http.post(endpoint, json=request_payload)
        response.raise_for_status()
        envelope = response.json()
    finally:
        if owned:
            http.close()
    if not isinstance(envelope, dict) or envelope.get("status") != "success":
        raise RuntimeError("provider returned a non-success response")
    output = envelope.get("output")
    if not isinstance(output, str) or not output.strip():
        raise RuntimeError("provider returned no output text")
    parsed = validate_output(
        extract_provider_output(output),
        str(stock_input["stock"]["symbol"]),
        date_from_input(stock_input),
    )
    stored = {key: value for key, value in envelope.items() if key != "thinking"}
    stored["thinking_present"] = bool(envelope.get("thinking"))
    return ProviderResult(
        request_payload=request_payload,
        stored_response=stored,
        output_text=output,
        parsed_output=parsed,
        chat_id=str(envelope.get("chat_id")) if envelope.get("chat_id") else None,
    )


def date_from_input(stock_input: dict[str, Any]):
    from datetime import date

    return date.fromisoformat(str(stock_input["analysis_date"]))
