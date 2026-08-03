#!/usr/bin/env python3
from __future__ import annotations

import argparse
import ast
import hashlib
import json
from pathlib import Path

import pandas as pd

from nifty_stratlab.reporting.research_pack import verify_research_pack


def main() -> int:
    parser = argparse.ArgumentParser(description="Verify an RSI 1m/daily45 backtest report.")
    parser.add_argument("output_dir", type=Path)
    args = parser.parse_args()
    root = args.output_dir
    manifest = json.loads((root / "MANIFEST.json").read_text(encoding="utf-8"))
    for item in manifest["files"]:
        path = root / item["path"]
        if not path.is_file():
            raise FileNotFoundError(path)
        if path.stat().st_size != item["bytes"]:
            raise AssertionError(f"size mismatch: {item['path']}")
        if hashlib.sha256(path.read_bytes()).hexdigest() != item["sha256"]:
            raise AssertionError(f"checksum mismatch: {item['path']}")
    signals = pd.read_csv(root / "signals.csv")
    trades = pd.read_csv(root / "trades.csv")
    entries = signals.loc[signals["intent_type"].eq("enter"), "metadata"].map(ast.literal_eval)
    exits = signals.loc[signals["intent_type"].eq("exit"), "metadata"].map(ast.literal_eval)
    if entries.empty or exits.empty or trades.empty:
        raise AssertionError("report must contain observed entries, exits, and closed trades")
    if not all(row["minute_rsi_14"] < 30 and row["prior_daily_rsi_14"] > 45 for row in entries):
        raise AssertionError("entry threshold violation")
    if not all(row["minute_rsi_14"] > 70 for row in exits):
        raise AssertionError("exit threshold violation")
    if set(trades["exit_reason"]) != {"strategy_exit_next_open"}:
        raise AssertionError("non-strategy exit found")
    pack = verify_research_pack(root / "research_pack.zip")
    print(
        json.dumps(
            {
                "status": "PASS", "manifest_files": len(manifest["files"]),
                "entries": len(entries), "exits": len(exits), "trades": len(trades),
                "research_pack_verified": pack["files_verified"],
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
