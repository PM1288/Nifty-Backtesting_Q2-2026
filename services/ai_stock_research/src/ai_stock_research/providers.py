from __future__ import annotations

import json
import re
import time
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
        "schema_version": "2.1",
        "analysis_date": stock_input.get("analysis_date"),
        "stock": stock_input.get("stock") or {},
        "reference_price": strategy.get("reference_price"),
        "price_history_1y": stock_input.get("price_history_1y") or {
            "columns": ["date", "open", "high", "low", "close", "volume"],
            "rows": [],
        },
    }
    user_prompt = (
        "Independently research this stock using current public web evidence. Treat the compact "
        "one-year OHLCV matrix only as price/volume context; do not calculate technical indicators "
        "or invent chart levels. Return exactly the labelled fields required by the system "
        "instruction. Do not return JSON or Markdown.\nRESEARCH_INPUT_JSON:\n"
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
    qwen_recovery_wait_seconds: float = 90,
) -> ProviderResult:
    request_payload = build_request(provider, prompt, stock_input, claude_model, qwen_model)
    owned = client is None
    http = client or httpx.Client(timeout=httpx.Timeout(timeout_seconds, connect=10))
    recovery_used = False
    try:
        response = http.post(endpoint, json=request_payload)
        response.raise_for_status()
        envelope = response.json()
        if not isinstance(envelope, dict) or envelope.get("status") != "success":
            raise RuntimeError("provider returned a non-success response")
        output = envelope.get("output")
        if not isinstance(output, str) or not output.strip():
            raise RuntimeError("provider returned no output text")
        if provider == "QWEN" and _is_qwen_skip_placeholder(output):
            chat_id = envelope.get("chat_id")
            if not chat_id:
                raise RuntimeError("Qwen placeholder response did not include a chat id")
            time.sleep(max(0, qwen_recovery_wait_seconds))
            continuation = {
                "prompt": (
                    "The research task has had time to complete. Return only the completed final "
                    "answer now. Begin with SYMBOL: and include every required labelled line in exact "
                    "order. No preamble, JSON, Markdown, reasoning, warning, footnote, Skip, or "
                    "Thought stopped text."
                ),
                "chat_id": str(chat_id),
                "model": qwen_model,
                "system_instruction": prompt,
            }
            response = http.post(endpoint, json=continuation)
            response.raise_for_status()
            envelope = response.json()
            if not isinstance(envelope, dict) or envelope.get("status") != "success":
                raise RuntimeError("Qwen continuation returned a non-success response")
            output = envelope.get("output")
            if not isinstance(output, str) or not output.strip():
                raise RuntimeError("Qwen continuation returned no output text")
            request_payload = {
                **request_payload,
                "qwen_recovery": {
                    "used": True,
                    "wait_seconds": qwen_recovery_wait_seconds,
                    "continuation_prompt": continuation["prompt"],
                },
            }
            recovery_used = True
    finally:
        if owned:
            http.close()
    parsed = validate_output(
        extract_provider_output(output),
        str(stock_input["stock"]["symbol"]),
        date_from_input(stock_input),
    )
    stored = {key: value for key, value in envelope.items() if key != "thinking"}
    stored["thinking_present"] = bool(envelope.get("thinking"))
    stored["qwen_recovery_used"] = recovery_used
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


def _is_qwen_skip_placeholder(output: str) -> bool:
    normalized = re.sub(r"[\s.…]+", "", output).lower()
    return normalized == "skip"
