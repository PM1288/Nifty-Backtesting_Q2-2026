from __future__ import annotations

import json
import re
from datetime import date
from typing import Any


VERDICTS = {
    "RESEARCH_SUPPORTS_ENTRY",
    "WAIT",
    "RESEARCH_OPPOSES_ENTRY",
    "DATA_INSUFFICIENT",
}
NEWS_SIGNALS = {"POSITIVE", "MIXED", "NEUTRAL", "NEGATIVE", "UNVERIFIED"}
PROVIDER_ICONS = {"CLAUDE": "🟠", "QWEN": "🟣", "DEEPSEEK": "🔵"}


class OutputValidationError(ValueError):
    pass


def extract_json_object(output: str) -> dict[str, Any]:
    cleaned = output.strip()
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    try:
        # Browser-backed providers occasionally return a literal newline inside
        # a JSON string. Accept that transport quirk, then apply the strict
        # field/schema validation below before anything is stored or delivered.
        value = json.loads(cleaned, strict=False)
    except json.JSONDecodeError:
        start, end = cleaned.find("{"), cleaned.rfind("}")
        if start < 0 or end <= start:
            raise OutputValidationError("provider output does not contain a JSON object") from None
        try:
            value = json.loads(cleaned[start : end + 1], strict=False)
        except json.JSONDecodeError as exc:
            raise OutputValidationError("provider output contains invalid JSON") from exc
    if not isinstance(value, dict):
        raise OutputValidationError("provider output must be a JSON object")
    return value


def _short(value: Any, field: str, maximum: int, *, required: bool = True) -> str:
    text = " ".join(str(value or "").split())
    if required and not text:
        raise OutputValidationError(f"{field} is required")
    if len(text) > maximum:
        text = text[: maximum - 1].rstrip() + "…"
    return text


def validate_output(value: dict[str, Any], symbol: str, analysis_date: date) -> dict[str, Any]:
    if str(value.get("symbol", "")).strip().upper() != symbol.upper():
        raise OutputValidationError("provider symbol does not match the evaluation")
    if str(value.get("analysis_date", "")) != analysis_date.isoformat():
        raise OutputValidationError("provider analysis_date does not match the evaluation")
    verdict = str(value.get("verdict", "")).strip().upper()
    news_signal = str(value.get("news_signal", "")).strip().upper()
    if verdict not in VERDICTS:
        raise OutputValidationError("provider verdict is not allowed")
    if news_signal not in NEWS_SIGNALS:
        raise OutputValidationError("provider news_signal is not allowed")
    confidence = value.get("confidence")
    if isinstance(confidence, bool) or not isinstance(confidence, (int, float)):
        raise OutputValidationError("provider confidence must be numeric")
    confidence = int(round(float(confidence)))
    if not 0 <= confidence <= 100:
        raise OutputValidationError("provider confidence must be between 0 and 100")
    evidence: list[dict[str, str]] = []
    for item in value.get("evidence") or []:
        if not isinstance(item, dict) or len(evidence) >= 3:
            continue
        evidence.append(
            {
                "date": _short(item.get("date"), "evidence.date", 10, required=False),
                "publisher": _short(item.get("publisher"), "evidence.publisher", 60, required=False),
                "headline": _short(item.get("headline"), "evidence.headline", 120, required=False),
                "url": _short(item.get("url"), "evidence.url", 500, required=False),
            }
        )
    return {
        "schema_version": "1.0",
        "symbol": symbol.upper(),
        "analysis_date": analysis_date.isoformat(),
        "verdict": verdict,
        "confidence": confidence,
        "news_signal": news_signal,
        "summary": _short(value.get("summary"), "summary", 180),
        "key_driver": _short(value.get("key_driver"), "key_driver", 120),
        "key_risk": _short(value.get("key_risk"), "key_risk", 120),
        "entry_view": _short(value.get("entry_view"), "entry_view", 120),
        "invalidation": _short(value.get("invalidation"), "invalidation", 120),
        "evidence": evidence,
        "data_quality_note": _short(
            value.get("data_quality_note"), "data_quality_note", 160, required=False
        ),
    }


def _number(value: Any) -> str:
    if value is None:
        return "—"
    return f"{float(value):,.2f}"


def render_whatsapp_message(
    provider: str, source_strategy: str, evaluation: dict[str, Any], result: dict[str, Any]
) -> str:
    snapshot = evaluation["input_snapshot"]
    strategy = snapshot["strategy_snapshot"]
    stock = snapshot["stock"]
    sessions = len(snapshot.get("history_30d") or [])
    message = "\n".join(
        [
            f"{PROVIDER_ICONS[provider]} *{provider} · {source_strategy} RESEARCH*",
            (
                f"*{stock['symbol']}* · {strategy.get('direction') or '—'} · "
                f"O {_number(strategy.get('ofactor'))} · X {_number(strategy.get('xfactor'))} · "
                f"₹{_number(strategy.get('reference_price'))}"
            ),
            (
                f"*View:* {result['verdict'].replace('_', ' ')} · {result['confidence']}% · "
                f"News {result['news_signal']}"
            ),
            f"*Why:* {result['summary']}",
            f"*Risk:* {result['key_risk']}",
            f"`As of {result['analysis_date']} · {sessions} sessions`",
        ]
    )
    return message[:950]
