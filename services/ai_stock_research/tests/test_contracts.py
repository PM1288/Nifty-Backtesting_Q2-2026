from datetime import date

import pytest

from ai_stock_research.contracts import (
    OutputValidationError,
    extract_provider_output,
    extract_json_object,
    render_whatsapp_message,
    validate_output,
)


def valid_output() -> dict:
    return {
        "schema_version": "1.0",
        "symbol": "SBIN",
        "analysis_date": "2026-08-29",
        "verdict": "WAIT",
        "confidence": 72,
        "news_signal": "MIXED",
        "earnings_state": "STABLE",
        "web_sentiment": "MIXED",
        "summary": "Earnings are resilient, but the immediate entry has mixed event evidence.",
        "positive_evidence": "Asset quality and credit growth remain supportive.",
        "negative_evidence": "Margin pressure remains unresolved.",
        "upcoming_risk": "The next earnings update could change the margin outlook.",
        "earnings_view": "Earnings are stable, with asset quality offset by margin pressure.",
        "market_view": "Published research is mixed pending clearer margin direction.",
        "price_news_alignment": "Recent price and volume are NEUTRAL to the mixed research view.",
        "key_driver": "Credit growth and asset quality remain supportive.",
        "key_risk": "Margin pressure could weaken near-term earnings momentum.",
        "evidence": [
            {
                "date": "2026-08-28",
                "publisher": "NSE",
                "headline": "Current filing",
                "url": "https://www.nseindia.com/",
            }
        ],
        "data_quality_note": "One calendar year of completed sessions supplied.",
    }


def evaluation() -> dict:
    return {
        "input_snapshot": {
            "stock": {"symbol": "SBIN", "company_name": "State Bank of India"},
            "strategy_snapshot": {
                "direction": "LONG",
                "status": "WAIT_FOR_XFACTOR",
                "ofactor": 78.345,
                "xfactor": 74.126,
                "reference_price": 1082.4,
            },
            "price_history_1y": {
                "columns": ["date", "open", "high", "low", "close", "volume"],
                "rows": [[f"2026-01-{index + 1:02d}", 100, 102, 99, 101, 1000] for index in range(20)],
            },
        }
    }


def test_json_extraction_accepts_plain_and_fenced_provider_output() -> None:
    assert extract_json_object('{"verdict":"WAIT"}') == {"verdict": "WAIT"}
    assert extract_json_object('```json\n{"verdict":"WAIT"}\n```') == {"verdict": "WAIT"}


def test_json_extraction_normalises_browser_literal_newlines() -> None:
    assert extract_json_object('{"summary":"line one\nline two"}') == {
        "summary": "line one\nline two"
    }


def test_labelled_output_is_normalised_to_the_internal_contract() -> None:
    output = """I now have enough verified information to make the assessment.

SYMBOL: SBIN
DATE: 2026-08-29
VERDICT: WAIT
CONFIDENCE: 72%
NEWS: MIXED
EARNINGS: STABLE
WEB_SENTIMENT: MIXED
SUMMARY: Current evidence is mixed.
POSITIVE: Asset quality remains stable.
NEGATIVE: Margins remain mixed.
UPCOMING_RISK: Next earnings may change the margin outlook.
EARNINGS_VIEW: Earnings are stable with mixed margins.
MARKET_VIEW: Research sentiment is mixed.
PRICE_NEWS_ALIGNMENT: Recent price and volume are NEUTRAL to sentiment.
CATALYST: Asset quality remains supportive.
RISK: Margin pressure remains the key risk.
SOURCE1: 2026-08-28 | NSE | Current filing | https://www.nseindia.com/
QUALITY: One calendar year supplied."""
    parsed = extract_provider_output(output)
    assert parsed["symbol"] == "SBIN"
    assert parsed["confidence"] == 72
    assert parsed["evidence"] == [
        {
            "date": "2026-08-28",
            "publisher": "NSE",
            "headline": "Current filing",
            "url": "https://www.nseindia.com/",
        }
    ]
    assert validate_output(parsed, "SBIN", date(2026, 8, 29))["verdict"] == "WAIT"


def test_labelled_output_rejects_unstructured_model_chatter() -> None:
    with pytest.raises(OutputValidationError, match="labelled response contract"):
        extract_provider_output("The stock looks interesting, perhaps buy it.")


def test_labelled_output_restores_qwen_contract_boundaries_without_changing_values() -> None:
    output = (
        "SYMBOL: SBIN\nDATE: 2026-08-29VERDICT: WAITCONFIDENCE: 68NEWS: MIXED"
        "EARNINGS: STABLEWEB_SENTIMENT: MIXEDSUMMARY: Evidence remains balanced."
        "POSITIVE: Asset quality is stable.NEGATIVE: Margin pressure."
        "UPCOMING_RISK: NONE IDENTIFIEDEARNINGS_VIEW: Earnings are stable."
        "MARKET_VIEW: Research is mixed.PRICE_NEWS_ALIGNMENT: NEUTRAL to sentiment."
        "CATALYST: Credit growth.RISK: Margin pressure.QUALITY: Current sources checked."
    )
    parsed = extract_provider_output(output)
    validated = validate_output(parsed, "SBIN", date(2026, 8, 29))
    assert validated["confidence"] == 68
    assert validated["earnings_state"] == "STABLE"
    assert validated["market_view"] == "Research is mixed."


def test_output_validation_enforces_symbol_date_and_enums() -> None:
    result = validate_output(valid_output(), "SBIN", date(2026, 8, 29))
    assert result["confidence"] == 72
    bad = valid_output()
    bad["verdict"] = "BUY NOW"
    with pytest.raises(OutputValidationError, match="verdict"):
        validate_output(bad, "SBIN", date(2026, 8, 29))


def test_output_validation_truncates_for_low_noise_delivery() -> None:
    value = valid_output()
    value["summary"] = "x" * 400
    assert len(validate_output(value, "SBIN", date(2026, 8, 29))["summary"]) == 220


def test_whatsapp_message_is_concise_consistent_and_contains_no_operational_footer() -> None:
    result = validate_output(valid_output(), "SBIN", date(2026, 8, 29))
    message = render_whatsapp_message("CLAUDE", "OIIS", evaluation(), result)
    assert "CLAUDE RESEARCH · OIIS" in message
    assert "SBIN · State Bank of India" in message
    assert "WAIT_FOR_XFACTOR" in message
    assert "O 78.34" in message and "X 74.13" in message
    assert "*Decision:* WAIT · 72% confidence · MIXED news" in message
    assert "*Earnings / sentiment:* STABLE · MIXED" in message
    assert "*Verified sources:*" in message
    assert "https://www.nseindia.com/" in message
    assert "*Data quality:* One calendar year of completed sessions supplied." in message
    assert "20 completed sessions" in message
    assert "*Positive:* Asset quality and credit growth remain supportive." in message
    assert "*Earnings view:* Earnings are stable" in message
    assert "*Market view:* Published research is mixed" in message
    assert "*Catalyst:* Credit growth and asset quality remain supportive." in message
    assert "{" not in message and "}" not in message
    assert len(message) < 3500
    assert "stack trace" not in message.lower()
    assert "retry" not in message.lower()
    assert "warning" not in message.lower()


def test_missing_numeric_values_remain_explicitly_unavailable() -> None:
    row = evaluation()
    row["input_snapshot"]["strategy_snapshot"]["xfactor"] = None
    result = validate_output(valid_output(), "SBIN", date(2026, 8, 29))
    assert "X —" in render_whatsapp_message("QWEN", "OISS", row, result)
