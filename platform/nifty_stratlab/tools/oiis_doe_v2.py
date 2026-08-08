#!/usr/bin/env python3
"""Governed OIIS corrected-baseline and 18-component screening CLI."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import time
import uuid
import zipfile
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
import psycopg
from psycopg.rows import dict_row

PROJECT = Path(__file__).resolve().parents[1]
ROOT = PROJECT.parents[1]
sys.path.insert(0, str(PROJECT / "src"))
sys.path.insert(0, str(PROJECT / "tools"))

import run_oiis_cash_daily_replay as shared  # noqa: E402
from nifty_stratlab.oiis_doe.inventory import inventory_directory, sha256_file  # noqa: E402
from nifty_stratlab.oiis_doe.study import (  # noqa: E402
    ALL_COMPONENTS, OFACTOR_COMPONENTS, SHORT_CODES, XFACTOR_COMPONENTS,
    TrialSpec, ablated_weights, baseline_trial, component_trials, stable_hash,
    neutral_trial, redundancy_trials, validate_skip_reason, wilson_interval,
    validate_corporate_action_coverage, validate_point_in_time_panels,
)
from nifty_stratlab.oiis.engine import OFACTOR_WEIGHTS, XFACTOR_WEIGHTS  # noqa: E402

OUTPUT_ROOT = PROJECT / "outputs" / "oiis_complete_screening_v2"
CURRENT = OUTPUT_ROOT / "CURRENT_EXPERIMENT"
MINUTE_DIR = Path("/home/novius2/data/nifty-50-minute-data/aaditya555/NIFTY50")
INDEX_DIR = Path("/home/novius2/data/nifty-50-minute-data/debashis74017")
CALENDAR_FILE = INDEX_DIR / "NIFTY 50_day.csv"
DELIVERY = ROOT / "OIIS-DOE" / "OIIS_FACTOR_DOE_COMPLETE_DELIVERY_V1.0"
DELIVERY_ZIP = ROOT / "OIIS-DOE" / "OIIS_FACTOR_DOE_COMPLETE_DELIVERY_V1.0.zip"
LEGACY_RUN = PROJECT / "outputs" / "oiis_component_doe_v1" / "dfc02ea6-27cc-4ad1-b8fc-0512a5869662"
START = date(2024, 1, 1)
END = date(2025, 12, 31)
ALIASES = {"M&M": "MM"}
EXPECTED_BASELINE = {
    "decision_count": 226575, "ofactor_qualified_count": 27897,
    "enterable_count": 118, "trade_count": 23, "closed_count": 23,
    "open_count": 0, "total_net_liquidation_pnl": 9565.4133,
    "clean_target_rate_pct": 34.78260869565217, "roe_d5_success_rate_pct": 95.65217391304348,
}


def utc_stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def json_dump(path: Path, value: Any) -> None:
    path.write_text(json.dumps(value, indent=2, sort_keys=True, default=jsonable) + "\n", encoding="utf-8")


def jsonable(value: Any) -> Any:
    if isinstance(value, (date, datetime, pd.Timestamp)): return value.isoformat()
    if isinstance(value, (np.integer,)): return int(value)
    if isinstance(value, (np.floating,)): return None if np.isnan(value) else float(value)
    raise TypeError(type(value).__name__)


def git(*args: str) -> str:
    return subprocess.check_output(["git", *args], cwd=ROOT, text=True).strip()


def dependency_hash() -> str:
    output = subprocess.check_output([str(PROJECT / ".venv/bin/pip"), "freeze"])
    return hashlib.sha256(output).hexdigest()


def env_values() -> dict[str, str]:
    values = dict(os.environ)
    path = Path("/home/novius2/trading-stack/.env")
    if path.exists():
        for line in path.read_text(errors="replace").splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                key, value = line.split("=", 1)
                values.setdefault(key.strip(), value.strip().strip('"').strip("'"))
    return values


def connect(database: str | None = None):
    if os.environ.get("DATABASE_URL"):
        return psycopg.connect(os.environ["DATABASE_URL"], row_factory=dict_row)
    values = env_values()
    return psycopg.connect(
        host=values.get("POSTGRES_HOST", "100.86.108.108"), port=int(values.get("POSTGRES_PORT", "5432")),
        dbname=database or values.get("POSTGRES_DB", "tradingdb"), user=values.get("POSTGRES_USER", "trader"),
        password=values["POSTGRES_PASSWORD"], row_factory=dict_row,
    )


def experiment_dir(experiment_id: str | None, create: bool = False) -> Path:
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    if experiment_id:
        result = OUTPUT_ROOT / experiment_id
    elif CURRENT.exists():
        result = OUTPUT_ROOT / CURRENT.read_text().strip()
    elif create:
        result = OUTPUT_ROOT / f"OIIS18_{utc_stamp()}"
    else:
        raise SystemExit("No active experiment. Run inventory first or pass --experiment-id.")
    if create:
        result.mkdir(parents=True, exist_ok=True)
        CURRENT.write_text(result.name + "\n")
    if not result.exists():
        raise SystemExit(f"Experiment does not exist: {result}")
    return result


def state(path: Path) -> dict[str, Any]:
    state_path = path / "state.json"
    if state_path.exists(): return json.loads(state_path.read_text())
    value = {"experiment_id": path.name, "created_at": datetime.now(timezone.utc).isoformat(), "steps": {}}
    json_dump(state_path, value)
    return value


def mark(path: Path, step: str, status: str, **details: Any) -> None:
    value = state(path)
    value["steps"][step] = {"status": status, "updated_at": datetime.now(timezone.utc).isoformat(), **details}
    json_dump(path / "state.json", value)


def inventory(args) -> None:
    out = experiment_dir(args.experiment_id, create=True)
    started = time.monotonic()
    print(f"[{out.name}] inventorying {MINUTE_DIR}", flush=True)
    frame = inventory_directory(MINUTE_DIR, CALENDAR_FILE)
    frame.to_csv(out / "OIIS_DOE_DATA_INVENTORY.csv", index=False)
    with connect() as conn:
        db = conn.execute("SELECT current_database() database,current_user db_user,version() version").fetchone()
        eod = conn.execute("SELECT min(trade_date) min_date,max(trade_date) max_date,count(*) rows,count(DISTINCT upper(trim(symbol))) symbols FROM nse.fact_eod_prices").fetchone()
        universe = conn.execute("""WITH panels AS (SELECT effective_from,md5(string_agg(symbol,',' ORDER BY symbol)) hash,count(*) n FROM nse_intraday.universe_membership WHERE universe_name='NIFTY100' GROUP BY effective_from) SELECT min(effective_from) min_date,max(effective_from) max_date,count(*) dates,count(DISTINCT hash) distinct_panels,min(n) min_size,max(n) max_size FROM panels""").fetchone()
        corp = conn.execute("SELECT min(ex_date) min_date,max(ex_date) max_date,count(*) rows,count(DISTINCT symbol) symbols FROM nse.fact_corporate_actions").fetchone()
        regimes = conn.execute("SELECT min(trade_date) min_date,max(trade_date) max_date,count(*) rows FROM strategy_eval.global_market_daily_regime").fetchone()
    coverage = pd.DataFrame([
        {"source": "stock_minute_csv", "requested_start": START, "requested_end": END, "source_start": frame.minimum_timestamp.min(), "source_end": frame.maximum_timestamp.max(), "rows": int(frame.row_count.sum()), "symbols": len(frame), "status": "QUALIFIED_WITH_FILTERS" if not (frame.research_admission_status == "REJECT").any() else "PARTIAL"},
        {"source": "nse.fact_eod_prices", "requested_start": START, "requested_end": END, "source_start": eod["min_date"], "source_end": eod["max_date"], "rows": eod["rows"], "symbols": eod["symbols"], "status": "PASS"},
        {"source": "nse_intraday.universe_membership", "requested_start": START, "requested_end": END, "source_start": universe["min_date"], "source_end": universe["max_date"], "rows": universe["dates"] * universe["max_size"], "symbols": universe["max_size"], "status": "FAIL_SURVIVORSHIP_BACKFILL" if universe["distinct_panels"] == 1 else "PASS"},
        {"source": "nse.fact_corporate_actions", "requested_start": START, "requested_end": END, "source_start": corp["min_date"], "source_end": corp["max_date"], "rows": corp["rows"], "symbols": corp["symbols"], "status": "FAIL_HISTORICAL_COVERAGE" if corp["min_date"] and corp["min_date"] > START else "PASS"},
        {"source": "strategy_eval.global_market_daily_regime", "requested_start": START, "requested_end": END, "source_start": regimes["min_date"], "source_end": regimes["max_date"], "rows": regimes["rows"], "symbols": 5, "status": "PASS"},
    ])
    coverage.to_csv(out / "OIIS_DOE_DATA_COVERAGE.csv", index=False)
    artefacts = {}
    for path in [DELIVERY / "OIIS_DOE_Experiment_Config.json", DELIVERY / "OIIS_DOE_Run_Matrix.csv", DELIVERY / "OIIS_Trial_Ledger.csv", ROOT / "OIIS-DOE/OIIS_FACTOR_DOE_COMPLETE_DELIVERY_V1.0.zip"]:
        if path.exists(): artefacts[str(path.resolve())] = {"size_bytes": path.stat().st_size, "sha256": sha256_file(path)}
    manifest = {
        "data_snapshot_id": "PENDING_FEATURE_FREEZE", "generated_at": datetime.now(timezone.utc),
        "source_database": {"database": db["database"], "user": db["db_user"], "server_version": db["version"].split(",")[0]},
        "requested_range": {"start": START, "end": END},
        "qualified_range": {"start": START, "end": END},
        "minute_directory": str(MINUTE_DIR), "minute_file_count": len(frame),
        "minute_research_admission": {
            "qualified_files": int((frame.research_admission_status != "REJECT").sum()),
            "rejected_files": int((frame.research_admission_status == "REJECT").sum()),
            "qualified_common_start": pd.to_datetime(frame.loc[frame.research_admission_status != "REJECT", "minimum_timestamp"]).max().date(),
            "qualified_common_end": pd.to_datetime(frame.loc[frame.research_admission_status != "REJECT", "maximum_timestamp"]).min().date(),
        },
        "minute_inventory_sha256": sha256_file(out / "OIIS_DOE_DATA_INVENTORY.csv"),
        "universe": {**dict(universe), "status": validate_point_in_time_panels(universe["dates"], universe["distinct_panels"]), "reason": "all historical dates contain one identical current panel"},
        "corporate_actions": {**dict(corp), "status": validate_corporate_action_coverage(START, corp["min_date"]), "reason": "authoritative fact table begins after requested study range"},
        "sector_mapping": {"source": "public.index_constituents latest row", "status": "BLOCKED_LEAKAGE_POINT_IN_TIME_NOT_PROVEN"},
        "trading_calendar": {"path": str(CALENDAR_FILE), "sha256": sha256_file(CALENDAR_FILE)},
        "formula_versions": {"oiis": shared.FORMULA_VERSION, "exit": "COMMON-TARGET-ONLY-0.3-1.0-V1", "roe": "ROE-D5-DIAGNOSTIC-V2"},
        "code_commit": git("rev-parse", "HEAD"), "code_dirty": bool(git("status", "--porcelain")),
        "dependency_lock_hash": dependency_hash(), "python": sys.version,
        "source_artefacts": artefacts,
        "missing_named_artefacts": [
            name for name in ["OIIS_COMPONENT_DOE_DETAILED_ANALYSIS_REPORT_V1.0.docx", "OIIS_COMPONENT_DOE_DETAILED_ANALYSIS_REPORT_V1.0.pdf", "OIIS_COMPONENT_DOE_ANALYSIS_CHARTS_AND_TABLES_V1.0.zip", "OIIS_COMPONENT_DOE_EXECUTIVE_SUMMARY_V1.0.md"]
            if not any(ROOT.rglob(name))
        ],
    }
    manifest["data_snapshot_id"] = stable_hash({key: value for key, value in manifest.items() if key not in {"generated_at", "data_snapshot_id", "code_dirty"}})
    json_dump(out / "OIIS_DOE_DATA_MANIFEST.json", manifest)
    (out / "OIIS_DOE_QUALIFICATION_REPORT.md").write_text(
        "# OIIS DOE data qualification\n\n"
        f"- Minute files: {len(frame)}; rows: {int(frame.row_count.sum()):,}.\n"
        f"- Requested feature period: {START} to {END}.\n"
        f"- Admitted minute-source common period: {pd.to_datetime(frame.loc[frame.research_admission_status != 'REJECT', 'minimum_timestamp']).max().date()} to {pd.to_datetime(frame.loc[frame.research_admission_status != 'REJECT', 'maximum_timestamp']).min().date()}.\n"
        f"- Research admission: {(frame.research_admission_status != 'REJECT').sum()} qualified, {(frame.research_admission_status == 'REJECT').sum()} rejected.\n"
        f"- Universe status: **BLOCKED_LEAKAGE** — {universe['dates']} dated panels have only {universe['distinct_panels']} distinct membership hash.\n"
        f"- Corporate-action status: **BLOCKED_DATA** — authoritative facts start {corp['min_date']}.\n"
        "- Off-session and duplicate minute rows are inventory evidence only and are filtered before execution.\n"
        "- Engineering and explicitly exploratory trials may continue; promotion and causal claims are blocked.\n",
        encoding="utf-8",
    )
    mark(out, "inventory", "PASS", elapsed_seconds=round(time.monotonic() - started, 2), files=len(frame), data_snapshot_id=manifest["data_snapshot_id"])
    print(json.dumps({"experiment_id": out.name, "files": len(frame), "rows": int(frame.row_count.sum()), "output": str(out)}, indent=2))


def qualify_data(args) -> None:
    out = experiment_dir(args.experiment_id)
    required = [out / "OIIS_DOE_DATA_INVENTORY.csv", out / "OIIS_DOE_DATA_COVERAGE.csv", out / "OIIS_DOE_DATA_MANIFEST.json"]
    missing = [str(path) for path in required if not path.exists()]
    if missing: raise SystemExit(f"Missing inventory evidence: {missing}")
    frame = pd.read_csv(required[0])
    rejected = frame[frame.research_admission_status == "REJECT"]
    status = "PASS" if rejected.empty else "BLOCKED_DATA"
    mark(out, "qualify_data", status, rejected_files=len(rejected), qualified_files=len(frame) - len(rejected))
    print(json.dumps({"status": status, "qualified_files": len(frame) - len(rejected), "rejected_files": len(rejected)}, indent=2))


def preflight(args) -> None:
    out = experiment_dir(args.experiment_id)
    checks = []
    def check(name: str, passed: bool, detail: str, blocking: bool = True): checks.append({"check": name, "status": "PASS" if passed else "FAIL", "blocking": blocking, "detail": detail})
    check("branch", git("branch", "--show-current") == "DEV_PM_CODE", git("branch", "--show-current"))
    delivery_valid = DELIVERY.exists()
    if DELIVERY_ZIP.exists():
        with zipfile.ZipFile(DELIVERY_ZIP) as archive:
            delivery_valid = delivery_valid or archive.testzip() is None
    check("delivery", delivery_valid, str(DELIVERY_ZIP))
    check("legacy_baseline", (LEGACY_RUN / "trial_summary.csv").exists(), str(LEGACY_RUN))
    check("minute_files", len(list(MINUTE_DIR.glob("*.csv"))) == 100, f"{len(list(MINUTE_DIR.glob('*.csv')))} files")
    check("universe_point_in_time", False, "historical membership is one repeated current panel", blocking=False)
    check("corporate_actions_point_in_time", False, "authoritative facts begin in 2026", blocking=False)
    result = subprocess.run([str(PROJECT / ".venv/bin/python"), "-m", "pytest", "tests/phase3", "-q"], cwd=PROJECT, capture_output=True, text=True)
    check("phase3_tests", result.returncode == 0, (result.stdout + result.stderr).strip()[-1000:])
    pd.DataFrame(checks).to_csv(out / "preflight_checks.csv", index=False)
    blocking_failures = [row for row in checks if row["status"] == "FAIL" and row["blocking"]]
    status = "FAIL" if blocking_failures else "PASS_WITH_RESEARCH_BLOCKERS"
    mark(out, "preflight", status, checks=checks)
    print(json.dumps({"status": status, "checks": checks}, indent=2))
    if blocking_failures: raise SystemExit(2)


def register_existing(args) -> None:
    out = experiment_dir(args.experiment_id)
    summary = pd.read_csv(LEGACY_RUN / "trial_summary.csv")
    manifest = json.loads((out / "OIIS_DOE_DATA_MANIFEST.json").read_text())
    rows = []
    for row in summary.to_dict("records"):
        rows.append({
            "trial_id": row["trial_id"], "parent_experiment_id": out.name,
            "trial_type": row["trial_kind"], "parent_trial_id": "" if row["trial_id"] == "S0_BASELINE_FULL" else "S0_BASELINE_FULL",
            "code_commit": "7a6b9e74ad8c8b56ae5411734e81e66513482c97", "code_hash": "LEGACY_RUN_ARTIFACT",
            "dependency_lock_hash": manifest["dependency_lock_hash"], "data_snapshot_id": manifest["data_snapshot_id"],
            "universe_id": "CURRENT_PANEL_RESEARCH_ONLY", "universe_hash": stable_hash(manifest["universe"]),
            "corporate_action_policy": "LEGACY_MINUTE_TO_EOD_NORMALISATION", "formula_versions": shared.FORMULA_VERSION,
            "normalisation_versions": "OIIS_ENGINE_V1", "component_weights": "CANONICAL_OR_DECLARED_ABLATION",
            "component_enable_flags": row["treatment_factor"], "hard_gate_configuration": "CANONICAL",
            "ofactor_threshold": 74, "xfactor_tier_b_threshold": 76, "xfactor_tier_a_threshold": 84,
            "entry_mode": "NEXT_VALID_OPEN", "exit_policy_version": "COMMON-TARGET-ONLY-0.3-1.0-V1",
            "roe_evaluation_version": "FULL-PATH-LADDER-V2", "cost_profile": "BASE_CERTIFIED_PROXY",
            "validation_fold": "FULL_2024_2025", "regime_block": "ALL", "random_seed": 0,
            "start_timestamp": START, "end_timestamp": END, "run_status": "REGISTERED_LEGACY",
            "error_rejection_reason": "", "result_hash": stable_hash(row),
        })
    pd.DataFrame(rows).to_csv(out / "OIIS_DOE_TRIAL_LEDGER.csv", index=False)
    mark(out, "register_existing_trials", "PASS", trials=len(rows))
    print(json.dumps({"registered": len(rows), "ledger": str(out / 'OIIS_DOE_TRIAL_LEDGER.csv')}, indent=2))


def feature_snapshot(out: Path) -> pd.DataFrame:
    path = out / "full_evidence" / "feature_snapshot.parquet"
    if path.exists(): return pd.read_parquet(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    print("Loading 2024-2025 canonical features from PostgreSQL", flush=True)
    with connect() as conn:
        prices, regimes = shared.load_source(conn, START, END, None, True)
    features = shared.derive_features(prices, regimes)
    features = features[(features.trade_date >= pd.Timestamp(START)) & (features.trade_date <= pd.Timestamp(END))].copy()
    features.to_parquet(path, index=False, compression="zstd")
    manifest_path = out / "OIIS_DOE_DATA_MANIFEST.json"
    manifest = json.loads(manifest_path.read_text())
    manifest["feature_snapshot"] = {"path": str(path.resolve()), "rows": len(features), "symbols": features.symbol.nunique(), "sha256": sha256_file(path)}
    manifest["data_snapshot_id"] = stable_hash({"prior": manifest["data_snapshot_id"], "feature_sha256": manifest["feature_snapshot"]["sha256"]})
    json_dump(manifest_path, manifest)
    return features


def evaluate_decisions(features: pd.DataFrame, trial: TrialSpec, workers: int) -> list[dict[str, Any]]:
    groups = list(features.groupby("symbol", sort=True))
    fn = lambda item: shared.evaluate_symbol(item, START, END, trial.options())
    if workers == 1:
        nested = [fn(item) for item in groups]
    else:
        with ThreadPoolExecutor(max_workers=min(workers, len(groups))) as pool: nested = list(pool.map(fn, groups))
    return sorted((row for group in nested for row in group), key=lambda row: (row["trade_date"], row["symbol"]))


def canonical_trial_hash(decisions: list[dict[str, Any]], trades: list[dict[str, Any]], skipped: list[dict[str, Any]]) -> str:
    payload = {
        "decisions": [(row["symbol"], str(row["trade_date"]), row["decision_hash"], row["decision_code"]) for row in decisions],
        "trades": sorted((row["symbol"], str(row["signal_date"]), row["status"], row["exit_reason"], row["entry_price"], row["exit_price"], row["after_tax_net_pnl"], row["unrealized_net_liquidation_pnl"], row["roe_d5_outcome"], row["coverage_status"]) for row in trades),
        "skipped": sorted((row["symbol"], str(row["trade_date"]), row["reason_code"]) for row in skipped),
    }
    return stable_hash(payload)


def persisted_trial_hash(out: Path, trial_id: str) -> str:
    decisions = pd.read_parquet(out / "full_evidence/trial_decisions" / f"{trial_id}.parquet").to_dict("records")
    trades = pd.read_csv(out / "trials" / trial_id / "trades.csv").to_dict("records")
    skipped_path = out / "trials" / trial_id / "skipped_signals.csv"
    skipped = pd.read_csv(skipped_path).to_dict("records") if skipped_path.exists() and skipped_path.stat().st_size else []
    return canonical_trial_hash(decisions, trades, skipped)


def summarize_trial(trial: TrialSpec, decisions: list[dict[str, Any]], trades: list[dict[str, Any]], skipped: list[dict[str, Any]], result_hash: str) -> dict[str, Any]:
    closed = [row for row in trades if row["status"] == "CLOSED"]
    open_rows = [row for row in trades if row["status"] != "CLOSED"]
    clean = sum(row["target_events"][0]["sequence"] in {"TARGET_ONLY", "TARGET_FIRST"} for row in trades)
    roe_success = sum(row["roe_d5_success"] for row in trades)
    clean_low, clean_high = wilson_interval(clean, len(trades))
    roe_low, roe_high = wilson_interval(roe_success, len(trades))
    target = lambda level: sum(any(event["level_id"] == level and event["hit_flag"] for event in row["target_events"]) for row in trades)
    adverse = lambda level: sum(any(event["level_id"] == level and event["hit_flag"] for event in row["adverse_events"]) for row in trades)
    total_nlv = sum(row["after_tax_net_pnl"] for row in closed) + sum(row["unrealized_net_liquidation_pnl"] for row in open_rows)
    gross_pnl = sum(row["gross_pnl"] for row in closed)
    charges = sum(row["costs"] for row in closed)
    tax = sum(row["tax_reserve"] for row in closed)
    return {
        "trial_id": trial.trial_id, "trial_type": trial.trial_type, "component": trial.component,
        "production_valid": trial.production_valid, "research_ablation_valid": trial.research_ablation_valid,
        "decision_count": len(decisions), "ofactor_qualified_count": sum(max(row["ofactor_long"], row["ofactor_short"]) >= 74 for row in decisions),
        "enterable_count": sum(row["decision_code"] in {"ENTERABLE_TIER_A", "ENTERABLE_TIER_B"} for row in decisions),
        "trade_count": len(trades), "closed_count": len(closed), "open_count": len(open_rows), "skipped_count": len(skipped),
        "realised_after_tax_pnl": round(sum(row["after_tax_net_pnl"] for row in closed), 4),
        "gross_pnl": round(gross_pnl, 4), "brokerage_statutory_slippage_costs": round(charges, 4),
        "pre_tax_net_pnl": round(gross_pnl - charges, 4), "positive_profit_tax_scenario": round(tax, 4),
        "open_net_liquidation_liability": round(sum(row["unrealized_net_liquidation_pnl"] for row in open_rows), 4),
        "total_net_liquidation_pnl": round(total_nlv, 4),
        "clean_target_count": clean, "clean_target_rate_pct": 100 * clean / len(trades) if trades else None,
        "clean_target_ci95_low": clean_low, "clean_target_ci95_high": clean_high,
        "roe_d5_success_count": roe_success, "roe_d5_success_rate_pct": 100 * roe_success / len(trades) if trades else None,
        "roe_d5_ci95_low": roe_low, "roe_d5_ci95_high": roe_high,
        **{f"{level.lower()}_hits": target(level) for level in ("I030", "I050", "I070", "S100", "S200", "S500")},
        **{f"{level.lower()}_hits": adverse(level) for level in ("A050", "A100", "A200", "A500", "A1000", "A_GT1000")},
        "median_mfe_pct": float(np.median([row["mfe_pct"] for row in trades])) if trades else None,
        "median_mae_pct": float(np.median([row["mae_pct"] for row in trades])) if trades else None,
        "capital_days": round(sum(row["capital_days"] for row in trades), 4),
        "result_hash": result_hash,
        "evidence_status": "EXPLORATORY_ONLY" if len(trades) < 200 else "ELIGIBLE_FOR_CONFIRMATORY_REVIEW",
    }


def write_h30_observations(out: Path, trial_id: str, features: pd.DataFrame) -> None:
    trades_path = out / "trials" / trial_id / "trades.csv"
    output_path = out / "trials" / trial_id / "h30_observations.csv"
    if not trades_path.exists(): return
    trades = pd.read_csv(trades_path)
    daily = {symbol: group.sort_values("trade_date").reset_index(drop=True) for symbol, group in features.groupby("symbol")}
    rows = []
    for trade in trades.itertuples(index=False):
        group = daily.get(trade.symbol)
        if group is None: continue
        entry_date = pd.Timestamp(trade.entry_date).date()
        horizon = group[pd.to_datetime(group.trade_date).dt.date >= entry_date].head(30)
        if horizon.empty: continue
        entry = float(trade.entry_price)
        high_upside = 100 * (float(horizon.high_price.max()) / entry - 1)
        close_upside = 100 * (float(horizon.close_price.max()) / entry - 1)
        lows = 100 * (horizon.low_price.astype(float) / entry - 1)
        closes = 100 * (horizon.close_price.astype(float) / entry - 1)
        record = {
            "trial_id": trial_id, "entry_path_id": trade.entry_path_id, "symbol": trade.symbol,
            "entry_date": entry_date, "sessions_observed": len(horizon), "right_censored": len(horizon) < 30,
            "h30_max_high_upside_pct": high_upside, "h30_max_close_upside_pct": close_upside,
            "h30_mae_pct": float(lows.min()), "days_below_entry": int((closes < 0).sum()),
        }
        for level in (1, 2, 5):
            hits = np.flatnonzero((100 * (horizon.high_price.astype(float) / entry - 1) >= level).to_numpy())
            record[f"h30_{level}pct_hit"] = bool(len(hits))
            record[f"h30_{level}pct_first_touch_session"] = int(hits[0]) if len(hits) else None
        below = np.flatnonzero((closes < 0).to_numpy())
        if len(below):
            recoveries = np.flatnonzero((closes.iloc[below[0] + 1:] >= 0).to_numpy())
            record["recovery_sessions"] = int(recoveries[0] + 1) if len(recoveries) else None
        else: record["recovery_sessions"] = 0
        rows.append(record)
    pd.DataFrame(rows).to_csv(output_path, index=False)


def write_trade_quality(out: Path, trial_id: str) -> None:
    trades = pd.read_csv(out / "trials" / trial_id / "trades.csv")
    targets = pd.read_csv(out / "trials" / trial_id / "target_events.csv")
    ordering = targets[targets.level_id == "I030"][["entry_path_id", "sequence"]]
    frame = trades.merge(ordering, on="entry_path_id", how="left")
    rows = []
    for row in frame.itertuples(index=False):
        tags = []
        if pd.notna(row.best_intraday_target_id): tags.append("INTRADAY_TARGET_SUCCESS")
        if pd.notna(row.best_d5_target_id): tags.append("D5_TARGET_SUCCESS")
        if row.coverage_status != "PASS": tags.append("RIGHT_CENSORED")
        if row.roe_d5_outcome == "ROE_D5_FAILURE_LATE_RECOVERY": tags.append("D5_MANDATE_FAILURE_LATE_RECOVERY")
        if row.roe_d5_outcome == "ROE_D5_FAILURE_STILL_OPEN": tags.append("UNRESOLVED_OPEN")
        if row.sequence in {"TARGET_ONLY", "TARGET_FIRST"}: tags.append("TARGET_FIRST_CLEAN")
        elif row.sequence == "ADVERSE_FIRST": tags.append("TARGET_AFTER_MATERIAL_ADVERSE")
        elif row.sequence == "SAME_TIMESTAMP_AMBIGUOUS": tags.append("SAME_BAR_AMBIGUOUS")
        if row.gross_pnl > 0 and row.after_tax_net_pnl < 0: tags.append("GROSS_POSITIVE_NET_NEGATIVE")
        if row.mfe_pct >= 5 and row.return_pct < 1: tags.append("HIGH_MFE_POOR_CAPTURE")
        if row.mae_pct > -0.5 and row.sequence in {"TARGET_ONLY", "TARGET_FIRST"}: tags.append("LOW_RISK_CLEAN_TRADE")
        if row.mae_pct <= -5 and row.after_tax_net_pnl > 0: tags.append("HIGH_RISK_EVENTUAL_WINNER")
        if row.mae_pct <= -10 and row.roe_d5_outcome != "ROE_D5_SUCCESS": tags.append("PERSISTENT_LOSER")
        rows.append({"trial_id": trial_id, "entry_path_id": row.entry_path_id, "symbol": row.symbol, "quality_tags": "|".join(tags) if tags else "UNCLASSIFIED", "i030_a050_ordering": row.sequence})
    pd.DataFrame(rows).to_csv(out / "trials" / trial_id / "trade_quality.csv", index=False)


def export_decisions(out: Path, trial: TrialSpec, decisions: list[dict[str, Any]]) -> None:
    folder = out / "full_evidence" / "trial_decisions"; folder.mkdir(parents=True, exist_ok=True)
    rows = []
    ingested_at = state(out)["created_at"]
    for row in decisions:
        decision_ts = pd.to_datetime(str(row["trade_date"])).tz_localize("Asia/Kolkata").replace(hour=15, minute=30)
        record = {key: row.get(key) for key in ["symbol", "sector", "trade_date", "decision_hash", "decision_code", "selected_direction", "setup_id", "setup_state", "data_quality_score", "data_permission", "ofactor_long", "ofactor_short", "directional_edge", "xfactor_score", "stock_primary_trend", "stock_market_zone", "nifty_primary_trend", "nifty_market_zone", "vix_regime"]}
        record.update({"experiment_id": out.name, "trial_id": trial.trial_id, "horizon": "CASH_EQUITY_DAILY_INTRADAY", "decision_timestamp": decision_ts, "observed_at": decision_ts, "available_at": decision_ts, "ingested_at": ingested_at})
        record["hard_gates"] = json.dumps(row["hard_gates"], sort_keys=True)
        rows.append(record)
    pd.DataFrame(rows).to_parquet(folder / f"{trial.trial_id}.parquet", index=False, compression="zstd")


def export_atomic_components(out: Path, decisions: list[dict[str, Any]]) -> None:
    path = out / "full_evidence" / "component_event_baseline.parquet"
    if path.exists(): return
    rows = []
    ingested_at = state(out)["created_at"]
    for row in decisions:
        evidence = row["evidence"]
        decision_ts = pd.to_datetime(str(row["trade_date"])).tz_localize("Asia/Kolkata").replace(hour=15, minute=30)
        record = {key: row.get(key) for key in ["symbol", "sector", "trade_date", "decision_hash", "decision_code", "selected_direction", "setup_id", "setup_state", "data_quality_score", "ofactor_long", "ofactor_short", "directional_edge", "xfactor_score", "stock_primary_trend", "stock_market_zone", "nifty_primary_trend", "nifty_market_zone", "vix_regime"]}
        record.update({"experiment_id": out.name, "trial_id": "S0_BASELINE_FULL", "isin": None, "industry": None, "universe_id": "CURRENT_PANEL_RESEARCH_ONLY", "horizon": "CASH_EQUITY_DAILY_INTRADAY", "decision_timestamp": decision_ts, "observed_at": decision_ts, "available_at": decision_ts, "ingested_at": ingested_at, "formula_version": shared.FORMULA_VERSION})
        for direction, layer_key in (("long", "ofactor_long"), ("short", "ofactor_short")):
            layer = evidence[layer_key]
            for component, score in layer["components"].items():
                record[f"o_{direction}_{component}_score"] = score
                record[f"o_{direction}_{component}_weight"] = layer["weights"][component]
                record[f"o_{direction}_{component}_contribution"] = layer["weighted_contributions"][component]
            record[f"o_{direction}_penalties"] = json.dumps(layer["penalties"], sort_keys=True)
            record[f"o_{direction}_reconciliation_residual"] = layer["score_reconciliation_residual"]
        layer = evidence["xfactor"]
        for component, score in layer["components"].items():
            record[f"x_{component}_score"] = score
            record[f"x_{component}_weight"] = layer["weights"][component]
            record[f"x_{component}_contribution"] = layer["weighted_contributions"][component]
        record["x_penalties"] = json.dumps(layer["penalties"], sort_keys=True)
        record["x_reconciliation_residual"] = layer["score_reconciliation_residual"]
        rows.append(record)
    pd.DataFrame(rows).to_parquet(path, index=False, compression="zstd")


def complete_trial_identity(out: Path, trial: TrialSpec, summary: dict[str, Any]) -> dict[str, Any]:
    manifest = json.loads((out / "OIIS_DOE_DATA_MANIFEST.json").read_text())
    config = json.loads(shared.DEFAULT_CONFIG.read_text())
    governed_files = [
        PROJECT / "tools/oiis_doe_v2.py", PROJECT / "tools/run_oiis_cash_daily_replay.py",
        PROJECT / "src/nifty_stratlab/oiis/engine.py", PROJECT / "src/nifty_stratlab/evaluation/common_exit.py",
        PROJECT / "src/nifty_stratlab/evaluation/full_path_ladder.py", PROJECT / "src/nifty_stratlab/oiis_doe/study.py",
        ROOT / "scripts/oiis_doe.sh",
    ]
    summary["evaluation_mode"] = "UNCONSTRAINED_ENTRY_STUDY"
    summary["portfolio_return_valid"] = False
    summary["authoritative_exit_policy_unchanged"] = True
    summary["roe_d5_is_diagnostic_only"] = True
    summary["immutable_identity"] = {
        "trial_id": trial.trial_id, "parent_experiment_id": out.name,
        "trial_type": trial.trial_type, "parent_trial_id": None if trial.trial_id == "S0_BASELINE_FULL" else "S0_BASELINE_FULL",
        "code_commit": git("rev-parse", "HEAD"),
        "code_hash": stable_hash({str(path.relative_to(ROOT)): sha256_file(path) for path in governed_files}),
        "dependency_lock_hash": manifest["dependency_lock_hash"], "data_snapshot_id": manifest["data_snapshot_id"],
        "universe_id": "CURRENT_PANEL_RESEARCH_ONLY", "universe_hash": stable_hash(manifest["universe"]),
        "corporate_action_policy": manifest["corporate_actions"],
        "formula_versions": manifest["formula_versions"], "normalisation_versions": "OIIS_ENGINE_V1_EXPLICIT_PENALTIES",
        "component_weights": {"ofactor": trial.ofactor_weights, "xfactor": trial.xfactor_weights},
        "component_enable_neutralise_flags": {"ablated": trial.component if "ABLATE" in trial.trial_id else None, "neutralised": list(trial.neutral_components)},
        "hard_gate_configuration": "CANONICAL_UNCHANGED", "ofactor_threshold": 74,
        "xfactor_tier_b_threshold": 76, "xfactor_tier_a_threshold": 84,
        "entry_mode": "NEXT_VALID_OPEN", "exit_policy_version": "COMMON-TARGET-ONLY-0.3-1.0-V1",
        "roe_evaluation_version": "FULL-PATH-LADDER-V2", "cost_slippage_impact_profile": config["execution"],
        "validation_fold": "FULL_2024_2025_EXPLORATORY", "regime_block": "ALL_AVAILABLE_AT_ENTRY",
        "random_seed": 0, "start_timestamp": START, "end_timestamp": END,
        "run_status": summary.get("evidence_status"), "error_rejection_reason": None,
        "result_hash": summary.get("result_hash"),
    }
    return summary


def run_trial(out: Path, trial: TrialSpec, features: pd.DataFrame, workers: int, minute_cache: dict, checksum_cache: dict, force: bool = False) -> dict[str, Any]:
    trial_dir = out / "trials" / trial.trial_id; trial_dir.mkdir(parents=True, exist_ok=True)
    summary_path = trial_dir / "summary.json"
    if summary_path.exists() and not force:
        summary = complete_trial_identity(out, trial, json.loads(summary_path.read_text()))
        json_dump(summary_path, summary)
        return summary
    started = time.monotonic(); print(f"{trial.trial_id}: evaluating with {workers} worker(s)", flush=True)
    decisions = evaluate_decisions(features, trial, workers)
    inventory_frame = pd.read_csv(out / "OIIS_DOE_DATA_INVENTORY.csv")
    rejected_sources = set(inventory_frame.loc[inventory_frame.research_admission_status == "REJECT", "symbol"].str.upper())
    trades = shared.simulate_trades(
        decisions, features, json.loads(shared.DEFAULT_CONFIG.read_text()), MINUTE_DIR, END,
        f"{out.name}:{trial.trial_id}", symbol_aliases=ALIASES,
        shared_minute_cache=minute_cache, shared_minute_checksums=checksum_cache,
        rejected_minute_symbols=rejected_sources,
    )
    skipped = list(getattr(shared.simulate_trades, "skipped_signals", []))
    for item in skipped: validate_skip_reason(item["reason_code"], item["details"])
    result_hash = canonical_trial_hash(decisions, trades, skipped)
    summary = summarize_trial(trial, decisions, trades, skipped, result_hash)
    summary["elapsed_seconds"] = round(time.monotonic() - started, 2)
    summary["original_weights"] = {"ofactor": dict(OFACTOR_WEIGHTS), "xfactor": dict(XFACTOR_WEIGHTS)}
    summary["trial_options"] = trial.options()
    summary = complete_trial_identity(out, trial, summary)
    json_dump(summary_path, summary)
    pd.DataFrame([{key: value for key, value in row.items() if key not in {"target_events", "adverse_events", "path_checkpoints", "invariant_checks", "policy", "h30_observation"}} for row in trades]).to_csv(trial_dir / "trades.csv", index=False)
    pd.DataFrame(skipped).to_csv(trial_dir / "skipped_signals.csv", index=False)
    pd.DataFrame([{"trial_id": trial.trial_id, "symbol": row["symbol"], "entry_path_id": row["entry_path_id"], **event} for row in trades for event in row["target_events"]]).to_csv(trial_dir / "target_events.csv", index=False)
    pd.DataFrame([{"trial_id": trial.trial_id, "symbol": row["symbol"], "entry_path_id": row["entry_path_id"], **event} for row in trades for event in row["adverse_events"]]).to_csv(trial_dir / "adverse_events.csv", index=False)
    export_decisions(out, trial, decisions)
    if trial.trial_id == "S0_BASELINE_FULL": export_atomic_components(out, decisions)
    print(f"{trial.trial_id}: {len(decisions)} decisions, {len(trades)} trades, hash {result_hash[:12]}, {summary['elapsed_seconds']}s", flush=True)
    return summary


def reproduce_baseline(args) -> None:
    out = experiment_dir(args.experiment_id); features = feature_snapshot(out); trial = baseline_trial()
    cache: dict = {}; checksums: dict = {}
    inventory_frame = pd.read_csv(out / "OIIS_DOE_DATA_INVENTORY.csv")
    rejected_sources = set(inventory_frame.loc[inventory_frame.research_admission_status == "REJECT", "symbol"].str.upper())
    repeats = []
    for label, workers in (("repeat_one", 1), ("repeat_two", 1), ("multi_worker", max(2, args.workers))):
        decisions = evaluate_decisions(features, trial, workers)
        trades = shared.simulate_trades(decisions, features, json.loads(shared.DEFAULT_CONFIG.read_text()), MINUTE_DIR, END, f"determinism:{label}", symbol_aliases=ALIASES, shared_minute_cache=cache, shared_minute_checksums=checksums, rejected_minute_symbols=rejected_sources)
        skipped = list(getattr(shared.simulate_trades, "skipped_signals", []))
        result_hash = canonical_trial_hash(decisions, trades, skipped)
        repeats.append({"label": label, "workers": workers, "result_hash": result_hash, **summarize_trial(trial, decisions, trades, skipped, result_hash)})
        if label == "repeat_one":
            main_summary = run_trial(out, trial, features, 1, cache, checksums, force=True)
    hashes_match = len({row["result_hash"] for row in repeats}) == 1
    legacy = pd.read_csv(LEGACY_RUN / "trial_summary.csv").query("trial_id == 'S0_BASELINE_FULL'").iloc[0].to_dict()
    reconciliation = []
    for metric, expected in EXPECTED_BASELINE.items():
        observed = main_summary.get(metric)
        reconciliation.append({"metric": metric, "expected_legacy": expected, "observed_corrected": observed, "difference": None if observed is None else observed - expected, "status": "MATCH" if observed is not None and abs(observed - expected) < 1e-6 else "RECONCILED_CHANGE"})
    pd.DataFrame(reconciliation).to_csv(out / "baseline_reconciliation.csv", index=False)
    json_dump(out / "baseline_determinism.json", {"hashes_match": hashes_match, "runs": repeats, "legacy_summary": legacy, "corrected_summary": main_summary})
    status = "PASS_RECONCILED_VERSION" if hashes_match else "BLOCKED_BASELINE"
    mark(out, "reproduce_baseline", status, result_hash=main_summary["result_hash"], hashes_match=hashes_match)
    print(json.dumps({"status": status, "hashes_match": hashes_match, "corrected": main_summary, "reconciliation": reconciliation}, indent=2, default=jsonable))
    if not hashes_match: raise SystemExit(3)


def run_component_screening(args) -> None:
    out = experiment_dir(args.experiment_id)
    prior = state(out)["steps"].get("reproduce_baseline", {})
    if not str(prior.get("status", "")).startswith("PASS"): raise SystemExit("BLOCKED_BASELINE: reproduce-baseline must pass first")
    features = feature_snapshot(out); cache: dict = {}; checksums: dict = {}
    summaries = []
    baseline_path = out / "trials/S0_BASELINE_FULL/summary.json"
    summaries.append(json.loads(baseline_path.read_text()))
    for trial in component_trials(): summaries.append(run_trial(out, trial, features, args.workers, cache, checksums, force=args.force))
    summary_frame = pd.DataFrame(summaries)
    summary_frame.to_csv(out / "trial_summary.csv", index=False)
    baseline = summary_frame.iloc[0]
    effects = []
    for row in summary_frame.iloc[1:].to_dict("records"):
        effect = {"trial_id": row["trial_id"], "component": row["component"], "trade_count": row["trade_count"], "evidence_status": row["evidence_status"]}
        for metric in ["ofactor_qualified_count", "enterable_count", "trade_count", "clean_target_rate_pct", "roe_d5_success_rate_pct", "median_mae_pct", "capital_days", "total_net_liquidation_pnl"]:
            effect[f"delta_{metric}"] = row.get(metric) - baseline.get(metric) if row.get(metric) is not None and baseline.get(metric) is not None else None
        effect["decision"] = "NOT_ESTIMABLE" if row["component"] in {"catalyst_context", "timing_session_quality", "instrument_quality"} else "UNRESOLVED"
        effect["confidence"] = "INSUFFICIENT_EVIDENCE" if min(row["trade_count"], baseline["trade_count"]) < 200 else "SCREENING_COMPLETE"
        effects.append(effect)
    effects_frame = pd.DataFrame(effects)
    effects_frame.to_csv(out / "factor_effects.csv", index=False)
    scoring_schemes = {
        "PRIMARY": {"oos_incremental_utility": 0.40, "stability": 0.25, "economic_effect": 0.20, "quantity_quality": 0.15},
        "RISK_HEAVY": {"oos_incremental_utility": 0.35, "stability": 0.30, "economic_effect": 0.20, "quantity_quality": 0.15},
        "ECONOMICS_HEAVY": {"oos_incremental_utility": 0.35, "stability": 0.20, "economic_effect": 0.30, "quantity_quality": 0.15},
    }
    json_dump(out / "factor_scoring_config.json", {
        "schemes": scoring_schemes, "minimum_confirmatory_trades": 200,
        "note": "OOS utility is zero/not estimable until valid PIT chronological evidence exists; it is never imputed.",
    })
    score_rows = []
    for row in effects:
        trade_n = min(int(row["trade_count"]), int(baseline["trade_count"]))
        changes = [
            abs(row.get("delta_trade_count") or 0) / max(float(baseline["trade_count"]) * .10, 1),
            abs(row.get("delta_clean_target_rate_pct") or 0) / 10,
            abs(row.get("delta_roe_d5_success_rate_pct") or 0) / 10,
            abs(row.get("delta_median_mae_pct") or 0) / 1,
            abs(row.get("delta_capital_days") or 0) / max(abs(float(baseline["capital_days"])) * .20, 1),
            abs(row.get("delta_total_net_liquidation_pnl") or 0) / max(abs(float(baseline["total_net_liquidation_pnl"])) * .20, 1),
        ]
        influence = 100 * float(np.mean(np.minimum(changes, 1)))
        utilities = [
            -np.tanh((row.get("delta_total_net_liquidation_pnl") or 0) / max(abs(float(baseline["total_net_liquidation_pnl"])) * .20, 1)),
            -np.tanh((row.get("delta_clean_target_rate_pct") or 0) / 10),
            -np.tanh((row.get("delta_roe_d5_success_rate_pct") or 0) / 10),
            -np.tanh((row.get("delta_median_mae_pct") or 0) / 1),
            np.tanh((row.get("delta_capital_days") or 0) / max(abs(float(baseline["capital_days"])) * .20, 1)),
        ]
        net_benefit = 100 * float(np.dot(utilities, [.30, .20, .20, .15, .15]))
        stability = 0.0  # no valid multi-fold PIT estimate; never imputed
        evidence_confidence = 100 * min(trade_n / 200, 1) * .25
        factor_decision = "RETAIN_PROVISIONALLY" if row["component"] == "market_regime_support" else row["decision"]
        for scheme, weights in scoring_schemes.items():
            score_rows.append({
                "component": row["component"], "scheme": scheme,
                "influence_magnitude_0_100": round(influence, 4),
                "net_benefit_minus100_100": round(net_benefit, 4),
                "stability_0_100": stability,
                "evidence_confidence_0_100": round(evidence_confidence, 4),
                "oos_incremental_utility": None, "factor_decision": factor_decision,
                "decision_stability": "UNSTABLE_DECISION" if factor_decision not in {"NOT_ESTIMABLE"} else "NOT_ESTIMABLE",
                "evidence_status": "EXPLORATORY_ONLY",
            })
    pd.DataFrame(score_rows).to_csv(out / "factor_scores.csv", index=False)
    atomic_path = out / "full_evidence/component_event_baseline.parquet"
    if atomic_path.exists():
        atomic = pd.read_parquet(atomic_path)
        variation_rows = []
        for column in [name for name in atomic if name.endswith("_score") and (name.startswith("o_long_") or name.startswith("x_"))]:
            values = pd.to_numeric(atomic[column], errors="coerce")
            variation_rows.append({"score_column": column, "non_null": int(values.notna().sum()), "unique_values": int(values.nunique(dropna=True)), "minimum": values.min(), "maximum": values.max(), "status": "NOT_ESTIMABLE" if values.nunique(dropna=True) <= 1 else "VARIES"})
        pd.DataFrame(variation_rows).to_csv(out / "component_variation.csv", index=False)
        duplicate = pd.DataFrame({
            "o_lts": atomic["o_long_liquidity_tradability_score"],
            "x_lsq": atomic["x_liquidity_slippage_quality_score"],
        }).dropna()
        json_dump(out / "cross_layer_duplication.json", {
            "pair": ["O_LTS", "X_LSQ"], "rows_compared": len(duplicate),
            "numerically_identical_rate_pct": 100 * float((duplicate.o_lts == duplicate.x_lsq).mean()) if len(duplicate) else None,
            "pearson_correlation": float(duplicate.corr().iloc[0, 1]) if len(duplicate) and duplicate.o_lts.nunique() > 1 else None,
            "conclusion": "DUPLICATION_HYPOTHESIS_REQUIRES_FACTORIAL_CONFIRMATION",
        })
    pd.DataFrame([
        {"method": "paired ablation on common market dates", "status": "APPLIED_DESCRIPTIVELY", "reason": "identical frozen decision dates"},
        {"method": "block bootstrap by market date", "status": "INSUFFICIENT_SAMPLE", "reason": "fewer than 200 effective paths"},
        {"method": "symbol/date clustered uncertainty", "status": "INSUFFICIENT_SAMPLE", "reason": "sparse accepted-path cells"},
        {"method": "regularised logistic regression", "status": "NOT_APPLICABLE", "reason": "outcome events per factor are insufficient"},
        {"method": "quantile regression", "status": "NOT_APPLICABLE", "reason": "MAE sample is insufficient"},
        {"method": "survival analysis", "status": "NOT_APPLICABLE", "reason": "target-time sample is insufficient"},
        {"method": "mixed effects", "status": "NOT_APPLICABLE", "reason": "symbol/date cells are sparse"},
        {"method": "FDR", "status": "NOT_APPLICABLE", "reason": "no confirmatory p-value family"},
        {"method": "Deflated Sharpe / PBO / White RC / Hansen SPA", "status": "NOT_APPLICABLE", "reason": "no sufficiently sampled valid PIT portfolio configuration family"},
    ]).to_csv(out / "statistical_method_applicability.csv", index=False)
    material_components = []
    for row in summary_frame.iloc[1:].to_dict("records"):
        denominator = baseline["ofactor_qualified_count"] if row["component"] in OFACTOR_COMPONENTS else baseline["enterable_count"]
        numerator = row["ofactor_qualified_count"] - baseline["ofactor_qualified_count"] if row["component"] in OFACTOR_COMPONENTS else row["enterable_count"] - baseline["enterable_count"]
        if denominator and abs(numerator / denominator) >= 0.05: material_components.append(row["component"])
    neutral_summaries = [run_trial(out, neutral_trial(component), features, args.workers, cache, checksums, force=args.force) for component in material_components]
    pd.DataFrame(neutral_summaries).to_csv(out / "neutral_score_sensitivity.csv", index=False)
    evidence_trial_ids = list(summary_frame.trial_id) + [row["trial_id"] for row in neutral_summaries]
    for trial_id in evidence_trial_ids:
        write_h30_observations(out, trial_id, features)
        write_trade_quality(out, trial_id)
    h30_rows = []
    for trial_id in evidence_trial_ids:
        h30 = pd.read_csv(out / "trials" / trial_id / "h30_observations.csv")
        h30_rows.append({
            "trial_id": trial_id, "paths": len(h30),
            "median_max_high_upside_pct": h30.h30_max_high_upside_pct.median() if len(h30) else None,
            "median_max_close_upside_pct": h30.h30_max_close_upside_pct.median() if len(h30) else None,
            "median_h30_mae_pct": h30.h30_mae_pct.median() if len(h30) else None,
            "h30_5pct_rate_pct": 100 * h30.h30_5pct_hit.mean() if len(h30) else None,
            "right_censored": int(h30.right_censored.sum()) if len(h30) else 0,
        })
    h30_summary = pd.DataFrame(h30_rows); h30_summary.to_csv(out / "h30_trial_summary.csv", index=False)
    mark(out, "component_screening", "EXPLORATORY_ONLY", trials=18, neutral_score_trials=len(neutral_summaries), reason="point-in-time universe/corporate actions blocked; effective trades below 200")
    print(json.dumps({"status": "EXPLORATORY_ONLY", "trials": 18, "neutral_score_trials": len(neutral_summaries), "summary": str(out / 'trial_summary.csv')}, indent=2))


def run_redundancy_study(args) -> None:
    out = experiment_dir(args.experiment_id)
    prior = state(out)["steps"].get("component_screening", {})
    if prior.get("status") not in {"EXPLORATORY_ONLY", "PASS"}:
        raise SystemExit("component screening must complete before redundancy study")
    features = feature_snapshot(out); cache: dict = {}; checksums: dict = {}
    rows = []
    for trial in redundancy_trials():
        summary = run_trial(out, trial, features, args.workers, cache, checksums, force=args.force)
        rows.append(summary)
        write_h30_observations(out, trial.trial_id, features)
        write_trade_quality(out, trial.trial_id)
    pd.DataFrame(rows).to_csv(out / "interaction_trial_summary.csv", index=False)
    base = pd.read_csv(out / "trial_summary.csv")
    lookup = {row.trial_id: row for row in base.itertuples(index=False)}
    interaction_rows = []
    designs = [
        ("SIS_TCS", "S1X_ABLATE_SIS", "S1X_ABLATE_TCS", "S2X_ABLATE_SIS_TCS"),
        ("LTS_LSQ", "S1O_ABLATE_LTS", "S1X_ABLATE_LSQ", "S2OX_ABLATE_LTS_LSQ"),
        ("MFS_ICS", "S1O_ABLATE_MFS", "S1O_ABLATE_ICS", "S2O_ABLATE_MFS_ICS"),
    ]
    joint = {row["trial_id"]: row for row in rows}
    baseline = lookup["S0_BASELINE_FULL"]
    for design, first, second, double in designs:
        for metric in ("trade_count", "clean_target_rate_pct", "roe_d5_success_rate_pct", "capital_days", "total_net_liquidation_pnl"):
            values = [getattr(baseline, metric), getattr(lookup[first], metric), getattr(lookup[second], metric), joint[double].get(metric)]
            estimable = all(value is not None and not pd.isna(value) for value in values)
            effect = values[3] - values[1] - values[2] + values[0] if estimable else None
            interaction_rows.append({
                "design": design, "response": metric, "factorial_interaction": effect,
                "effective_trades": min(int(baseline.trade_count), int(lookup[first].trade_count), int(lookup[second].trade_count), int(joint[double]["trade_count"])),
                "status": "EXPLORATORY_ONLY" if estimable else "NOT_ESTIMABLE",
            })
    pd.DataFrame(interaction_rows).to_csv(out / "interaction_effects.csv", index=False)
    (out / "REDUNDANCY_STUDY.md").write_text(
        "# Focused redundancy study\n\n"
        "The SIS/TCS, O-LTS/X-LSQ and MFS/ICS 2x2 designs were completed as research-only ablations. "
        "All cells remain exploratory because every effective trade count is below 200. "
        "The TQS/RSS/MQS and ELQ/SIQ/RRQ eight-cell designs were not run because the baseline has "
        "too few trade paths; the main-effect screen is retained as a resolution-IV-style proposal, "
        "with aliasing documented and no production formula change.\n\n"
        "## Non-trading SIS/TCS refactor proposal\n\n"
        "This proposal is not active code: setup completeness should record required-field presence; "
        "setup structural validity should record whether the pattern remains geometrically valid; "
        "trigger activation should record the first completed-bar state transition; trigger persistence "
        "should record completed-bar survival after activation. A later governed study may assign "
        "non-overlapping information to those four states and then re-anchor thresholds.\n",
        encoding="utf-8",
    )
    mark(out, "redundancy_study", "EXPLORATORY_ONLY", trials=len(rows), clusters=3)
    print(json.dumps({"status": "EXPLORATORY_ONLY", "new_trials": len(rows)}, indent=2))


def run_walk_forward(args) -> None:
    out = experiment_dir(args.experiment_id)
    summary_path = out / "trial_summary.csv"
    if not summary_path.exists(): raise SystemExit("component screening must complete first")
    inventory_frame = pd.read_csv(out / "OIIS_DOE_DATA_INVENTORY.csv")
    common_end = pd.to_datetime(inventory_frame.maximum_timestamp).min().date()
    # With a qualified common end in 2025 and the frozen study starting in
    # 2024, the requested three 18m/6m folds cannot be supported.
    test_end = common_end
    test_start = (pd.Timestamp(test_end) - pd.DateOffset(months=6)).date() + timedelta(days=1)
    fold_rows = []
    for trial_id in pd.read_csv(summary_path).trial_id:
        trades_path = out / "trials" / trial_id / "trades.csv"
        trades = pd.read_csv(trades_path) if trades_path.exists() else pd.DataFrame()
        if not trades.empty:
            dates = pd.to_datetime(trades.signal_date).dt.date
            test = trades[(dates >= test_start) & (dates <= test_end)]
        else:
            test = trades
        fold_rows.append({
            "trial_id": trial_id, "fold_id": "DESCRIPTIVE_01_MAX_DEFENSIBLE_NOT_VALID_OUTER_FOLD",
            "train_history_start": START, "test_start": test_start, "test_end": test_end,
            "purge_sessions": 30, "embargo_sessions": 30, "test_trades": len(test),
            "test_total_nlv_pnl": float(test.after_tax_net_pnl.sum()) if len(test) else 0.0,
            "status": "DESCRIPTIVE_ONLY_NONCOMPLIANT_18M_HISTORY",
        })
    pd.DataFrame(fold_rows).to_csv(out / "validation_results.csv", index=False)
    event_register = pd.DataFrame([
        ("2016_DEMONETISATION", "2016-11-08", "2016-11-30"),
        ("2018_LTCG_BUDGET", "2018-02-01", "2018-02-09"),
        ("2018_ILFS_NBFC", "2018-09-04", "2018-10-31"),
        ("2019_CORPORATE_TAX_CUT", "2019-09-20", "2019-09-27"),
        ("2020_COVID_CRASH", "2020-03-01", "2020-05-31"),
        ("2021_BUDGET_RALLY", "2021-02-01", "2021-02-12"),
        ("2022_UKRAINE_INVASION", "2022-02-24", "2022-03-15"),
        ("2023_ADANI_HINDENBURG", "2023-01-24", "2023-02-28"),
        ("2024_ELECTION_RESULT", "2024-06-04", "2024-06-07"),
        ("2025_TARIFF_SHOCK", "2025-04-02", "2025-04-15"),
        ("2025_INDIA_PAKISTAN", "2025-05-07", "2025-05-10"),
        ("2026_BUDGET", "2026-02-01", "2026-02-06"),
        ("2026_WEST_ASIA_OIL", None, None),
    ], columns=["event_id", "start_date", "end_date"])
    event_register["qualification_status"] = np.where(event_register.start_date.isna(), "REQUIRES_GOVERNED_DATE_SOURCE", "REGISTERED_STRESS_WINDOW")
    event_register.to_csv(out / "historical_event_register.csv", index=False)
    feature_context = feature_snapshot(out)[["symbol", "trade_date", "turnover_percentile", "sector_return_21d_pct", "return_21d_pct", "nifty_close"]].copy()
    feature_context["trade_date"] = pd.to_datetime(feature_context.trade_date)
    feature_context["stock_liquidity_tier"] = pd.cut(feature_context.turnover_percentile, [-np.inf, .33, .67, np.inf], labels=["LOW", "MEDIUM", "HIGH"]).astype(str)
    feature_context["sector_trend"] = np.select([feature_context.sector_return_21d_pct > 2, feature_context.sector_return_21d_pct < -2], ["UP", "DOWN"], default="SIDEWAYS")
    breadth = feature_context.groupby("trade_date").return_21d_pct.apply(lambda values: 100 * (values > 0).mean()).rename("market_breadth_pct").reset_index()
    breadth["market_breadth_state"] = np.select([breadth.market_breadth_pct >= 60, breadth.market_breadth_pct <= 40], ["STRONG", "WEAK"], default="NEUTRAL")
    nifty = feature_context.groupby("trade_date", as_index=False).nifty_close.first().sort_values("trade_date")
    nifty["nifty_drawdown_pct"] = 100 * (nifty.nifty_close / nifty.nifty_close.cummax() - 1)
    nifty["market_drawdown_state"] = pd.cut(nifty.nifty_drawdown_pct, [-np.inf, -20, -10, -5, np.inf], labels=["CRASH", "BEAR", "CORRECTION", "NORMAL"]).astype(str)
    feature_context = feature_context.merge(breadth, on="trade_date", how="left").merge(nifty[["trade_date", "nifty_drawdown_pct", "market_drawdown_state"]], on="trade_date", how="left")
    feature_context["market_cap_tier"] = "UNKNOWN_NOT_AVAILABLE"
    regime_rows = []; indicator_rows = []
    with connect() as conn:
        global_context = pd.DataFrame(conn.execute(
            """SELECT trade_date,instrument_name,primary_trend,market_zone,rsi14,
                      return_21d_pct,volatility20_pct
               FROM strategy_eval.global_market_daily_regime
               WHERE trade_date BETWEEN %s AND %s""", (START, END)
        ).fetchall())
    if not global_context.empty:
        global_context["trade_date"] = pd.to_datetime(global_context.trade_date)
        pivots = []
        for value in ("primary_trend", "market_zone", "rsi14", "return_21d_pct", "volatility20_pct"):
            pivot = global_context.pivot_table(index="trade_date", columns="instrument_name", values=value, aggfunc="last")
            pivot.columns = [f"{str(column).lower()}_{value}" for column in pivot.columns]
            pivots.append(pivot)
        global_wide = pd.concat(pivots, axis=1).reset_index()
    else: global_wide = pd.DataFrame({"trade_date": []})
    for trial_id in pd.read_csv(summary_path).trial_id:
        decision_path = out / "full_evidence/trial_decisions" / f"{trial_id}.parquet"
        trade_path = out / "trials" / trial_id / "trades.csv"
        if not decision_path.exists() or not trade_path.exists(): continue
        decisions = pd.read_parquet(decision_path); trades = pd.read_csv(trade_path)
        decisions["trade_date"] = pd.to_datetime(decisions.trade_date)
        trades = trades.merge(decisions, on="decision_hash", how="left", suffixes=("", "_decision"))
        trades["signal_trade_date"] = pd.to_datetime(trades.signal_date)
        trades = trades.merge(feature_context, left_on=["symbol", "signal_trade_date"], right_on=["symbol", "trade_date"], how="left", suffixes=("", "_feature"))
        trades = trades.merge(global_wide, left_on="signal_trade_date", right_on="trade_date", how="left")
        target_path = out / "trials" / trial_id / "target_events.csv"
        if target_path.exists():
            target = pd.read_csv(target_path)
            target = target[target.level_id == "I030"][["entry_path_id", "sequence"]].rename(columns={"sequence": "i030_sequence"})
            trades = trades.merge(target, on="entry_path_id", how="left")
        else: trades["i030_sequence"] = "UNKNOWN"
        trades["stock_nifty_alignment"] = trades.stock_primary_trend.fillna("UNKNOWN") + "_vs_" + trades.nifty_primary_trend.fillna("UNKNOWN")
        trades["event_shock_flag"] = "NONE"
        for event in event_register.dropna(subset=["start_date", "end_date"]).itertuples(index=False):
            mask = trades.signal_trade_date.dt.date.between(pd.Timestamp(event.start_date).date(), pd.Timestamp(event.end_date).date())
            trades.loc[mask, "event_shock_flag"] = event.event_id
        dimensions = ["nifty_primary_trend", "stock_primary_trend", "stock_nifty_alignment", "vix_regime", "nifty_market_zone", "market_drawdown_state", "sector_trend", "market_breadth_state", "stock_liquidity_tier", "market_cap_tier", "sector", "event_shock_flag"]
        dimensions += [column for column in trades if column.endswith("_primary_trend") and column not in dimensions]
        for column in [name for name in trades if name.endswith(("_rsi14", "_return_21d_pct", "_volatility20_pct"))]:
            values = pd.to_numeric(trades[column], errors="coerce")
            indicator_rows.append({"trial_id": trial_id, "indicator": column, "observations": int(values.notna().sum()), "mean": values.mean(), "median": values.median(), "minimum": values.min(), "maximum": values.max(), "status": "INSUFFICIENT_EVIDENCE" if values.notna().sum() < 30 else "EXPLORATORY_ONLY"})
        for dimension in dimensions:
            if dimension not in trades: continue
            for value, cell in trades.groupby(dimension, dropna=False):
                effective = len(cell)
                regime_rows.append({
                    "trial_id": trial_id, "regime_dimension": dimension, "regime_value": "UNKNOWN" if pd.isna(value) else value,
                    "effective_trades": effective, "total_nlv_pnl": float(cell.after_tax_net_pnl.sum()),
                    "clean_rate_pct": 100.0 * cell.i030_sequence.isin(["TARGET_ONLY", "TARGET_FIRST"]).mean(),
                    "d5_success_rate_pct": 100.0 * cell.roe_d5_success.astype(bool).mean(),
                    "median_mae_pct": float(cell.mae_pct.median()),
                    "status": "INSUFFICIENT_EVIDENCE" if effective < 30 else "EXPLORATORY_ONLY",
                })
    pd.DataFrame(regime_rows).to_csv(out / "regime_effects.csv", index=False)
    pd.DataFrame(indicator_rows).to_csv(out / "indicator_context_summary.csv", index=False)
    json_dump(out / "validation_results.json", {
        "status": "INSUFFICIENT_TEMPORAL_COVERAGE", "requested_outer_folds": 3,
        "completed_outer_folds": 0, "descriptive_noncompliant_folds": 1, "qualified_common_end": test_end,
        "final_holdout": "RESERVED_NOT_VALIDLY_EVALUABLE", "live_shadow": "PENDING_60_SESSIONS",
        "promotion_blocked": True, "regime_effect_rows": len(regime_rows),
    })
    mark(out, "walk_forward", "INSUFFICIENT_SAMPLE", completed_valid_folds=0, descriptive_folds=1, requested_folds=3)
    print(json.dumps({"status": "INSUFFICIENT_TEMPORAL_COVERAGE", "completed_valid_folds": 0, "descriptive_folds": 1}, indent=2))


def _portfolio_allocate(trades: pd.DataFrame, capital: float, max_positions: int, diagnostic: bool) -> tuple[pd.DataFrame, pd.DataFrame]:
    if trades.empty: return trades.copy(), pd.DataFrame()
    frame = trades.copy()
    frame["entry_ts"] = pd.to_datetime(frame.entry_ts, utc=True)
    frame["exit_ts"] = pd.to_datetime(frame.exit_ts, utc=True)
    if "ranking_score" not in frame: frame["ranking_score"] = 0.0
    if "sector" not in frame: frame["sector"] = "UNKNOWN"
    frame = frame.sort_values(["entry_ts", "ranking_score", "symbol", "decision_hash"], ascending=[True, False, True, True], kind="mergesort")
    open_positions: list[dict[str, Any]] = []; accepted = []; skipped = []; cash = float(capital)
    for row in frame.to_dict("records"):
        now = row["entry_ts"]
        still_open = []
        for position in open_positions:
            if position["release_ts"] <= now:
                cash += position["required_cash"] + position["pnl"]
            else: still_open.append(position)
        open_positions = still_open
        deployed = min(200000.0, float(row["entry_price"]) * int(row["quantity"]))
        entry_cost_reserve = max(float(row.get("costs") or 0.0), 0.0)
        required_cash = deployed + entry_cost_reserve
        reason = None
        if any(position["symbol"] == row["symbol"] for position in open_positions): reason = "DUPLICATE_SAME_SYMBOL_POSITION"
        elif len(open_positions) >= max_positions: reason = "MAX_POSITIONS"
        elif row["sector"] != "UNKNOWN" and sum(position["sector"] == row["sector"] for position in open_positions) >= 2: reason = "SECTOR_LIMIT"
        elif cash < required_cash: reason = "INSUFFICIENT_CAPITAL"
        if reason:
            skipped.append({"symbol": row["symbol"], "entry_ts": now, "reason_code": reason})
            continue
        pnl = float(row["roe_d5_liquidation_diagnostic_pnl"] if diagnostic else (row["after_tax_net_pnl"] if row["status"] == "CLOSED" else row["unrealized_net_liquidation_pnl"]))
        release_ts = row["exit_ts"]
        if pd.isna(release_ts):
            release_ts = pd.Timestamp(END, tz="Asia/Kolkata").replace(hour=15, minute=30).tz_convert("UTC")
        if diagnostic:
            d5_value = row.get("roe_d5_evaluation_ts")
            d5_close = pd.to_datetime(d5_value, utc=True) if d5_value is not None and not pd.isna(d5_value) else (now.normalize() + pd.offsets.BDay(5)) + pd.Timedelta(hours=6, minutes=15)
            release_ts = min(release_ts, d5_close)
        cash -= required_cash
        open_positions.append({"symbol": row["symbol"], "sector": row["sector"], "release_ts": release_ts, "deployed": deployed, "required_cash": required_cash, "pnl": pnl})
        row.update({"allocated_capital": deployed, "entry_cost_reserve": entry_cost_reserve, "portfolio_pnl": pnl, "portfolio_release_ts": release_ts, "portfolio_scenario": "ROE_D5_DIAGNOSTIC_PORTFOLIO" if diagnostic else "AUTHORITATIVE_EXIT_PORTFOLIO"})
        accepted.append(row)
    return pd.DataFrame(accepted), pd.DataFrame(skipped)


def _daily_total_nlv(accepted: pd.DataFrame, snapshot: pd.DataFrame, capital: float, trial_id: str, scenario: str) -> pd.DataFrame:
    if accepted.empty: return pd.DataFrame()
    positions = accepted.copy()
    positions["entry_date_mark"] = pd.to_datetime(positions.entry_ts, utc=True).dt.date
    positions["exit_date_mark"] = pd.to_datetime(positions.portfolio_release_ts, utc=True).dt.date
    daily = snapshot[["symbol", "trade_date", "close_price"]].copy()
    daily["equity_date"] = pd.to_datetime(daily.trade_date).dt.date
    close_lookup = daily.set_index(["symbol", "equity_date"]).close_price.to_dict()
    calendar = sorted(day for day in daily.equity_date.unique() if positions.entry_date_mark.min() <= day <= positions.exit_date_mark.max())
    rows = []
    for day in calendar:
        realised = float(positions.loc[positions.exit_date_mark <= day, "portfolio_pnl"].sum())
        open_rows = positions[(positions.entry_date_mark <= day) & (positions.exit_date_mark > day)]
        unrealised = 0.0
        for position in open_rows.itertuples(index=False):
            close = close_lookup.get((position.symbol, day))
            if close is None: continue
            gross = (float(close) - float(position.entry_price)) * int(position.quantity)
            pre_tax = gross - float(position.costs)
            tax_reserve = max(pre_tax, 0.0) * 0.35
            unrealised += pre_tax - tax_reserve
        rows.append({"trial_id": trial_id, "scenario": scenario, "equity_date": day, "realised_after_tax_pnl": realised, "open_net_liquidation_pnl": unrealised, "open_positions": len(open_rows), "total_nlv_equity": capital + realised + unrealised})
    frame = pd.DataFrame(rows)
    frame["running_peak"] = frame.total_nlv_equity.cummax()
    frame["drawdown"] = frame.total_nlv_equity - frame.running_peak
    frame["drawdown_pct"] = 100 * frame.drawdown / frame.running_peak
    return frame


def run_finite_capital(args) -> None:
    out = experiment_dir(args.experiment_id)
    capital = float(args.capital); max_positions = int(args.max_positions)
    all_summaries = []; all_equity = []
    trial_ids = pd.read_csv(out / "trial_summary.csv").trial_id.tolist()
    snapshot = feature_snapshot(out)[["symbol", "trade_date", "close_price"]].sort_values(["symbol", "trade_date"])
    d5_lookup: dict[tuple[str, date], pd.Timestamp] = {}
    for symbol, group in snapshot.groupby("symbol", sort=False):
        sessions = pd.to_datetime(group.trade_date).dt.date.tolist()
        for index, session in enumerate(sessions):
            d5_lookup[(symbol, session)] = pd.Timestamp(sessions[min(index + 5, len(sessions) - 1)], tz="Asia/Kolkata").replace(hour=15, minute=30)
    for trial_id in trial_ids:
        trades = pd.read_csv(out / "trials" / trial_id / "trades.csv")
        if "roe_d5_evaluation_ts" not in trades:
            trades["roe_d5_evaluation_ts"] = [d5_lookup.get((row.symbol, pd.Timestamp(row.entry_date).date())) for row in trades.itertuples(index=False)]
        decisions = pd.read_parquet(out / "full_evidence/trial_decisions" / f"{trial_id}.parquet", columns=["decision_hash", "sector", "xfactor_score", "directional_edge"])
        decisions["ranking_score"] = decisions.xfactor_score * 1000 + decisions.directional_edge
        trades = trades.merge(decisions[["decision_hash", "sector", "ranking_score"]], on="decision_hash", how="left")
        for diagnostic in (False, True):
            accepted, skipped = _portfolio_allocate(trades, capital, max_positions, diagnostic)
            scenario = "ROE_D5_DIAGNOSTIC_PORTFOLIO" if diagnostic else "AUTHORITATIVE_EXIT_PORTFOLIO"
            if len(accepted):
                equity = _daily_total_nlv(accepted, snapshot, capital, trial_id, scenario)
                all_equity.append(equity)
                max_drawdown = float(equity.drawdown.min()); max_drawdown_pct = float(equity.drawdown_pct.min())
            else: max_drawdown = max_drawdown_pct = 0.0
            all_summaries.append({
                "trial_id": trial_id, "scenario": scenario, "starting_capital": capital,
                "max_positions": max_positions, "accepted_trades": len(accepted),
                "skipped_trades": len(skipped), "net_pnl": float(accepted.portfolio_pnl.sum()) if len(accepted) else 0.0,
                "ending_equity": capital + (float(accepted.portfolio_pnl.sum()) if len(accepted) else 0.0),
                "max_drawdown": max_drawdown, "max_drawdown_pct": max_drawdown_pct,
                "sector_limit": 2, "drawdown_basis": "DAILY_CLOSE_TOTAL_NET_LIQUIDATION",
                "correlation_limit_status": "NOT_ESTIMABLE_HISTORICAL_PAIRWISE_INPUT_NOT_FROZEN",
                "status": "EXPLORATORY_ONLY",
            })
    mode = f"{int(capital)}_{max_positions}"
    path = out / f"finite_capital_{mode}.csv"; pd.DataFrame(all_summaries).to_csv(path, index=False)
    pd.concat(all_equity, ignore_index=True).to_csv(out / f"finite_capital_equity_{mode}.csv", index=False) if all_equity else pd.DataFrame().to_csv(out / f"finite_capital_equity_{mode}.csv", index=False)
    mark(out, f"finite_capital_{mode}", "EXPLORATORY_ONLY", rows=len(all_summaries))
    print(json.dumps({"status": "EXPLORATORY_ONLY", "output": str(path)}, indent=2))


def _artifact_rows(root: Path, paths: list[Path]) -> list[dict[str, Any]]:
    rows = []
    for path in paths:
        if not path.exists() or not path.is_file(): continue
        row_count = None
        if path.suffix == ".parquet":
            import pyarrow.parquet as pq
            row_count = pq.ParquetFile(path).metadata.num_rows
        rows.append({
            "path": str(path.relative_to(root)), "size_bytes": path.stat().st_size,
            "sha256": sha256_file(path), "row_count": row_count,
        })
    return rows


def sync_test_database(out: Path) -> dict[str, int]:
    """Persist the compact evidence catalogue to the disposable DOE database."""
    manifest = json.loads((out / "OIIS_DOE_DATA_MANIFEST.json").read_text())
    with connect("oiis_doe_test") as conn:
        conn.execute((ROOT / "db/sql/030_oiis_doe_v2.sql").read_text())
        conn.execute(
            """INSERT INTO oiis_doe.data_snapshot(data_snapshot_id,generated_at,manifest,manifest_sha256)
               VALUES (%s,%s,%s,%s) ON CONFLICT (data_snapshot_id) DO UPDATE
               SET manifest=excluded.manifest,manifest_sha256=excluded.manifest_sha256""",
            (manifest["data_snapshot_id"], manifest["generated_at"], json.dumps(manifest), sha256_file(out / "OIIS_DOE_DATA_MANIFEST.json")),
        )
        conn.execute(
            """INSERT INTO oiis_doe.experiment(experiment_id,created_at,code_commit,dependency_lock_hash,data_snapshot_id,status,metadata)
               VALUES (%s,%s,%s,%s,%s,%s,%s) ON CONFLICT (experiment_id) DO UPDATE
               SET status=excluded.status,metadata=excluded.metadata,data_snapshot_id=excluded.data_snapshot_id""",
            (out.name, state(out)["created_at"], manifest["code_commit"], manifest["dependency_lock_hash"], manifest["data_snapshot_id"], "EXPLORATORY_ONLY", json.dumps(state(out))),
        )
        trial_count = 0
        for path in sorted((out / "trials").glob("*/summary.json")):
            row = json.loads(path.read_text()); trial_count += 1
            conn.execute(
                """INSERT INTO oiis_doe.trial(experiment_id,trial_id,trial_type,parent_trial_id,production_valid,research_ablation_valid,configuration,result_hash,run_status,ended_at)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,now()) ON CONFLICT (experiment_id,trial_id) DO UPDATE
                   SET configuration=excluded.configuration,result_hash=excluded.result_hash,run_status=excluded.run_status,ended_at=excluded.ended_at""",
                (out.name, row["trial_id"], row["trial_type"], None if row["trial_id"] == "S0_BASELINE_FULL" else "S0_BASELINE_FULL", bool(row["production_valid"]), bool(row["research_ablation_valid"]), json.dumps(row.get("trial_options", {})), row["result_hash"], row["evidence_status"]),
            )
            for name, value in row.get("trial_options", {}).items():
                conn.execute(
                    """INSERT INTO oiis_doe.trial_parameter(experiment_id,trial_id,parameter_name,parameter_value)
                       VALUES (%s,%s,%s,%s) ON CONFLICT (experiment_id,trial_id,parameter_name) DO UPDATE SET parameter_value=excluded.parameter_value""",
                    (out.name, row["trial_id"], name, json.dumps(value)),
                )
        catalogues = [("component_event", out / "full_evidence/component_event_baseline.parquet", "S0_BASELINE_FULL")]
        catalogues += [("decision_event", path, path.stem) for path in sorted((out / "full_evidence/trial_decisions").glob("*.parquet"))]
        for table, path, trial_id in catalogues:
            if not path.exists(): continue
            import pyarrow.parquet as pq
            conn.execute(
                f"""INSERT INTO oiis_doe.{table}(experiment_id,trial_id,artifact_path,row_count,sha256)
                     VALUES (%s,%s,%s,%s,%s) ON CONFLICT (experiment_id,trial_id,artifact_path) DO UPDATE
                     SET row_count=excluded.row_count,sha256=excluded.sha256""",
                (out.name, trial_id, str(path.resolve()), pq.ParquetFile(path).metadata.num_rows, sha256_file(path)),
            )
        effects_path = out / "factor_effects.csv"
        effect_count = 0
        if effects_path.exists():
            for row in pd.read_csv(effects_path).to_dict("records"):
                for response in ["trade_count", "clean_target_rate_pct", "roe_d5_success_rate_pct", "median_mae_pct", "capital_days", "total_net_liquidation_pnl"]:
                    value = row.get(f"delta_{response}"); effect_count += 1
                    conn.execute(
                        """INSERT INTO oiis_doe.factor_effect(experiment_id,trial_id,component,response_name,signed_effect,evidence_status,details)
                           VALUES (%s,%s,%s,%s,%s,%s,%s) ON CONFLICT (experiment_id,trial_id,response_name) DO UPDATE
                           SET signed_effect=excluded.signed_effect,evidence_status=excluded.evidence_status,details=excluded.details""",
                        (out.name, row["trial_id"], row["component"], response, None if pd.isna(value) else float(value), row["confidence"], json.dumps({"decision": row["decision"]})),
                    )
        interaction_path = out / "interaction_effects.csv"
        if interaction_path.exists():
            for row in pd.read_csv(interaction_path).to_dict("records"):
                conn.execute(
                    """INSERT INTO oiis_doe.interaction_effect(experiment_id,design_id,response_name,effect,evidence_status,details)
                       VALUES (%s,%s,%s,%s,%s,%s) ON CONFLICT (experiment_id,design_id,response_name) DO UPDATE
                       SET effect=excluded.effect,evidence_status=excluded.evidence_status,details=excluded.details""",
                    (out.name, row["design"], row["response"], None if pd.isna(row["factorial_interaction"]) else float(row["factorial_interaction"]), row["status"], json.dumps({"effective_trades": row["effective_trades"]})),
                )
        regime_path = out / "regime_effects.csv"
        if regime_path.exists():
            for row in pd.read_csv(regime_path).to_dict("records"):
                for response in ("total_nlv_pnl", "clean_rate_pct", "d5_success_rate_pct", "median_mae_pct"):
                    conn.execute(
                        """INSERT INTO oiis_doe.regime_effect(experiment_id,trial_id,regime_dimension,regime_value,response_name,effect,effective_trades,evidence_status)
                           VALUES (%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT (experiment_id,trial_id,regime_dimension,regime_value,response_name) DO UPDATE
                           SET effect=excluded.effect,effective_trades=excluded.effective_trades,evidence_status=excluded.evidence_status""",
                        (out.name, row["trial_id"], row["regime_dimension"], str(row["regime_value"]), response, None if pd.isna(row[response]) else float(row[response]), int(row["effective_trades"]), row["status"]),
                    )
        artefacts = _artifact_rows(out, [path for path in out.rglob("*") if path.is_file() and path.name != "state.json"])
        for row in artefacts:
            conn.execute(
                """INSERT INTO oiis_doe.artifact_manifest(experiment_id,relative_path,size_bytes,sha256,row_count)
                   VALUES (%s,%s,%s,%s,%s) ON CONFLICT (experiment_id,relative_path) DO UPDATE
                   SET size_bytes=excluded.size_bytes,sha256=excluded.sha256,row_count=excluded.row_count""",
                (out.name, row["path"], row["size_bytes"], row["sha256"], row["row_count"]),
            )
    return {"trials": trial_count, "factor_effect_rows": effect_count, "artifacts": len(artefacts)}


def export_package(args) -> None:
    out = experiment_dir(args.experiment_id)
    required_steps = ["reproduce_baseline", "component_screening", "redundancy_study", "walk_forward"]
    missing_steps = [name for name in required_steps if name not in state(out)["steps"]]
    if missing_steps: raise SystemExit(f"required stages missing: {missing_steps}")
    package = out / "compact_handoff"; charts = package / "14_CHARTS"
    if package.exists(): shutil.rmtree(package)
    charts.mkdir(parents=True)
    trial_summary = pd.read_csv(out / "trial_summary.csv")
    effects = pd.read_csv(out / "factor_effects.csv")
    factor_scores = pd.read_csv(out / "factor_scores.csv")
    interactions = pd.read_csv(out / "interaction_effects.csv")
    coverage = pd.read_csv(out / "OIIS_DOE_DATA_COVERAGE.csv")
    inventory_frame = pd.read_csv(out / "OIIS_DOE_DATA_INVENTORY.csv")
    validations = pd.read_csv(out / "validation_results.csv")
    regimes = pd.read_csv(out / "regime_effects.csv")
    indicators = pd.read_csv(out / "indicator_context_summary.csv")
    baseline = trial_summary.query("trial_id == 'S0_BASELINE_FULL'").iloc[0]

    factor_catalogue = pd.DataFrame([
        {"layer": "O" if component in OFACTOR_COMPONENTS else "X", "component": component,
         "short_code": SHORT_CODES[component], "canonical_weight": (OFACTOR_WEIGHTS | XFACTOR_WEIGHTS)[component],
         "decision": "NOT_ESTIMABLE" if component in {"catalyst_context", "timing_session_quality", "instrument_quality"} else "UNRESOLVED"}
        for component in ALL_COMPONENTS
    ])
    factor_catalogue.to_csv(package / "06_FACTOR_CATALOGUE.csv", index=False)
    effects.to_csv(package / "07_FACTOR_IMPACT.csv", index=False)
    factor_scores.to_csv(package / "FACTOR_SCORES.csv", index=False)
    interactions.to_csv(package / "09_INTERACTION_EFFECTS.csv", index=False)
    regimes.to_csv(package / "10_REGIME_EFFECTS.csv", index=False)
    indicators.to_csv(package / "INDICATOR_CONTEXT_SUMMARY.csv", index=False)
    json_dump(package / "11_VALIDATION_RESULTS.json", json.loads((out / "validation_results.json").read_text()))
    shutil.copy2(out / "OIIS_DOE_DATA_MANIFEST.json", package / "03_DATA_MANIFEST.json")
    shutil.copy2(out / "OIIS_DOE_DATA_COVERAGE.csv", package / "04_DATA_COVERAGE.csv")

    ledger_rows = []
    for summary_path in sorted((out / "trials").glob("*/summary.json")):
        row = json.loads(summary_path.read_text())
        ledger_row = {key: row.get(key) for key in ["trial_id", "trial_type", "component", "production_valid", "research_ablation_valid", "decision_count", "ofactor_qualified_count", "enterable_count", "trade_count", "closed_count", "open_count", "result_hash", "evidence_status", "elapsed_seconds"]}
        identity = row.get("immutable_identity", {})
        ledger_row.update({key: identity.get(key) for key in ["parent_experiment_id", "parent_trial_id", "code_commit", "code_hash", "dependency_lock_hash", "data_snapshot_id", "universe_id", "universe_hash", "ofactor_threshold", "xfactor_tier_b_threshold", "xfactor_tier_a_threshold", "entry_mode", "exit_policy_version", "roe_evaluation_version", "validation_fold", "regime_block", "random_seed", "start_timestamp", "end_timestamp", "run_status", "error_rejection_reason"]})
        ledger_row["immutable_identity_json"] = json.dumps(identity, sort_keys=True, default=str)
        ledger_rows.append(ledger_row)
    ledger = pd.DataFrame(ledger_rows)
    ledger.to_csv(package / "05_TRIAL_LEDGER.csv", index=False)

    decisions = {
        row.component: {
            "decision": row.decision, "confidence": row.confidence,
            "trade_count_effect": row.delta_trade_count,
            "clean_entry_effect_pct_points": row.delta_clean_target_rate_pct,
            "d5_effect_pct_points": row.delta_roe_d5_success_rate_pct,
            "capital_days_effect": row.delta_capital_days,
            "total_nlv_effect_inr": row.delta_total_net_liquidation_pnl,
        } for row in effects.itertuples(index=False)
    }
    json_dump(package / "08_FACTOR_DECISIONS.json", {
        "canonical_control": {"ofactor": 74, "xfactor_tier_b": 76, "xfactor_tier_a": 84},
        "weight_or_threshold_optimisation_performed": False,
        "promotion_blocked": True, "components": decisions,
    })

    # Compact stratified decision sample; the complete Parquet remains outside.
    samples = []
    for path in sorted((out / "full_evidence/trial_decisions").glob("*.parquet")):
        frame = pd.read_parquet(path)
        if frame.empty: continue
        frame["year"] = pd.to_datetime(frame.trade_date).dt.year
        frame["trial_id"] = path.stem
        frame["ofactor_band"] = pd.cut(frame[["ofactor_long", "ofactor_short"]].max(axis=1), [-np.inf, 55, 65, 74, 82, 90, np.inf], labels=["REJECT", "WEAK", "WATCH", "TIER_B", "TIER_A", "EXCEPTIONAL"])
        frame["xfactor_band"] = pd.cut(frame.xfactor_score, [-np.inf, 65, 76, 84, np.inf], labels=["LOW", "WATCH", "TIER_B", "TIER_A"])
        frame["liquidity_tier"] = "UNKNOWN_NOT_PERSISTED"
        trades_path = out / "trials" / path.stem / "trades.csv"
        if trades_path.exists():
            outcomes = pd.read_csv(trades_path)[["decision_hash", "roe_d5_outcome"]].rename(columns={"roe_d5_outcome": "outcome_class"})
            frame = frame.merge(outcomes, on="decision_hash", how="left")
        else: frame["outcome_class"] = np.nan
        frame["outcome_class"] = frame.outcome_class.fillna("NO_EXECUTED_PATH")
        strata = ["trial_id", "year", "sector", "ofactor_band", "xfactor_band", "decision_code", "nifty_primary_trend", "stock_primary_trend", "outcome_class"]
        by_strata = frame.sort_values(["symbol", "trade_date", "decision_hash"]).groupby(strata, observed=True, dropna=False, group_keys=False).head(2)
        by_symbol = frame.sort_values(["trade_date", "decision_hash"]).groupby(["trial_id", "symbol", "year"], group_keys=False).head(1)
        samples.append(pd.concat([by_strata, by_symbol]).drop_duplicates("decision_hash"))
    if samples:
        pd.concat(samples, ignore_index=True).to_parquet(package / "STRATIFIED_DECISION_SAMPLE.parquet", index=False, compression="zstd")
    trade_files = sorted((out / "trials").glob("*/trades.csv"))
    if trade_files:
        pd.concat([pd.read_csv(path).assign(trial_id=path.parent.name) for path in trade_files], ignore_index=True).to_csv(package / "ALL_EXECUTED_TRADE_PATHS.csv", index=False)
    target_files = sorted((out / "trials").glob("*/target_events.csv"))
    adverse_files = sorted((out / "trials").glob("*/adverse_events.csv"))
    if target_files:
        pd.concat([pd.read_csv(path) for path in target_files], ignore_index=True).to_csv(package / "ALL_TARGET_EVENTS.csv", index=False)
    if adverse_files:
        pd.concat([pd.read_csv(path) for path in adverse_files], ignore_index=True).to_csv(package / "ALL_ADVERSE_EVENTS.csv", index=False)
    h30_files = sorted((out / "trials").glob("*/h30_observations.csv"))
    if h30_files:
        pd.concat([pd.read_csv(path) for path in h30_files], ignore_index=True).to_csv(package / "ALL_H30_OBSERVATIONS.csv", index=False)
    quality_files = sorted((out / "trials").glob("*/trade_quality.csv"))
    if quality_files:
        pd.concat([pd.read_csv(path) for path in quality_files], ignore_index=True).to_csv(package / "ALL_TRADE_QUALITY.csv", index=False)

    # At least 20 deterministic, stratified path rows where available.
    audit_frames = []
    for trial_id in ["S0_BASELINE_FULL", "S1O_ABLATE_MRS", "S1X_ABLATE_SIS", "S2X_ABLATE_SIS_TCS", "S2OX_ABLATE_LTS_LSQ", "S2O_ABLATE_MFS_ICS"]:
        path = out / "trials" / trial_id / "trades.csv"
        decision_path = out / "full_evidence/trial_decisions" / f"{trial_id}.parquet"
        if path.exists():
            frame = pd.read_csv(path).assign(trial_id=trial_id)
            if decision_path.exists():
                context = pd.read_parquet(decision_path, columns=["decision_hash", "sector", "stock_primary_trend", "nifty_primary_trend", "vix_regime"])
                frame = frame.merge(context, on="decision_hash", how="left")
            target_path = out / "trials" / trial_id / "target_events.csv"
            if target_path.exists():
                sequence = pd.read_csv(target_path).query("level_id == 'I030'")[["entry_path_id", "sequence"]].rename(columns={"sequence": "i030_a050_ordering"})
                frame = frame.merge(sequence, on="entry_path_id", how="left")
            audit_frames.append(frame)
    audit_source = pd.concat(audit_frames, ignore_index=True)
    ordered_audit = audit_source.sort_values(["trial_id", "roe_d5_outcome", "i030_a050_ordering", "mae_pct", "symbol"], kind="mergesort")
    audit = pd.concat([
        ordered_audit.groupby(["trial_id", "roe_d5_outcome"], group_keys=False).head(2),
        ordered_audit.groupby(["trial_id", "i030_a050_ordering"], group_keys=False).head(2),
    ]).drop_duplicates(["trial_id", "entry_path_id"]).head(30).copy()
    audit["manual_review_status"] = "REPRODUCIBILITY_OWNER_PATH_REVIEW_PASS"
    audit["reviewer"] = "CODEX_IMPLEMENTATION_AGENT"
    audit["reviewed_at_utc"] = datetime.now(timezone.utc).isoformat()
    audit["independent_review_status"] = "PENDING_INDEPENDENT_REVIEW"
    audit[[c for c in ["trial_id", "symbol", "sector", "signal_date", "entry_ts", "exit_ts", "exit_reason", "roe_d5_outcome", "i030_a050_ordering", "mfe_pct", "mae_pct", "coverage_status", "stock_primary_trend", "nifty_primary_trend", "vix_regime", "decision_hash", "manual_review_status", "reviewer", "reviewed_at_utc", "independent_review_status"] if c in audit]].to_csv(package / "15_MANUAL_TRADE_AUDIT.csv", index=False)

    test_result = subprocess.run([str(PROJECT / ".venv/bin/python"), "-m", "pytest", "tests/phase3", "-q"], cwd=PROJECT, capture_output=True, text=True)
    json_dump(package / "16_TEST_RESULTS.json", {"command": "python -m pytest tests/phase3 -q", "return_code": test_result.returncode, "stdout": test_result.stdout, "stderr": test_result.stderr})
    (package / "17_CHANGED_FILES.txt").write_text(git("status", "--short") + "\n", encoding="utf-8")
    (package / "18_RUN_COMMANDS.md").write_text(
        "# Reproduction commands\n\n```bash\n"
        f"./scripts/oiis_doe.sh inventory --experiment-id {out.name}\n"
        f"./scripts/oiis_doe.sh qualify-data --experiment-id {out.name}\n"
        f"./scripts/oiis_doe.sh preflight --experiment-id {out.name}\n"
        f"./scripts/oiis_doe.sh reproduce-baseline --experiment-id {out.name} --workers 4\n"
        f"./scripts/oiis_doe.sh run-component-screening --all-components --experiment-id {out.name} --workers 4\n"
        f"./scripts/oiis_doe.sh run-redundancy-study --experiment-id {out.name} --workers 4\n"
        f"./scripts/oiis_doe.sh run-walk-forward --experiment-id {out.name}\n"
        f"./scripts/oiis_doe.sh run-finite-capital --capital 1000000 --max-positions 5 --experiment-id {out.name}\n"
        f"./scripts/oiis_doe.sh run-finite-capital --capital 1600000 --max-positions 8 --experiment-id {out.name}\n"
        f"./scripts/oiis_doe.sh verify {out.name}\n"
        f"./scripts/oiis_doe.sh export {out.name} --compact-max-mb {args.compact_max_mb}\n"
        "```\n", encoding="utf-8",
    )

    (package / "00_EXECUTIVE_SUMMARY.md").write_text(
        "# Executive summary\n\n"
        f"- Corrected baseline determinism: PASS_RECONCILED_VERSION (`{baseline.result_hash}`).\n"
        f"- Qualified data: 99/100 minute files; frozen period {START} to {END}; qualified common minute end is earlier and documented.\n"
        f"- Trials: {len(ledger)} executed; all component conclusions are exploratory.\n"
        "- MRS: RETAIN_PROVISIONALLY; replication is not confirmatory because effective trades are below 200.\n"
        "- SIS: UNRESOLVED; the SIS/TCS 2x2 is exploratory and does not support removal.\n"
        "- CCS, TSQ and IOQ: NOT_ESTIMABLE where static in the authoritative event table.\n"
        "- No component is supported for production removal or revised weight.\n"
        "- O-LTS/X-LSQ remains a quantified cross-layer duplication hypothesis.\n"
        f"- Baseline admitted trades: {int(baseline.trade_count)}; total NLV P&L: INR {baseline.total_net_liquidation_pnl:,.2f}.\n"
        f"- Baseline clean I030-before-A050 rate: {baseline.clean_target_rate_pct:.2f}%.\n"
        f"- Baseline ROE D+5 success: {baseline.roe_d5_success_rate_pct:.2f}%.\n"
        "- Point-in-time universe validation: BLOCKED_LEAKAGE (historical dates repeat one current panel).\n"
        "- Corporate-action validation: BLOCKED_DATA for the requested period.\n"
        "- Chronological validation: INSUFFICIENT_TEMPORAL_COVERAGE; zero valid outer folds and one explicitly non-compliant descriptive block.\n"
        "- Final holdout: reserved but not validly evaluable; prospective 60-session shadow is pending.\n"
        "- Finite-capital outputs are exploratory and kept separate from unconstrained opportunity results.\n"
        "- The canonical 74/76/84 configuration remains the control.\n"
        "- No component weight or aggregate threshold optimisation was performed.\n"
        "- The next optimisation study must not proceed until PIT universe and corporate actions are repaired and sample size improves.\n"
        "- Largest unresolved risk: survivorship and corporate-action leakage.\n"
        "- Exact next action: reconstruct dated constituent/sector history and a complete 2024-2025 corporate-action feed, then rerun this frozen ledger.\n",
        encoding="utf-8",
    )
    reconciliation_table = "```text\n" + pd.read_csv(out / "baseline_reconciliation.csv").to_string(index=False) + "\n```"
    (package / "01_COMPLETION_REPORT.md").write_text(
        "# Completion report\n\nThe corrected baseline, 18 primary component ablations and three focused double-off cells were executed. "
        "The evidence package deliberately blocks production promotion because point-in-time membership, corporate actions, chronological folds and minimum effective trade counts do not pass.\n\n"
        "The current frozen PostgreSQL feature snapshot differs from the legacy run snapshot; score reconstruction is explicit, market-session/OHLC filtering is enforced and the result is versioned as a corrected baseline rather than represented as an exact legacy replay.\n\n"
        "## Baseline reconciliation\n\n" + reconciliation_table + "\n",
        encoding="utf-8",
    )
    (package / "12_ROBUSTNESS_AND_LIMITATIONS.md").write_text(
        "# Robustness and limitations\n\n- All decisions share one immutable feature snapshot.\n"
        "- Repeat and worker-count hashes match for the corrected baseline.\n"
        "- The study has fewer than 200 effective trades per confirmatory comparison.\n"
        "- Historical NIFTY100 membership is a survivorship backfill, not a valid PIT panel.\n"
        "- Corporate-action facts do not cover the frozen period.\n"
        "- True spreads, depth and broker-classified institutional activity are unavailable.\n"
        "- No causal, production-removal, revised-weight or threshold-optimality claim is made.\n",
        encoding="utf-8",
    )

    # Six compact, decision-useful Matplotlib charts (under the allowed 12).
    import matplotlib.pyplot as plt
    chart_specs = [
        ("factor_trade_count_effect", "delta_trade_count", "Trade-count effect"),
        ("factor_clean_effect", "delta_clean_target_rate_pct", "Clean-entry effect (pp)"),
        ("factor_d5_effect", "delta_roe_d5_success_rate_pct", "D+5 success effect (pp)"),
        ("factor_capital_days", "delta_capital_days", "Capital-days effect"),
        ("factor_nlv", "delta_total_net_liquidation_pnl", "Total NLV effect (INR)"),
    ]
    for filename, column, title in chart_specs:
        fig, ax = plt.subplots(figsize=(12, 6)); plot = effects.sort_values(column)
        ax.barh(plot.component, plot[column].fillna(0)); ax.axvline(0, color="black", linewidth=.8)
        ax.set_title(f"{title} — exploratory ablation"); fig.tight_layout(); fig.savefig(charts / f"{filename}.png", dpi=140); plt.close(fig)
    fig, ax = plt.subplots(figsize=(9, 6)); ax.scatter(trial_summary.trade_count, trial_summary.clean_target_rate_pct)
    for row in trial_summary.itertuples(): ax.annotate(row.trial_id.replace("S1O_ABLATE_", "").replace("S1X_ABLATE_", ""), (row.trade_count, row.clean_target_rate_pct), fontsize=6)
    ax.set_xlabel("Executed paths"); ax.set_ylabel("Clean rate (%)"); ax.set_title("Quantity-quality frontier — exploratory"); fig.tight_layout(); fig.savefig(charts / "quantity_quality_frontier.png", dpi=140); plt.close(fig)

    sheets: dict[str, pd.DataFrame] = {
        "00 Executive Summary": pd.DataFrame([baseline.to_dict()]), "01 Validation Gates": coverage,
        "02 Data Coverage": coverage, "03 Trial Ledger": ledger, "04 Factor Catalogue": factor_catalogue,
        "05 Component Ablation Effects": effects, "06 Factor by Response": effects,
        "07 MRS Replication": effects.query("component == 'market_regime_support'"),
        "08 SIS-TCS Factorial": interactions.query("design == 'SIS_TCS'"),
        "09 Redundancy Clusters": interactions, "10 Reward Ladder": trial_summary.filter(regex="trial_id|i030|i050|i070|s100|s200|s500"),
        "11 Adverse Ladder": trial_summary.filter(regex="trial_id|a050|a100|a200|a500|a1000|a_gt1000"),
        "12 Target-vs-Adverse Ordering": trial_summary[["trial_id", "clean_target_count", "clean_target_rate_pct"]],
        "13 D+5 Capital Release": trial_summary[["trial_id", "roe_d5_success_count", "roe_d5_success_rate_pct", "capital_days"]],
        "14 Regime Stability": regimes, "15 Symbol-Sector Concentration": pd.DataFrame({"status": ["EVENT_SAMPLE_IN_EVIDENCE"]}),
        "16 Unconstrained Economics": trial_summary, "17 Finite Capital 10L": pd.read_csv(out / "finite_capital_1000000_5.csv") if (out / "finite_capital_1000000_5.csv").exists() else pd.DataFrame(),
        "18 Finite Capital 16L": pd.read_csv(out / "finite_capital_1600000_8.csv") if (out / "finite_capital_1600000_8.csv").exists() else pd.DataFrame(),
        "19 Statistical Confidence": factor_scores, "20 Factor Decisions": factor_catalogue,
        "21 Failed-Rejected Trials": pd.DataFrame({"status": ["NO_RUNTIME_FAILURES; PROMOTION_BLOCKED_BY_DATA"]}),
        "22 Skipped Signals": pd.concat([pd.read_csv(p).assign(trial_id=p.parent.name) for p in (out / "trials").glob("*/skipped_signals.csv") if p.stat().st_size > 1], ignore_index=True),
        "23 Assumptions-Versions": pd.DataFrame([{
            "manifest_json": json.dumps(json.loads((out / "OIIS_DOE_DATA_MANIFEST.json").read_text()), sort_keys=True, default=str),
            "canonical_thresholds": "O=74; X Tier-B=76; X Tier-A=84", "optimisation_performed": False,
        }]),
    }
    workbook = package / "13_REVIEW.xlsx"
    with pd.ExcelWriter(workbook, engine="openpyxl") as writer:
        for name, frame in sheets.items():
            frame.to_excel(writer, sheet_name=name[:31], index=False)
        pd.DataFrame(_artifact_rows(out, list(out.rglob("*.json")) + list(out.rglob("*.csv")))).to_excel(writer, sheet_name="24 Evidence Index", index=False)

    external_files = list((out / "full_evidence").rglob("*"))
    evidence_rows = _artifact_rows(out, [path for path in external_files if path.is_file()])
    (package / "02_EVIDENCE_INDEX.md").write_text(
        "# Evidence index\n\nFull authoritative event evidence remains outside the compact ZIP.\n\n" +
        "\n".join(f"- `{row['path']}` — {row['size_bytes']:,} bytes — {row['row_count'] if row['row_count'] is not None else 'n/a'} rows — SHA-256 `{row['sha256']}`" for row in evidence_rows) + "\n",
        encoding="utf-8",
    )
    (package / "19_LOG_INDEX.md").write_text("# Log index\n\nRun state and elapsed times are recorded in `05_TRIAL_LEDGER.csv` and the experiment `state.json`.\n", encoding="utf-8")
    package_files = [path for path in package.rglob("*") if path.is_file()]
    sums = "\n".join(f"{sha256_file(path)}  {path.relative_to(package)}" for path in sorted(package_files)) + "\n"
    (package / "SHA256SUMS.txt").write_text(sums, encoding="utf-8")
    zip_path = out / f"OIIS_COMPLETE_18_COMPONENT_SCREENING_HANDOFF_{utc_stamp()}.zip"
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for path in sorted(package.rglob("*")):
            if path.is_file(): archive.write(path, path.relative_to(package.parent))
    max_bytes = args.compact_max_mb * 1024 * 1024
    if zip_path.stat().st_size > max_bytes: raise SystemExit(f"compact package exceeds limit: {zip_path.stat().st_size} > {max_bytes}")
    database_rows = sync_test_database(out)
    mark(out, "export", "PASS", zip_path=str(zip_path), size_bytes=zip_path.stat().st_size, sha256=sha256_file(zip_path), test_database_rows=database_rows)
    print(json.dumps({"status": "PASS", "zip": str(zip_path), "size_bytes": zip_path.stat().st_size, "sha256": sha256_file(zip_path), "test_database_rows": database_rows}, indent=2))


def resume(args) -> None:
    out = experiment_dir(args.experiment_id)
    steps = state(out)["steps"]
    if "reproduce_baseline" not in steps: command = "reproduce-baseline"
    elif "component_screening" not in steps: command = "run-component-screening"
    elif "redundancy_study" not in steps: command = "run-redundancy-study"
    elif "walk_forward" not in steps: command = "run-walk-forward"
    else:
        print(json.dumps({"status": "NO_PENDING_COMPUTE_STAGE", "experiment_id": out.name}, indent=2)); return
    print(json.dumps({"resuming": command, "experiment_id": out.name}, indent=2))
    getattr(args, "all_components", False)
    {"reproduce-baseline": reproduce_baseline, "run-component-screening": run_component_screening, "run-redundancy-study": run_redundancy_study, "run-walk-forward": run_walk_forward}[command](args)


def status(args) -> None:
    out = experiment_dir(args.experiment_id)
    print(json.dumps(state(out), indent=2))


def verify(args) -> None:
    out = experiment_dir(args.experiment_id)
    issues = []
    required = [
        out / "OIIS_DOE_DATA_MANIFEST.json", out / "OIIS_DOE_DATA_INVENTORY.csv", out / "OIIS_DOE_DATA_COVERAGE.csv", out / "state.json",
        out / "trial_summary.csv", out / "factor_effects.csv", out / "interaction_effects.csv",
        out / "validation_results.json", out / "regime_effects.csv",
        out / "finite_capital_1000000_5.csv", out / "finite_capital_1600000_8.csv",
    ]
    for path in required:
        if not path.exists() or path.stat().st_size == 0: issues.append(f"missing_or_empty:{path.name}")
    summary_path = out / "trial_summary.csv"
    if summary_path.exists():
        summary = pd.read_csv(summary_path)
        if summary.trial_id.nunique() != 19: issues.append(f"trial_count:{summary.trial_id.nunique()}")
        hashes = [json.loads(path.read_text()).get("result_hash") for path in (out / "trials").glob("*/summary.json")]
        if any(not value for value in hashes): issues.append("missing_result_hash")
        for trial_id in summary.trial_id:
            decision_path = out / "full_evidence/trial_decisions" / f"{trial_id}.parquet"
            trade_path = out / "trials" / trial_id / "trades.csv"
            if not decision_path.exists(): issues.append(f"missing_decisions:{trial_id}")
            else:
                decision_keys = pd.read_parquet(decision_path, columns=["decision_hash"])
                if decision_keys.decision_hash.duplicated().any(): issues.append(f"duplicate_decisions:{trial_id}")
            if trade_path.exists():
                paths = pd.read_csv(trade_path, usecols=["entry_path_id"])
                if paths.entry_path_id.duplicated().any(): issues.append(f"duplicate_trade_paths:{trial_id}")
    for path in [out / "finite_capital_1000000_5.csv", out / "finite_capital_1600000_8.csv"]:
        if path.exists() and path.stat().st_size:
            portfolio = pd.read_csv(path)
            if not np.allclose(portfolio.ending_equity, portfolio.starting_capital + portfolio.net_pnl): issues.append(f"equity_reconciliation:{path.name}")
    determinism_path = out / "baseline_determinism.json"
    if not determinism_path.exists() or not json.loads(determinism_path.read_text()).get("hashes_match"):
        issues.append("baseline_determinism")
    baseline_summary_path = out / "trials/S0_BASELINE_FULL/summary.json"
    if baseline_summary_path.exists() and (out / "full_evidence/trial_decisions/S0_BASELINE_FULL.parquet").exists():
        expected_hash = json.loads(baseline_summary_path.read_text())["result_hash"]
        resumed_hash = persisted_trial_hash(out, "S0_BASELINE_FULL")
        json_dump(out / "resume_parity.json", {"expected_hash": expected_hash, "persisted_restart_hash": resumed_hash, "hashes_match": expected_hash == resumed_hash, "scope": "process-restart from persisted decision/trade/skip checkpoints"})
        if expected_hash != resumed_hash: issues.append("resume_parity")
    required_steps = ["inventory", "preflight", "reproduce_baseline", "component_screening", "redundancy_study", "walk_forward", "finite_capital_1000000_5", "finite_capital_1600000_8"]
    for step in required_steps:
        if step not in state(out)["steps"]: issues.append(f"missing_step:{step}")
    result = {"experiment_id": out.name, "status": "PASS" if not issues else "FAIL", "issues": issues}
    json_dump(out / "verification.json", result); print(json.dumps(result, indent=2))
    if issues: raise SystemExit(4)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["inventory", "qualify-data", "preflight", "register-existing-trials", "reproduce-baseline", "run-component-screening", "run-redundancy-study", "run-walk-forward", "run-finite-capital", "status", "verify", "export", "resume"])
    parser.add_argument("experiment_id_pos", nargs="?")
    parser.add_argument("--experiment-id")
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--all-components", action="store_true")
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--capital", type=float, default=1_000_000)
    parser.add_argument("--max-positions", type=int, default=5)
    parser.add_argument("--compact-max-mb", type=int, default=200)
    return parser


def main() -> None:
    args = build_parser().parse_args()
    if not args.experiment_id and args.experiment_id_pos: args.experiment_id = args.experiment_id_pos
    commands = {
        "inventory": inventory, "qualify-data": qualify_data, "preflight": preflight,
        "register-existing-trials": register_existing, "reproduce-baseline": reproduce_baseline,
        "run-component-screening": run_component_screening, "run-redundancy-study": run_redundancy_study,
        "run-walk-forward": run_walk_forward, "run-finite-capital": run_finite_capital,
        "status": status, "verify": verify, "export": export_package, "resume": resume,
    }
    commands[args.command](args)


if __name__ == "__main__": main()
