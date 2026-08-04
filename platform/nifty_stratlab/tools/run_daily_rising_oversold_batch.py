#!/usr/bin/env python3
"""Run the reference RSI/Bollinger strategy over every CSV with two workers."""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--csv-dir", type=Path, required=True)
    p.add_argument("--output-dir", type=Path, required=True)
    p.add_argument("--start", required=True)
    p.add_argument("--end", required=True)
    p.add_argument("--workers", type=int, default=2)
    p.add_argument("--exclude", nargs="*", default=["TMPV"])
    p.add_argument("--report", type=Path, required=True)
    args = p.parse_args()
    if args.workers < 1:
        p.error("--workers must be positive")
    csvs = sorted(args.csv_dir.glob("*.csv"))
    excluded = {x.upper().removesuffix(".CSV") for x in args.exclude}
    jobs = [(f.stem.upper(), f) for f in csvs if f.stem.upper() not in excluded]
    args.output_dir.mkdir(parents=True, exist_ok=True)
    tools_dir = Path(__file__).resolve().parent
    package_root = tools_dir.parent
    env = os.environ.copy()
    env["PYTHONPATH"] = os.pathsep.join([str(package_root / "src"), str(tools_dir), env.get("PYTHONPATH", "")])

    def run(job: tuple[str, Path]) -> dict:
        symbol, csv = job
        out = args.output_dir / symbol
        out.mkdir(parents=True, exist_ok=True)
        cmd = [sys.executable, str(tools_dir / "run_daily_rising_oversold_intraday.py"),
               "--csv", str(csv), "--symbol", symbol, "--start", args.start,
               "--end", args.end, "--output-dir", str(out)]
        proc = subprocess.run(cmd, cwd=package_root, env=env, text=True,
                              capture_output=True)
        (out / "run.log").write_text(proc.stdout + ("\nSTDERR\n" + proc.stderr if proc.stderr else ""), encoding="utf-8")
        result = {"symbol": symbol, "returncode": proc.returncode, "output_dir": str(out)}
        if proc.returncode == 0:
            try:
                result["summary"] = json.loads(proc.stdout.strip().splitlines()[-1])
            except (ValueError, IndexError):
                result["summary_parse_error"] = True
        else:
            result["error"] = proc.stderr[-2000:]
        print(json.dumps(result, default=str), flush=True)
        return result

    started = datetime.now(timezone.utc).isoformat()
    results = []
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = [pool.submit(run, j) for j in jobs]
        for future in as_completed(futures):
            results.append(future.result())
    report = {"started_at": started, "finished_at": datetime.now(timezone.utc).isoformat(),
              "workers": args.workers, "start": args.start, "end": args.end,
              "excluded": sorted(excluded), "symbols_requested": len(jobs),
              "completed": sum(r["returncode"] == 0 for r in results),
              "failed": sum(r["returncode"] != 0 for r in results), "results": sorted(results, key=lambda x: x["symbol"])}
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")
    print(json.dumps({k: report[k] for k in ("symbols_requested", "completed", "failed", "report")}, default=str), flush=True)
    return 1 if report["failed"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
