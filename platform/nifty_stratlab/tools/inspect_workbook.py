#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json

from nifty_stratlab.data.workbook_profiler import profile_workbook_structure


def main() -> int:
    parser = argparse.ArgumentParser(description="Inspect workbook structure using a bounded row sample")
    parser.add_argument("path")
    parser.add_argument("--sample-rows", type=int, default=25)
    args = parser.parse_args()
    print(json.dumps(profile_workbook_structure(args.path, sample_rows=args.sample_rows).as_dict(), indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
