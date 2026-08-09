from __future__ import annotations

import json
from copy import deepcopy
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

from papertrade.api import app
from papertrade.contracts import BuildingGroupRequest, CloseIntent, TradeIntent
from papertrade.events import cloud_event

ROOT = Path(__file__).resolve().parents[1]
for folder in (
    ROOT / "schemas/inbound",
    ROOT / "schemas/events",
    ROOT / "examples/requests",
    ROOT / "examples/events",
):
    folder.mkdir(parents=True, exist_ok=True)


def write(path: Path, value: object) -> None:
    path.write_text(json.dumps(value, indent=2, default=str) + "\n")


base = {
    "schema_version": "1.0",
    "client_event_id": "oiis-demo-000001",
    "account_id": "paper-main",
    "environment": "PAPER",
    "source": {"service": "oiis-strategy-service", "instance": "oiis-worker-01"},
    "strategy": {
        "strategy_id": "OIIS",
        "strategy_name": "OIIS",
        "strategy_family": "OIIS",
        "strategy_version": "1.0.0",
        "strategy_run_id": "run-demo",
        "signal_id": "signal-demo",
        "tags": ["equity", "intraday"],
    },
    "signal": {
        "occurred_at": datetime.now(UTC).isoformat(),
        "exchange_timezone": "Asia/Kolkata",
        "direction": "LONG",
        "confidence": "0.8400",
        "reason_codes": ["OFACTOR_QUALIFIED"],
        "features": {"ofactor": "81.20", "xfactor": "86.40"},
    },
    "trade_group": {
        "client_group_id": "oiis-group-demo",
        "asset_class": "EQUITY",
        "expected_leg_count": 1,
        "group_entry_policy": "ATOMIC",
        "group_close_policy": "ALL_LEGS",
        "performance_basis": {"type": "ENTRY_NOTIONAL", "amount": None, "currency": "INR"},
    },
    "legs": [
        {
            "client_leg_id": "leg-1",
            "role": "PRIMARY",
            "position_effect": "OPEN",
            "instrument": {
                "instrument_id": "NSE:CASH:RELIANCE",
                "instrument_token": "2885",
                "exchange": "NSE",
                "segment": "CASH",
                "symbol": "RELIANCE",
                "isin": None,
                "underlying": "RELIANCE",
                "expiry": None,
                "strike": None,
                "option_type": None,
                "lot_size": "1",
                "contract_multiplier": "1",
                "currency": "INR",
            },
            "side": "BUY",
            "quantity": {"value": "100", "unit": "SHARES"},
            "entry_order": {
                "type": "MARKET",
                "limit_price": None,
                "stop_price": None,
                "time_in_force": "DAY",
                "price_source": "NEXT_AVAILABLE_BAR_OPEN",
                "explicit_price": None,
            },
        }
    ],
    "execution_policy": {
        "mode": "EXTERNAL_EXIT",
        "intraday_square_off": False,
        "square_off_time": None,
        "exit_rules": [],
    },
    "analytics_policy": {
        "apply_default_ladders": True,
        "intraday_targets_pct": ["0.003", "0.005", "0.010"],
        "swing_targets_pct": ["0.010", "0.030", "0.050"],
        "horizons_trading_sessions": [5, 30],
        "track_after_execution_close": True,
        "snapshot_cadence": "EVENTS_AND_EOD",
    },
    "cost_profile_id": "india-equity-current",
    "tax_profile_id": "management-profit-tax-35pct",
    "metadata": {"notes": "PAPER TRADE sample"},
}
write(ROOT / "schemas/inbound/trade-intent-v1.schema.json", TradeIntent.model_json_schema())
write(ROOT / "schemas/inbound/close-intent-v1.schema.json", CloseIntent.model_json_schema())
write(ROOT / "schemas/inbound/building-group-v1.schema.json", BuildingGroupRequest.model_json_schema())
write(ROOT / "openapi.json", app.openapi())
samples = {
    "01_oiis_long_stock.json": base,
    "02_generic_intraday_long.json": deepcopy(base),
    "03_generic_short_stock.json": deepcopy(base),
}
samples["02_generic_intraday_long.json"]["strategy"].update(
    strategy_id="GENERIC_INTRADAY", strategy_name="Generic Intraday"
)
samples["03_generic_short_stock.json"]["signal"]["direction"] = "SHORT"
samples["03_generic_short_stock.json"]["legs"][0]["side"] = "SELL"
for name, value in samples.items():
    value["client_event_id"] = name
    value["trade_group"]["client_group_id"] = name
    value["strategy"]["signal_id"] = name
    write(ROOT / "examples/requests" / name, value)


def option(name: str, right: str, side: str = "BUY", strike: str = "2500") -> dict:
    value = deepcopy(base)
    value["cost_profile_id"] = "india-options-current"
    value["client_event_id"] = name
    value["trade_group"].update(
        client_group_id=name,
        asset_class="OPTION",
        performance_basis={"type": "PREMIUM_PAID", "amount": None, "currency": "INR"},
    )
    inst = value["legs"][0]["instrument"]
    inst.update(
        instrument_id=f"NFO:OPT:RELIANCE:{strike}:{right}",
        instrument_token="999001",
        exchange="NFO",
        segment="OPT",
        expiry=str(date.today() + timedelta(days=30)),
        strike=strike,
        option_type=right,
        lot_size="250",
        contract_multiplier="1",
    )
    value["legs"][0]["side"] = side
    value["legs"][0]["quantity"] = {"value": "1", "unit": "LOTS"}
    return value


call_spread = option("call-spread", "CALL")
call_spread["legs"].append(deepcopy(call_spread["legs"][0]))
call_spread["legs"][1]["client_leg_id"] = "leg-2"
call_spread["legs"][1]["side"] = "SELL"
call_spread["legs"][1]["instrument"]["instrument_id"] = "NFO:OPT:RELIANCE:2600:CALL"
call_spread["legs"][1]["instrument"]["instrument_token"] = "999002"
call_spread["legs"][1]["instrument"]["strike"] = "2600"
call_spread["trade_group"]["expected_leg_count"] = 2
call_spread["trade_group"]["performance_basis"]["type"] = "NET_DEBIT"
put_spread = deepcopy(call_spread)
put_spread["client_event_id"] = "put-spread"
for leg in put_spread["legs"]:
    leg["instrument"]["option_type"] = "PUT"
straddle = option("straddle", "CALL")
straddle["legs"].append(deepcopy(straddle["legs"][0]))
straddle["legs"][1]["client_leg_id"] = "leg-2"
straddle["legs"][1]["instrument"]["option_type"] = "PUT"
straddle["legs"][1]["instrument"]["instrument_token"] = "999003"
straddle["trade_group"]["expected_leg_count"] = 2
building = deepcopy(call_spread)
building.pop("legs")
partial_close = {
    "schema_version": "1.0",
    "client_event_id": "partial-close-example",
    "occurred_at": datetime.now(UTC).isoformat(),
    "reason": "STRATEGY_EXIT",
    "scope": "LEGS",
    "price_policy": "NEXT_AVAILABLE_BAR_OPEN",
    "legs": [{"client_leg_id": "leg-1", "quantity": "125"}],
    "metadata": {},
}
full_close = {
    **deepcopy(partial_close),
    "client_event_id": "full-close-example",
    "scope": "GROUP",
    "legs": [],
}
more = {
    "04_long_call.json": option("long-call", "CALL"),
    "05_long_put.json": option("long-put", "PUT"),
    "06_two_leg_call_spread.json": call_spread,
    "07_two_leg_put_spread.json": put_spread,
    "08_straddle.json": straddle,
    "09_atomic_multi_leg_group.json": deepcopy(call_spread),
    "10_incremental_group_create.json": building,
    "11_partial_leg_close.json": partial_close,
    "12_full_group_close.json": full_close,
}
for filename, payload in more.items():
    write(ROOT / "examples/requests" / filename, payload)
for filename, kind in (
    ("13_accepted.json", "com.papertrading.trade_intent.accepted.v1"),
    ("14_rejected.json", "com.papertrading.trade_intent.rejected.v1"),
    ("15_target_track_closed.json", "com.papertrading.target_track.closed.v1"),
    ("16_partial_close.json", "com.papertrading.trade_leg.partially_closed.v1"),
    ("17_full_close.json", "com.papertrading.trade_group.closed.v1"),
    ("18_daily_summary.json", "com.papertrading.summary.daily.v1"),
    ("19_weekly_summary.json", "com.papertrading.summary.weekly.v1"),
    ("20_market_data_stale.json", "com.papertrading.market_data.stale.v1"),
    ("20_market_data_recovered.json", "com.papertrading.market_data.recovered.v1"),
):
    write(
        ROOT / "examples/events" / filename,
        cloud_event(
            filename,
            kind,
            "trade-groups/example",
            "correlation-example",
            1,
            {"environment": "PAPER", "event_name": kind, "display_label": "PAPER TRADE"},
        ),
    )
write(
    ROOT / "schemas/events/cloudevent-v1.schema.json",
    {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "required": [
            "specversion",
            "id",
            "source",
            "type",
            "subject",
            "time",
            "datacontenttype",
            "correlationid",
            "sequence",
            "data",
        ],
        "properties": {
            "specversion": {"const": "1.0"},
            "id": {"type": "string"},
            "source": {"type": "string"},
            "type": {"type": "string", "pattern": "^com\\.papertrading\\."},
            "subject": {"type": "string"},
            "time": {"type": "string", "format": "date-time"},
            "datacontenttype": {"const": "application/json"},
            "correlationid": {"type": "string"},
            "sequence": {"type": "integer", "minimum": 1},
            "data": {
                "type": "object",
                "required": ["environment"],
                "properties": {"environment": {"const": "PAPER"}},
            },
        },
    },
)
