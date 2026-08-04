#!/usr/bin/env python3
"""Validate the 96-strategy catalogue and create isolated governed workloads."""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

EXPECTED_TOP_LEVEL = {
    "catalogue_id", "version", "generated_on", "scope", "universal_execution_invariants",
    "noise_guards", "exit_packages", "data_tiers", "evidence_grades", "strategies",
    "recommended_test_design", "interpretation",
}
REQUIRED_STRATEGY_FIELDS = {
    "strategy_id", "display_name", "family", "direction", "horizon", "evidence_grade",
    "data_tier", "context_filter", "setup_and_trigger", "confirmation", "entry_window",
    "execution", "exit_package", "noise_guards", "parameter_grid", "primary_error_state",
    "test_wave", "implementation_notes",
}
REFERENCE_MANIFESTS = {
    "CTL01": "fixed_time_control_intraday_v1.json",
    "CTL04": "rsi15_daily40_intraday_v1.json",
    "MR02": "rsi_willr_recovery_intraday_v1.json",
    "MR03": "bollinger_rsi_reentry_intraday_v1.json",
    "TR01": "ema9_21_vwap_trend_intraday_v1.json",
    "TR03": "macd_vwap_momentum_intraday_v1.json",
    "TR07": "vwap_pullback_continuation_intraday_v1.json",
    "BO01": "orb15_volume_breakout_intraday_v1.json",
    "RS01": "relative_strength_volume_momentum_intraday_v1.json",
}


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def canonical_hash(value: Any) -> str:
    return sha256_bytes(json.dumps(value, sort_keys=True, separators=(",", ":")).encode())


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def validate(catalogue: dict[str, Any], waves: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    unknown = set(catalogue) - EXPECTED_TOP_LEVEL
    missing = EXPECTED_TOP_LEVEL - set(catalogue)
    if unknown: errors.append(f"unknown catalogue fields: {sorted(unknown)}")
    if missing: errors.append(f"missing catalogue fields: {sorted(missing)}")
    strategies = catalogue.get("strategies", [])
    if len(strategies) != 96: errors.append(f"expected 96 strategies, found {len(strategies)}")
    ids: list[str] = []
    for item in strategies:
        sid = item.get("strategy_id", "<missing>")
        ids.append(sid)
        extra = set(item) - REQUIRED_STRATEGY_FIELDS
        absent = REQUIRED_STRATEGY_FIELDS - set(item)
        if extra: errors.append(f"{sid}: unknown fields {sorted(extra)}")
        if absent: errors.append(f"{sid}: missing fields {sorted(absent)}")
        if item.get("exit_package") not in catalogue.get("exit_packages", {}):
            errors.append(f"{sid}: unknown exit package {item.get('exit_package')}")
        bad_guards = set(item.get("noise_guards", [])) - set(catalogue.get("noise_guards", {}))
        if bad_guards: errors.append(f"{sid}: unknown noise guards {sorted(bad_guards)}")
        if item.get("data_tier") not in catalogue.get("data_tiers", {}):
            errors.append(f"{sid}: unknown data tier {item.get('data_tier')}")
    if len(set(ids)) != len(ids): errors.append("duplicate strategy IDs")
    wave_ids: list[str] = []
    for wave in (1, 2, 3):
        members = waves.get(f"wave_{wave}", [])
        wave_ids.extend(members)
        for sid in members:
            match = next((s for s in strategies if s.get("strategy_id") == sid), None)
            if match is None: errors.append(f"wave {wave}: unknown strategy {sid}")
            elif match.get("test_wave") != wave: errors.append(f"{sid}: wave mismatch")
    if sorted(wave_ids) != sorted(ids): errors.append("wave file does not cover every strategy exactly once")
    return errors


def workload_for(strategy: dict[str, Any], catalogue_hash: str, symbols: list[str], args: argparse.Namespace) -> dict[str, Any]:
    sid = strategy["strategy_id"]
    ref = REFERENCE_MANIFESTS.get(sid)
    tier = strategy["data_tier"]
    dependency_state = {
        "D1": "STOCK_OHLCV_AVAILABLE_NEEDS_DETECTOR",
        "D2": "REQUIRES_ALIGNED_NIFTY_SECTOR_VIX_AUDIT",
        "D3": "REQUIRES_POINT_IN_TIME_CROSS_SECTIONAL_PANEL",
    }[tier]
    return {
        "workload_schema_version": 1,
        "workload_id": f"hybrid_{sid.lower()}_common_target_v1",
        "catalogue_id": "nifty_hybrid_technical_strategy_catalogue_v1",
        "catalogue_sha256": catalogue_hash,
        "strategy_sha256": canonical_hash(strategy),
        "strategy": strategy,
        "execution_contract": {
            "decision": "completed_bar_only",
            "entry_fill": "next_available_1m_bar_open",
            "exit_mode": "TARGET_ONLY",
            "same_session_target_pct_from_buy_price": 0.3,
            "swing_target_pct_from_original_buy_price": 1.0,
            "promotion_to_swing": "if_same_session_target_not_filled",
            "stop_loss": None,
            "indicator_exit": None,
            "capital_return": "only_after_trade_closes",
            "tax_pct_on_positive_profit": 35.0,
        },
        "data": {
            "source": "csv_1m_ist",
            "csv_dir": str(args.csv_dir.resolve()),
            "date_start": args.start,
            "date_end": args.end,
            "symbols": symbols,
            "excluded_symbols": sorted({x.upper() for x in args.exclude}),
            "timezone": "Asia/Kolkata",
            "require_complete_qualified_sessions": True,
        },
        "portfolio_scenarios": [
            {"id": "finite_16l_8x2l", "initial_cash_inr": 1_600_000, "ticket_size_inr": 200_000, "max_open_positions": 8},
            {"id": "unlimited_capital", "initial_cash_inr": None, "ticket_size_inr": 200_000, "max_open_positions": None},
        ],
        "runtime": {"workers": args.workers, "resume": True, "persist_postgres": True, "write_csv": True, "write_json": True, "write_html": True},
        "implementation": {
            "reference_manifest": f"config/strategies/{ref}" if ref else None,
            "dependency_state": dependency_state,
            "entry_detector_status": "REFERENCE_MANIFEST_AVAILABLE" if ref else "DETECTOR_REQUIRED",
            "full_run_authorized": False,
            "probability": "NOT_CALIBRATED",
        },
    }


def write_outputs(catalogue: dict[str, Any], catalogue_path: Path, waves_path: Path, args: argparse.Namespace) -> None:
    raw = catalogue_path.read_bytes()
    catalogue_hash = sha256_bytes(raw)
    excluded = {x.upper().removesuffix(".CSV") for x in args.exclude}
    symbols = sorted(p.stem.upper() for p in args.csv_dir.glob("*.csv") if p.stem.upper() not in excluded)
    if not symbols: raise SystemExit("no CSV symbols found")
    args.output_dir.mkdir(parents=True, exist_ok=True)
    (args.output_dir / "catalogue.json").write_bytes(raw)
    (args.output_dir / "test_waves.json").write_bytes(waves_path.read_bytes())
    index_rows = []
    for strategy in catalogue["strategies"]:
        workload = workload_for(strategy, catalogue_hash, symbols, args)
        work_dir = args.output_dir / strategy["strategy_id"]
        work_dir.mkdir(exist_ok=True)
        (work_dir / "workload.json").write_text(json.dumps(workload, indent=2), encoding="utf-8")
        index_rows.append({
            "strategy_id": strategy["strategy_id"], "display_name": strategy["display_name"],
            "family": strategy["family"], "wave": strategy["test_wave"], "data_tier": strategy["data_tier"],
            "entry_detector_status": workload["implementation"]["entry_detector_status"],
            "dependency_state": workload["implementation"]["dependency_state"],
            "workload": str((work_dir / "workload.json").relative_to(args.output_dir)),
        })
    with (args.output_dir / "workload_index.csv").open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=index_rows[0].keys()); writer.writeheader(); writer.writerows(index_rows)
    feature_rows = [{
        "strategy_id": row["strategy_id"], "data_tier": row["data_tier"],
        "required_source": {
            "D1": "qualified stock OHLCV",
            "D2": "stock plus aligned NIFTY sector and India VIX OHLCV",
            "D3": "synchronized point-in-time cross-sectional panel and breadth",
        }[row["data_tier"]],
        "entry_detector_status": row["entry_detector_status"],
        "dependency_state": row["dependency_state"],
    } for row in index_rows]
    with (args.output_dir / "feature_map.csv").open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=feature_rows[0].keys()); writer.writeheader(); writer.writerows(feature_rows)
    validation = {
        "status": "PASS", "validated_at": datetime.now(timezone.utc).isoformat(),
        "catalogue_sha256": catalogue_hash, "strategy_count": len(index_rows),
        "symbol_count": len(symbols), "excluded_symbols": sorted(excluded),
        "date_start": args.start, "date_end": args.end,
        "common_exit": "0.3% same-session target; if unfilled, 1.0% swing target from original buy price; target-only",
        "reference_manifest_count": sum(x["entry_detector_status"] == "REFERENCE_MANIFEST_AVAILABLE" for x in index_rows),
        "full_run_authorized": False,
    }
    (args.output_dir / "validation.json").write_text(json.dumps(validation, indent=2), encoding="utf-8")
    print(json.dumps(validation, indent=2))


def smoke(args: argparse.Namespace) -> None:
    index = list(csv.DictReader((args.output_dir / "workload_index.csv").open(encoding="utf-8")))
    failures = []
    for row in index:
        p = args.output_dir / row["workload"]
        w = load_json(p)
        exit_contract = w["execution_contract"]
        if exit_contract["exit_mode"] != "TARGET_ONLY" or exit_contract["same_session_target_pct_from_buy_price"] != 0.3 or exit_contract["swing_target_pct_from_original_buy_price"] != 1.0:
            failures.append(f"{row['strategy_id']}: exit contract mismatch")
        symbol_path = Path(w["data"]["csv_dir"]) / f"{args.smoke_symbol.upper()}.csv"
        if not symbol_path.exists(): failures.append(f"{row['strategy_id']}: missing smoke CSV {symbol_path}")
    result = {"status": "FAIL" if failures else "PASS", "workloads_checked": len(index), "smoke_symbol": args.smoke_symbol.upper(), "failures": failures}
    (args.output_dir / "smoke_validation.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps(result, indent=2))
    if failures: raise SystemExit(1)


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("command", choices=("validate", "setup", "smoke"))
    p.add_argument("--catalogue", type=Path, required=True)
    p.add_argument("--waves", type=Path, required=True)
    p.add_argument("--csv-dir", type=Path, required=True)
    p.add_argument("--output-dir", type=Path, required=True)
    p.add_argument("--start", default="2015-02-02")
    p.add_argument("--end", default="2025-08-06")
    p.add_argument("--workers", type=int, default=2)
    p.add_argument("--exclude", nargs="*", default=["TMPV"])
    p.add_argument("--smoke-symbol", default="RELIANCE")
    args = p.parse_args()
    catalogue, waves = load_json(args.catalogue), load_json(args.waves)
    errors = validate(catalogue, waves)
    if errors:
        print(json.dumps({"status": "FAIL", "errors": errors}, indent=2)); return 1
    if args.command == "validate":
        print(json.dumps({"status": "PASS", "strategy_count": 96}, indent=2)); return 0
    if args.command == "setup": write_outputs(catalogue, args.catalogue, args.waves, args)
    else: smoke(args)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
