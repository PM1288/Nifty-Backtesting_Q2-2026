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
        "summary": "Earnings are resilient, but the immediate entry has mixed event evidence.",
        "key_driver": "Credit growth and asset quality remain supportive.",
        "key_risk": "Margin pressure could weaken near-term earnings momentum.",
        "entry_view": "Wait for confirmation after the pending disclosure.",
        "invalidation": "Material asset-quality deterioration.",
        "evidence": [
            {
                "date": "2026-08-28",
                "publisher": "NSE",
                "headline": "Current filing",
                "url": "https://www.nseindia.com/",
            }
        ],
        "data_quality_note": "Thirty completed sessions supplied.",
    }


def evaluation() -> dict:
    return {
        "input_snapshot": {
            "stock": {"symbol": "SBIN", "company_name": "State Bank of India"},
            "strategy_snapshot": {
                "direction": "LONG",
                "ofactor": 78.345,
                "xfactor": 74.126,
                "reference_price": 1082.4,
            },
            "history_30d": [{"date": index} for index in range(30)],
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
SUMMARY: Current evidence is mixed.
DRIVER: Asset quality remains supportive.
RISK: Margin pressure remains the key risk.
ENTRY: Wait for price confirmation.
INVALIDATION: Material asset-quality deterioration.
SOURCE1: 2026-08-28 | NSE | Current filing | https://www.nseindia.com/
QUALITY: Thirty completed sessions supplied."""
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
    assert len(validate_output(value, "SBIN", date(2026, 8, 29))["summary"]) == 180


def test_whatsapp_message_is_concise_consistent_and_contains_no_operational_footer() -> None:
    result = validate_output(valid_output(), "SBIN", date(2026, 8, 29))
    message = render_whatsapp_message("CLAUDE", "OIIS", evaluation(), result)
    assert "CLAUDE · OIIS" in message
    assert "O 78.34" in message and "X 74.13" in message
    assert "*WAIT · 72% · MIXED NEWS*" in message
    assert "30 sessions" in message
    assert "{" not in message and "}" not in message
    assert len(message) < 700
    assert "stack trace" not in message.lower()
    assert "retry" not in message.lower()
    assert "warning" not in message.lower()


def test_missing_numeric_values_remain_explicitly_unavailable() -> None:
    row = evaluation()
    row["input_snapshot"]["strategy_snapshot"]["xfactor"] = None
    result = validate_output(valid_output(), "SBIN", date(2026, 8, 29))
    assert "X —" in render_whatsapp_message("QWEN", "OISS", row, result)
