#!/usr/bin/env python3
"""Validate the frozen OIIS Phase-A research configuration."""

import argparse
import json
from pathlib import Path

DEFAULT = Path(__file__).resolve().parents[1] / "config/oiis/formulas/oiis_cash_daily_research_v1.json"

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--config", type=Path, default=DEFAULT)
args = parser.parse_args()
config = json.loads(args.config.read_text(encoding="utf-8"))
assert sum(config["ofactor_weights"].values()) == 100, "OFactor weights must total 100"
assert sum(config["xfactor_weights"].values()) == 100, "XFactor weights must total 100"
assert config["status"] == "RESEARCH_DRAFT_PENDING_OWNER_AND_QUANT_APPROVAL"
assert "live_broker_orders" in config["blocked_capabilities"]
execution = config["execution"]
assert execution["exit_policy_id"] == "COMMON-TARGET-ONLY-0.3-1.0-V1"
assert execution["execution_scenario_id"] == "EXEC-I030-ELSE-S100-NO-TIMEOUT-V2"
assert execution["evaluation_policy_id"].endswith("V2")
assert execution["stop_on_first_target"] is False
assert execution["stop_on_first_adverse_level"] is False
assert execution["intraday_target_pct_from_buy_price"] == 0.3
assert execution["swing_target_pct_from_original_buy_price"] == 1.0
assert execution["stop_loss_exit"] is None
assert execution["strategy_exit"] is None
assert execution["timeout_exit"] is None
assert execution["run_end_exit"] is None
print(json.dumps({"status": "PASS", "formula_version": config["formula_version"], "live_orders": "BLOCKED"}, indent=2))
