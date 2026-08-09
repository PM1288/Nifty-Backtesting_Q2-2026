import json
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator

from papertrade.contracts import BuildingGroupRequest, CloseIntent, TradeIntent


def payload() -> dict:
    return {
        "schema_version": "1.0",
        "client_event_id": "x",
        "account_id": "paper-main",
        "environment": "PAPER",
        "source": {"service": "test"},
        "strategy": {"strategy_id": "S", "strategy_name": "S", "strategy_version": "1", "signal_id": "1"},
        "signal": {"occurred_at": datetime.now(UTC), "direction": "LONG"},
        "trade_group": {
            "client_group_id": "g",
            "asset_class": "EQUITY",
            "expected_leg_count": 1,
            "performance_basis": {"type": "ENTRY_NOTIONAL", "currency": "INR"},
        },
        "legs": [
            {
                "client_leg_id": "l",
                "instrument": {
                    "instrument_id": "NSE:CASH:X",
                    "exchange": "NSE",
                    "segment": "CASH",
                    "symbol": "X",
                    "lot_size": "1",
                    "contract_multiplier": "1",
                },
                "side": "BUY",
                "quantity": {"value": "1", "unit": "SHARES"},
                "entry_order": {"type": "MARKET", "price_source": "NEXT_AVAILABLE_BAR_OPEN"},
            }
        ],
        "execution_policy": {},
        "analytics_policy": {},
        "cost_profile_id": "fixture",
        "tax_profile_id": "management-profit-tax-35pct",
    }


def test_paper_only_and_decimal_contract() -> None:
    value = TradeIntent.model_validate(payload())
    assert value.environment == "PAPER" and value.legs[0].quantity.value == Decimal("1")
    changed = payload()
    changed["environment"] = "LIVE"
    with pytest.raises(ValueError):
        TradeIntent.model_validate(changed)


def test_options_require_identity_and_future_expiry() -> None:
    value = payload()
    value["trade_group"].update(asset_class="OPTION")
    value["legs"][0]["instrument"].update(
        segment="OPT",
        underlying="X",
        expiry=date.today() + timedelta(days=7),
        strike="100",
        option_type="CALL",
    )
    assert TradeIntent.model_validate(value).legs[0].instrument.option_type == "CALL"
    del value["legs"][0]["instrument"]["strike"]
    with pytest.raises(ValueError):
        TradeIntent.model_validate(value)


def test_leg_count_is_exact() -> None:
    value = payload()
    value["trade_group"]["expected_leg_count"] = 2
    with pytest.raises(ValueError):
        TradeIntent.model_validate(value)


def test_execution_target_lifecycle_is_explicit_and_target_only() -> None:
    value = payload()
    value["execution_policy"] = {
        "mode": "RULES",
        "exit_rules": [
            {
                "rule_id": "I030",
                "kind": "TARGET_PCT",
                "value": "0.003",
                "action": "FULL_CLOSE",
                "target_lifecycle": "INTRADAY",
            },
            {
                "rule_id": "S100",
                "kind": "TARGET_PCT",
                "value": "0.010",
                "action": "FULL_CLOSE",
                "target_lifecycle": "SWING",
            },
        ],
    }
    parsed = TradeIntent.model_validate(value)
    assert [rule.target_lifecycle for rule in parsed.execution_policy.exit_rules] == [
        "INTRADAY",
        "SWING",
    ]
    value["execution_policy"]["exit_rules"][0]["kind"] = "TIME"
    with pytest.raises(ValueError):
        TradeIntent.model_validate(value)


def test_all_published_samples_validate() -> None:
    root = Path(__file__).resolve().parents[1]
    for path in sorted((root / "examples/requests").glob("*.json")):
        value = json.loads(path.read_text())
        if path.name.startswith("10_"):
            BuildingGroupRequest.model_validate(value)
        elif path.name.startswith(("11_", "12_")):
            CloseIntent.model_validate(value)
        else:
            TradeIntent.model_validate(value)
    schema = json.loads((root / "schemas/events/cloudevent-v1.schema.json").read_text())
    validator = Draft202012Validator(schema)
    for path in sorted((root / "examples/events").glob("*.json")):
        validator.validate(json.loads(path.read_text()))
