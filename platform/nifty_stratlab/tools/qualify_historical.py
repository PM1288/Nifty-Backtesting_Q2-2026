#!/usr/bin/env python3
"""Create deterministic, non-destructive quality manifests for the supplied estate."""
from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter
from concurrent.futures import ProcessPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

from nifty_stratlab.calendar.config import load_calendar_config
from nifty_stratlab.data.csv_profiler import profile_csv
from nifty_stratlab.data.manifest import inventory_tree, write_manifest
from nifty_stratlab.data.workbook_profiler import profile_workbook
from nifty_stratlab.util.io import atomic_write_json


DEFAULT_STOCK_ROOT = Path("/home/novius2/data/nifty-50-minute-data/aaditya555")
DEFAULT_INDEX_ROOT = Path("/home/novius2/data/nifty-50-minute-data/debashis74017")
DEFAULT_FII_ROOT = Path("/home/novius2/data/fii-dii-and-nifty-historical-study-july-2023")


def interval_from_name(path: Path) -> int:
    match = re.search(r"_(?:(\d+)minute|minute)\.csv$", path.name, re.IGNORECASE)
    return int(match.group(1) or 1) if match else 1


def qualify_one_csv(task: tuple[str, str, str]) -> dict:
    path_text, dataset, config_path = task
    path = Path(path_text)
    try:
        calendar, _ = load_calendar_config(config_path)
        profile = profile_csv(path, trading_calendar=calendar, interval_minutes=interval_from_name(path))
        payload = profile.as_dict()
        payload["qualification_status"] = "QUARANTINED" if payload["status"] == "FAIL" else payload["status"]
    except Exception as exc:
        payload = {"path": str(path.resolve()), "status": "FAIL", "qualification_status": "QUARANTINED", "error": f"{type(exc).__name__}: {exc}"}
    payload["dataset"] = dataset
    return payload


def qualify_csvs(root: Path, dataset: str, config_path: Path, limit: int | None, workers: int) -> list[dict]:
    paths = sorted(root.rglob("*.csv"))
    if limit is not None:
        paths = paths[:limit]
    records = []
    tasks = [(str(path), dataset, str(config_path)) for path in paths]
    if workers == 1:
        results = map(qualify_one_csv, tasks)
    else:
        with ProcessPoolExecutor(max_workers=workers) as executor:
            results = list(executor.map(qualify_one_csv, tasks))
    for number, payload in enumerate(results, 1):
        records.append(payload)
        print(f"[{dataset} {number}/{len(paths)}] {payload['qualification_status']} {Path(payload['path']).name}", file=sys.stderr)
    return records


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--stock-root", type=Path, default=DEFAULT_STOCK_ROOT)
    parser.add_argument("--index-root", type=Path, default=DEFAULT_INDEX_ROOT)
    parser.add_argument("--fii-root", type=Path, default=DEFAULT_FII_ROOT)
    parser.add_argument("--limit", type=int, help="qualify only this many files from each CSV root")
    parser.add_argument("--workers", type=int, default=1, help="parallel CSV workers; use 1 for deterministic single-process execution")
    args = parser.parse_args()
    if args.limit is not None and args.limit <= 0:
        parser.error("--limit must be positive")
    if args.workers <= 0:
        parser.error("--workers must be positive")
    args.output_dir.mkdir(parents=True, exist_ok=True)
    package_root = Path(__file__).resolve().parents[1]
    config_path = package_root / "config/market_rules.example.yml"
    stock = qualify_csvs(args.stock_root, "aaditya555_stocks", config_path, args.limit, args.workers)
    index = qualify_csvs(args.index_root, "debashis74017_indices", config_path, args.limit, args.workers)
    workbook_paths = sorted(args.fii_root.rglob("*.xlsx"))
    if args.limit is not None:
        workbook_paths = workbook_paths[:args.limit]
    workbooks = []
    for path in workbook_paths:
        try:
            payload = profile_workbook(path).as_dict()
            payload["qualification_status"] = payload["status"]
        except Exception as exc:
            payload = {"path": str(path.resolve()), "status": "FAIL", "qualification_status": "QUARANTINED", "error": f"{type(exc).__name__}: {exc}"}
        payload["dataset"] = "fii_dii_workbook"
        workbooks.append(payload)
    all_records = stock + index + workbooks
    for root, dataset, patterns in ((args.stock_root, "aaditya555_stocks", ("*.csv",)), (args.index_root, "debashis74017_indices", ("*.csv",)), (args.fii_root, "fii_dii_workbook", ("*.xlsx",))):
        write_manifest(args.output_dir / f"{dataset}_source_manifest.json", inventory_tree(root, dataset_name=dataset, patterns=patterns))
    counts = Counter(item["qualification_status"] for item in all_records)
    report = {"generated_at": datetime.now(timezone.utc).isoformat(), "records": all_records, "summary": dict(sorted(counts.items())), "source_files": len(all_records), "source_files_immutable": True, "fii_dii_feature_status": "EXCLUDED_PENDING_AVAILABLE_AT_RULE"}
    atomic_write_json(args.output_dir / "qualification_report.json", report)
    atomic_write_json(args.output_dir / "quarantine_manifest.json", {"records": [item for item in all_records if item["qualification_status"] == "QUARANTINED"]})
    print(json.dumps(report["summary"], sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
