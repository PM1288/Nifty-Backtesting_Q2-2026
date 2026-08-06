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
print(json.dumps({"status": "PASS", "formula_version": config["formula_version"], "live_orders": "BLOCKED"}, indent=2))
