from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from typing import Any

import httpx

from .contracts import extract_provider_output, validate_output


MAX_PROMPT_CHARS = 20_000
PROMPT_HEADROOM_CHARS = 200
CONSOLIDATION_INSTRUCTION = (
    "Return one reconciled final answer only. Use exactly the labelled-line contract in the "
    "prompt, beginning with SYMBOL and ending with QUALITY. Reconcile disagreements, retain only "
    "verified evidence, use at most three sources, and do not list providers, intermediate answers, "
    "reasoning, privacy receipts, metadata, JSON, Markdown, or any preamble."
)


@dataclass(frozen=True)
class ProviderResult:
    request_payload: dict[str, Any]
    stored_response: dict[str, Any]
    output_text: str
    parsed_output: dict[str, Any]
    chat_id: str | None = None


def _independent_input(stock_input: dict[str, Any]) -> dict[str, Any]:
    strategy = stock_input.get("strategy_snapshot") or {}
    history = stock_input.get("price_history_1y") or {
        "columns": ["date", "open", "high", "low", "close", "volume"],
        "rows": [],
    }
    return {
        "schema_version": "2.2",
        "analysis_date": stock_input.get("analysis_date"),
        "stock": stock_input.get("stock") or {},
        "reference_price": strategy.get("reference_price"),
        "price_history_1y": {
            "columns": history.get("columns")
            or ["date", "open", "high", "low", "close", "volume"],
            "rows": list(history.get("rows") or []),
        },
    }


def _render_prompt(system_prompt: str, model_input: dict[str, Any]) -> str:
    task = (
        "\n\nResearch this stock using current public web evidence. Treat the compact OHLCV "
        "matrix only as price/volume context; do not calculate technical indicators or invent chart "
        "levels. Follow the labelled response contract above exactly.\nRESEARCH_INPUT_JSON:\n"
    )
    budget = MAX_PROMPT_CHARS - PROMPT_HEADROOM_CHARS
    rows = model_input["price_history_1y"]["rows"]
    while True:
        encoded = json.dumps(model_input, separators=(",", ":"), default=str)
        rendered = f"{system_prompt.strip()}{task}{encoded}"
        if len(rendered) <= budget:
            return rendered
        if not rows:
            raise ValueError("consolidated research prompt exceeds the API 20,000 character limit")
        # Preserve the most recent completed sessions when the final-only API's
        # prompt limit cannot carry the complete one-year matrix.
        del rows[0]


def build_request(
    prompt: str,
    stock_input: dict[str, Any],
    consolidation_provider: str = "claude",
    consolidation_effort: str = "high",
) -> dict[str, Any]:
    return {
        "prompt": _render_prompt(prompt, _independent_input(stock_input)),
        "include_chatgpt": False,
        "consolidation_provider": consolidation_provider,
        "consolidation_effort": consolidation_effort,
        "consolidation_instruction": CONSOLIDATION_INSTRUCTION,
    }


def call_provider(
    endpoint: str,
    prompt: str,
    stock_input: dict[str, Any],
    timeout_seconds: int,
    consolidation_provider: str = "claude",
    consolidation_effort: str = "high",
    client: httpx.Client | None = None,
) -> ProviderResult:
    request_payload = build_request(
        prompt,
        stock_input,
        consolidation_provider=consolidation_provider,
        consolidation_effort=consolidation_effort,
    )
    owned = client is None
    http = client or httpx.Client(timeout=httpx.Timeout(timeout_seconds, connect=10))
    try:
        response = http.post(
            endpoint,
            json=request_payload,
            headers={"Accept": "text/plain"},
        )
        response.raise_for_status()
        content_type = response.headers.get("content-type", "").lower()
        if not content_type.startswith("text/plain"):
            raise RuntimeError("consolidated endpoint returned a non-text success response")
        output = response.text.strip()
        if not output:
            raise RuntimeError("consolidated endpoint returned no final answer")
    finally:
        if owned:
            http.close()
    parsed = validate_output(
        extract_provider_output(output),
        str(stock_input["stock"]["symbol"]),
        date_from_input(stock_input),
    )
    stored = {
        "content_type": content_type,
        "cache_control": response.headers.get("cache-control"),
        "body_sha256": hashlib.sha256(output.encode("utf-8")).hexdigest(),
        "final_text_only": True,
        "intermediate_outputs_exposed": False,
    }
    return ProviderResult(
        request_payload=request_payload,
        stored_response=stored,
        output_text=output,
        parsed_output=parsed,
    )


def date_from_input(stock_input: dict[str, Any]):
    from datetime import date

    return date.fromisoformat(str(stock_input["analysis_date"]))
