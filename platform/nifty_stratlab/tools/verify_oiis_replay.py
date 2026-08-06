#!/usr/bin/env python3
"""Verify an OIIS replay artifact directory and its checksums."""

import argparse
import hashlib
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("output_dir", type=Path)
args = parser.parse_args()
manifest = args.output_dir / "checksums.sha256"
if not manifest.is_file():
    raise SystemExit(f"Missing {manifest}")
checked = 0
for line in manifest.read_text(encoding="utf-8").splitlines():
    digest, name = line.split("  ", 1)
    path = args.output_dir / name
    actual = hashlib.sha256(path.read_bytes()).hexdigest()
    if actual != digest:
        raise SystemExit(f"Checksum mismatch: {name}")
    checked += 1
required = {"decisions.csv", "trades.csv", "regime_performance.csv", "summary.json", "summary.md"}
missing = required - {path.name for path in args.output_dir.iterdir()}
if missing:
    raise SystemExit(f"Missing required artifacts: {sorted(missing)}")
print(f"PASS: {checked} checksums and all required artifacts verified")
