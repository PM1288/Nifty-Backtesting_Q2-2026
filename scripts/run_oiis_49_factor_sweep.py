#!/usr/bin/env python3
"""Run O/X thresholds 20..80 (step 10), then rank every variation."""
from __future__ import annotations
import argparse, json, os, subprocess
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
PYTHON = ROOT / "platform/nifty_stratlab/.venv/bin/python"
RUNNER = ROOT / "platform/nifty_stratlab/tools/run_oiis_cash_daily_replay.py"
VALUES = tuple(range(20, 81, 10))

def run_one(o: int, x: int, args: argparse.Namespace) -> dict:
    name = f"o{o:02d}_x{x:02d}"; base = Path(args.output_root) / name; base.mkdir(parents=True, exist_ok=True)
    env = dict(os.environ); env["CONFIRM_FULL_OIIS_REPLAY"] = "YES"
    cmd = [str(PYTHON), str(RUNNER), "--start", args.start, "--end", args.end, "--workers", str(args.workers_per_run), "--output-root", str(base), "--ofactor-min", str(o), "--xfactor-tier-b", str(x), "--xfactor-tier-a", str(min(100, x + 8))]
    if args.database_url: cmd += ["--database-url", args.database_url]
    log = Path(args.output_root) / f"{name}.log"
    with log.open("w", encoding="utf-8") as fh: proc = subprocess.run(cmd, cwd=ROOT, env=env, stdout=fh, stderr=subprocess.STDOUT, text=True)
    result = {"combination": name, "ofactor_min": o, "xfactor_min": x, "xfactor_tier_a": min(100, x+8), "returncode": proc.returncode, "log": str(log)}
    if proc.returncode == 0:
        lines = log.read_text(encoding="utf-8").splitlines(); start = next((i for i, line in enumerate(lines) if line.strip() == "{"), None)
        if start is not None:
            payload = json.loads("\n".join(lines[start:])); result["output_dir"] = payload.get("output_dir")
    return result

def rank(result: dict) -> dict:
    out = Path(result.get("output_dir", "")); summary = json.loads((out / "summary.json").read_text()) if (out / "summary.json").exists() else {}
    trades = pd.DataFrame()
    try: trades = pd.read_csv(out / "trades.csv")
    except (FileNotFoundError, pd.errors.EmptyDataError): pass
    pnl = pd.to_numeric(trades.get("after_tax_net_pnl", pd.Series(dtype=float)), errors="coerce").fillna(0.0)
    returns = pd.to_numeric(trades.get("return_pct", pd.Series(dtype=float)), errors="coerce").dropna()
    hold = pd.to_numeric(trades.get("holding_sessions", pd.Series(dtype=float)), errors="coerce").dropna()
    mae = pd.to_numeric(trades.get("mae_pct", pd.Series(dtype=float)), errors="coerce").dropna()
    equity = pnl.cumsum(); drawdown = equity - equity.cummax()
    result.update({"decision_count": summary.get("decision_count", 0), "enterable_count": summary.get("enterable_count", 0), "trade_count": len(trades), "after_tax_pnl": round(float(pnl.sum()),4), "pnl_per_trade": round(float(pnl.sum()/len(pnl)),4) if len(pnl) else 0.0, "median_return_pct": round(float(returns.median()),6) if len(returns) else None, "win_rate_pct": round(float((pnl>0).mean()*100),4) if len(pnl) else None, "max_drawdown": round(float(drawdown.min()),4) if len(drawdown) else 0.0, "max_drawdown_pct_of_pnl": round(float(abs(drawdown.min())/pnl.sum()*100),4) if len(pnl) and pnl.sum() else None, "median_trapped_sessions": round(float(hold.median()),4) if len(hold) else None, "p95_trapped_sessions": round(float(hold.quantile(.95)),4) if len(hold) else None, "median_mae_pct": round(float(mae.median()),6) if len(mae) else None, "p95_mae_pct": round(float(mae.quantile(.95)),6) if len(mae) else None, "h30_diagnostic_score": summary.get("h30_diagnostic_score", 0), "ladder_hits": summary.get("reward_level_hit_counts", {}), "adverse_hits": summary.get("adverse_level_hit_counts", {}), "data_completeness_status": summary.get("data_completeness_status")})
    return result

def main() -> None:
    p=argparse.ArgumentParser(); p.add_argument("--start",default="2016-01-01"); p.add_argument("--end",default="2026-08-05"); p.add_argument("--database-url",default=os.environ.get("DATABASE_URL")); p.add_argument("--output-root",default=str(ROOT/"platform/nifty_stratlab/outputs/oiis_49_factor_sweep_2026-08-07")); p.add_argument("--workers",type=int,default=4); p.add_argument("--workers-per-run",type=int,default=4); a=p.parse_args()
    Path(a.output_root).mkdir(parents=True, exist_ok=True); jobs=[(o,x) for o in VALUES for x in VALUES]
    with ThreadPoolExecutor(max_workers=a.workers) as pool: results=[f.result() for f in as_completed([pool.submit(run_one,o,x,a) for o,x in jobs])]
    ranked=[rank(r) for r in results if r.get("returncode")==0]; ranked.sort(key=lambda r:(r.get("after_tax_pnl",0),r.get("pnl_per_trade",0)),reverse=True)
    root=Path(a.output_root); pd.DataFrame(ranked).drop(columns=["ladder_hits","adverse_hits"],errors="ignore").to_csv(root/"factor_ranking.csv",index=False); (root/"factor_ranking.json").write_text(json.dumps({"threshold_values":VALUES,"results":ranked},indent=2,default=str)+"\n")
    print(json.dumps({"output_root":str(root),"completed":len(ranked),"failed":49-len(ranked),"top":ranked[:10]},indent=2,default=str))

if __name__ == "__main__": main()
