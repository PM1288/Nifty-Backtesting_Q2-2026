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
EARNINGS_STATES = {
    "STRONG",
    "IMPROVING",
    "STABLE",
    "MIXED",
    "WEAKENING",
    "NOT_RECENTLY_REPORTED",
    "UNVERIFIED",
}
WEB_SENTIMENTS = {
    "BULLISH",
    "SLIGHTLY_BULLISH",
    "NEUTRAL",
    "MIXED",
    "SLIGHTLY_BEARISH",
    "BEARISH",
    "UNVERIFIED",
}
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


def extract_provider_output(output: str) -> dict[str, Any]:
    """Parse the V5 labelled wire format while retaining JSON transport compatibility."""
    cleaned = output.strip()
    if not cleaned:
        raise OutputValidationError("provider output is empty")
    if "{" in cleaned and "}" in cleaned:
        try:
            return extract_json_object(cleaned)
        except OutputValidationError:
            pass

    # Qwen's browser extractor can preserve the requested labels while losing
    # some line breaks. Restore boundaries only before exact uppercase contract
    # labels; prose and values remain untouched and still face strict validation.
    cleaned = re.sub(
        r"(?<!^)(?<!_)(?=(?:SYMBOL|DATE|VERDICT|CONFIDENCE|NEWS|EARNINGS|WEB_SENTIMENT|"
        r"SUMMARY|POSITIVE|NEGATIVE|UPCOMING_RISK|EARNINGS_VIEW|MARKET_VIEW|"
        r"PRICE_NEWS_ALIGNMENT|CATALYST|RISK|SOURCE[1-3]|QUALITY):)",
        "\n",
        cleaned,
    )
    aliases = {
        "SYMBOL": "symbol",
        "DATE": "analysis_date",
        "VERDICT": "verdict",
        "CONFIDENCE": "confidence",
        "NEWS": "news_signal",
        "EARNINGS": "earnings_state",
        "WEB_SENTIMENT": "web_sentiment",
        "SUMMARY": "summary",
        "POSITIVE": "positive_evidence",
        "NEGATIVE": "negative_evidence",
        "UPCOMING_RISK": "upcoming_risk",
        "EARNINGS_VIEW": "earnings_view",
        "MARKET_VIEW": "market_view",
        "PRICE_NEWS_ALIGNMENT": "price_news_alignment",
        "CATALYST": "key_driver",
        "RISK": "key_risk",
        "QUALITY": "data_quality_note",
    }
    parsed: dict[str, Any] = {"schema_version": "1.0", "evidence": []}
    for raw_line in cleaned.splitlines():
        line = raw_line.strip().lstrip("-* ").replace("**", "").strip()
        match = re.match(r"^(?:\*\*)?([A-Za-z0-9_ ]+?)(?:\*\*)?\s*:\s*(.*)$", line)
        if not match:
            continue
        label = match.group(1).strip().upper().replace(" ", "_")
        text = match.group(2).strip()
        if label.startswith("SOURCE"):
            pieces = [piece.strip() for piece in text.split("|", 3)]
            while len(pieces) < 4:
                pieces.append("")
            parsed["evidence"].append(
                {"date": pieces[0], "publisher": pieces[1], "headline": pieces[2], "url": pieces[3]}
            )
            continue
        field = aliases.get(label)
        if field:
            parsed[field] = text
    if isinstance(parsed.get("confidence"), str):
        match = re.search(r"\d+(?:\.\d+)?", parsed["confidence"])
        if match:
            parsed["confidence"] = float(match.group(0))
    required = {
        "symbol",
        "analysis_date",
        "verdict",
        "confidence",
        "news_signal",
        "earnings_state",
        "web_sentiment",
        "summary",
        "positive_evidence",
        "negative_evidence",
        "upcoming_risk",
        "earnings_view",
        "market_view",
        "price_news_alignment",
        "key_driver",
        "key_risk",
        "data_quality_note",
    }
    if not required.issubset(parsed):
        raise OutputValidationError("provider output does not follow the labelled response contract")
    return parsed


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
    earnings_state = str(value.get("earnings_state", "")).strip().upper()
    web_sentiment = str(value.get("web_sentiment", "")).strip().upper()
    if verdict not in VERDICTS:
        raise OutputValidationError("provider verdict is not allowed")
    if news_signal not in NEWS_SIGNALS:
        raise OutputValidationError("provider news_signal is not allowed")
    if earnings_state not in EARNINGS_STATES:
        raise OutputValidationError("provider earnings_state is not allowed")
    if web_sentiment not in WEB_SENTIMENTS:
        raise OutputValidationError("provider web_sentiment is not allowed")
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
        "earnings_state": earnings_state,
        "web_sentiment": web_sentiment,
        "summary": _short(value.get("summary"), "summary", 220),
        "positive_evidence": _short(value.get("positive_evidence"), "positive_evidence", 180),
        "negative_evidence": _short(value.get("negative_evidence"), "negative_evidence", 180),
        "upcoming_risk": _short(value.get("upcoming_risk"), "upcoming_risk", 180),
        "earnings_view": _short(value.get("earnings_view"), "earnings_view", 180),
        "market_view": _short(value.get("market_view"), "market_view", 180),
        "price_news_alignment": _short(
            value.get("price_news_alignment"), "price_news_alignment", 150
        ),
        "key_driver": _short(value.get("key_driver"), "key_driver", 140),
        "key_risk": _short(value.get("key_risk"), "key_risk", 140),
        "evidence": evidence,
        "data_quality_note": _short(
            value.get("data_quality_note"), "data_quality_note", 160
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
    history = snapshot.get("price_history_1y") or {}
    sessions = len(history.get("rows") or snapshot.get("history_30d") or [])
    lines = [
        f"{PROVIDER_ICONS[provider]} *{provider} RESEARCH · {source_strategy}*",
        f"*{stock['symbol']} · {stock.get('company_name') or stock['symbol']}*",
        (
            f"{strategy.get('direction') or '—'} · {strategy.get('status') or '—'} · "
            f"O {_number(strategy.get('ofactor'))} · X {_number(strategy.get('xfactor'))} · "
            f"₹{_number(strategy.get('reference_price'))}"
        ),
        "",
        (
            f"*Decision:* {result['verdict'].replace('_', ' ')} · {result['confidence']}% confidence · "
            f"{result['news_signal']} news"
        ),
        f"*Earnings / sentiment:* {result['earnings_state']} · {result['web_sentiment']}",
        f"*Summary:* {result['summary']}",
        f"*Positive:* {result['positive_evidence']}",
        f"*Negative:* {result['negative_evidence']}",
        f"*Upcoming risk:* {result['upcoming_risk']}",
        f"*Earnings view:* {result['earnings_view']}",
        f"*Market view:* {result['market_view']}",
        f"*Price/news alignment:* {result['price_news_alignment']}",
        f"*Catalyst:* {result['key_driver']}",
        f"*Risk:* {result['key_risk']}",
    ]
    evidence = result.get("evidence") or []
    if evidence:
        lines.extend(["", "*Verified sources:*"])
        for index, item in enumerate(evidence[:3], start=1):
            source = " · ".join(
                value for value in (item.get("date"), item.get("publisher")) if value
            )
            headline = item.get("headline") or "Source evidence"
            lines.append(f"{index}. {source}: {headline}" if source else f"{index}. {headline}")
            if item.get("url"):
                lines.append(item["url"])
    if result.get("data_quality_note"):
        lines.extend(["", f"*Data quality:* {result['data_quality_note']}"])
    lines.append(f"*As of:* {result['analysis_date']} · {sessions} completed sessions")
    message = "\n".join(lines)
    return message if len(message) <= 3500 else message[:3499].rstrip() + "…"
