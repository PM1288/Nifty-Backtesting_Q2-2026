from __future__ import annotations

import importlib.util
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
TOOL = ROOT / "tools" / "setup_hybrid_catalogue.py"
SPEC = importlib.util.spec_from_file_location("setup_hybrid_catalogue", TOOL)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


def test_catalogue_has_96_unique_wave_valid_strategies():
    catalogue = json.loads((ROOT / "config/catalogues/nifty_hybrid_strategy_catalogue_v1.json").read_text())
    waves = json.loads((ROOT / "config/catalogues/nifty_hybrid_strategy_test_waves_v1.json").read_text())
    assert MODULE.validate(catalogue, waves) == []
    assert len({s["strategy_id"] for s in catalogue["strategies"]}) == 96


def test_every_workload_has_operator_approved_target_only_exit():
    root = ROOT / "config/workloads/hybrid_catalogue_v1"
    workloads = sorted(root.glob("*/workload.json"))
    assert len(workloads) == 96
    for path in workloads:
        workload = json.loads(path.read_text())
        exit_contract = workload["execution_contract"]
        assert exit_contract["exit_mode"] == "TARGET_ONLY"
        assert exit_contract["same_session_target_pct_from_buy_price"] == 0.3
        assert exit_contract["swing_target_pct_from_original_buy_price"] == 1.0
        assert exit_contract["indicator_exit"] is None
        assert exit_contract["stop_loss"] is None
        assert "TMPV" not in workload["data"]["symbols"]
