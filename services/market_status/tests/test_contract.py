import json
from pathlib import Path

from jsonschema import Draft202012Validator, FormatChecker

REPOSITORY_ROOT = Path(__file__).resolve().parents[3] if len(Path(__file__).resolve().parents) > 3 else Path("/")
SCHEMA = Path("/schemas/market-status-whatsapp.v1.schema.json") if Path("/schemas").exists() else REPOSITORY_ROOT / "schemas" / "market-status-whatsapp.v1.schema.json"
EXAMPLES = Path("/examples/market_status") if Path("/examples").exists() else REPOSITORY_ROOT / "examples" / "market_status"


def test_all_canonical_samples_validate():
    schema = json.loads(SCHEMA.read_text())
    validator = Draft202012Validator(schema, format_checker=FormatChecker())
    samples = sorted(EXAMPLES.glob("*.json"))
    assert len(samples) >= 9
    for sample in samples:
        errors = list(validator.iter_errors(json.loads(sample.read_text())))
        assert not errors, f"{sample.name}: {errors[0].message if errors else ''}"


def test_paper_event_is_not_supported():
    schema = json.loads(SCHEMA.read_text())
    sample = json.loads((EXAMPLES / "market-open-positive.json").read_text())
    sample["event_type"] = "com.papertrading.trade.accepted.v1"
    assert list(Draft202012Validator(schema, format_checker=FormatChecker()).iter_errors(sample))


def test_invalid_uuid_and_timestamp_are_rejected():
    schema = json.loads(SCHEMA.read_text())
    sample = json.loads((EXAMPLES / "market-open-positive.json").read_text())
    sample["event_id"] = "not-a-uuid"
    sample["data_as_of"] = "not-a-timestamp"
    assert list(Draft202012Validator(schema, format_checker=FormatChecker()).iter_errors(sample))
