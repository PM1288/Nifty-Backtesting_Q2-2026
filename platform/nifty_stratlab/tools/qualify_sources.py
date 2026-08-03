#!/usr/bin/env python3
"""Qualify explicitly named sources; never scans a directory implicitly."""
from __future__ import annotations

import argparse
import json
import re
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from nifty_stratlab.calendar.config import load_calendar_config
from nifty_stratlab.data.csv_profiler import profile_csv
from nifty_stratlab.data.workbook_profiler import profile_workbook_structure
from nifty_stratlab.util.io import atomic_write_json


def interval_from_name(path: Path) -> int:
    match = re.search(r"_(?:(\d+)minute|minute)\.csv$", path.name, re.IGNORECASE)
    return int(match.group(1) or 1) if match else 1


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--csv", action="append", default=[], help="explicit CSV path; repeat as needed")
    parser.add_argument("--workbook", action="append", default=[], help="explicit XLSX path; repeat as needed")
    parser.add_argument("--workbook-sample-rows", type=int, default=25)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--calendar-config", type=Path)
    args = parser.parse_args()
    if not args.csv and not args.workbook:
        parser.error("at least one --csv or --workbook is required")

    package_root = Path(__file__).resolve().parents[1]
    calendar_config = args.calendar_config or package_root / "config/market_rules.example.yml"
    calendar, _ = load_calendar_config(calendar_config)
    records: list[dict] = []
    for value in args.csv:
        path = Path(value).expanduser().resolve()
        try:
            payload = profile_csv(
                path,
                trading_calendar=calendar,
                interval_minutes=interval_from_name(path),
            ).as_dict()
            payload["qualification_status"] = "QUARANTINED" if payload["status"] == "FAIL" else payload["status"]
        except Exception as exc:
            payload = {
                "path": str(path),
                "status": "FAIL",
                "qualification_status": "QUARANTINED",
                "error": f"{type(exc).__name__}: {exc}",
            }
        payload["source_type"] = "csv"
        records.append(payload)
    for value in args.workbook:
        path = Path(value).expanduser().resolve()
        try:
            payload = profile_workbook_structure(path, sample_rows=args.workbook_sample_rows).as_dict()
            payload["qualification_status"] = payload["status"]
        except Exception as exc:
            payload = {
                "path": str(path),
                "status": "FAIL",
                "qualification_status": "QUARANTINED",
                "error": f"{type(exc).__name__}: {exc}",
            }
        payload["source_type"] = "workbook_structure_sample"
        records.append(payload)

    counts = Counter(item["qualification_status"] for item in records)
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "calendar_config": str(calendar_config.resolve()),
        "source_files_immutable": True,
        "workbooks_fully_processed": False,
        "summary": dict(sorted(counts.items())),
        "records": records,
    }
    atomic_write_json(args.output, report)
    print(json.dumps({"output": str(args.output), "summary": report["summary"]}, sort_keys=True))
    return 2 if counts.get("QUARANTINED", 0) else 0


if __name__ == "__main__":
    raise SystemExit(main())
