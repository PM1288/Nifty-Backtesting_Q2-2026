#!/usr/bin/env python3
"""Run the nine historical O/X threshold combinations in isolated workers."""
from __future__ import annotations
import argparse, json, os, subprocess, sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PYTHON = ROOT / "platform/nifty_stratlab/.venv/bin/python"
RUNNER = ROOT / "platform/nifty_stratlab/tools/run_oiis_cash_daily_replay.py"

LEVELS = {
    # Historical score bands: low is the broad exploratory gate, medium is
    # the current production-like gate, high is the selective tail gate.
    "low": {"ofactor": 60.0, "xa": 70.0, "xb": 65.0},
    "medium": {"ofactor": 74.0, "xa": 84.0, "xb": 76.0},
    "high": {"ofactor": 82.0, "xa": 90.0, "xb": 84.0},
}

def run_one(item: tuple[str, dict[str, float]], args: argparse.Namespace) -> dict:
    name, values = item
    out = Path(args.output_root) / name
    env = dict(os.environ)
    env["CONFIRM_FULL_OIIS_REPLAY"] = "YES"
    cmd = [str(PYTHON), str(RUNNER), "--start", args.start, "--end", args.end,
           "--workers", str(args.workers_per_run), "--output-root", str(out),
           "--ofactor-min", str(values["ofactor"]), "--xfactor-tier-a", str(values["xa"]),
           "--xfactor-tier-b", str(values["xb"])]
    if args.database_url:
        cmd += ["--database-url", args.database_url]
    log = out.with_suffix(".log")
    out.parent.mkdir(parents=True, exist_ok=True)
    with log.open("w", encoding="utf-8") as fh:
        proc = subprocess.run(cmd, cwd=ROOT, env=env, stdout=fh, stderr=subprocess.STDOUT, text=True)
    result = {"combination": name, "thresholds": values, "returncode": proc.returncode, "log": str(log)}
    if proc.returncode == 0:
        lines = log.read_text(encoding="utf-8").splitlines()
        payload = json.loads("\n".join(lines[lines.index("{") :])) if "{" in lines else {}
        result.update({k: payload.get(k) for k in ("output_dir", "enterable_count", "trade_count", "total_after_tax_net_pnl", "h30_diagnostic_score")})
    return result

def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--start", default="2016-01-01")
    p.add_argument("--end", default="2026-08-05")
    p.add_argument("--database-url", default=os.environ.get("DATABASE_URL"))
    p.add_argument("--output-root", default=str(ROOT / "platform/nifty_stratlab/outputs/oiis_threshold_sweep_2026-08-07"))
    p.add_argument("--workers", type=int, default=3, help="parallel threshold combinations")
    p.add_argument("--workers-per-run", type=int, default=4)
    args = p.parse_args()
    combinations = [(f"{o}_{x}", {"ofactor": LEVELS[o]["ofactor"], "xa": LEVELS[x]["xa"], "xb": LEVELS[x]["xb"]}) for o in LEVELS for x in LEVELS]
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        results = [future.result() for future in as_completed([pool.submit(run_one, item, args) for item in combinations])]
    results.sort(key=lambda row: row["combination"])
    summary = Path(args.output_root) / "sweep_summary.json"
    summary.parent.mkdir(parents=True, exist_ok=True)
    summary.write_text(json.dumps({"levels": LEVELS, "results": results}, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"summary": str(summary), "results": results}, indent=2))
    raise SystemExit(0 if all(row["returncode"] == 0 for row in results) else 1)

if __name__ == "__main__":
    main()
