#!/usr/bin/env python3
"""Run every assumed hybrid entry detector on one real CSV symbol."""
from __future__ import annotations

import argparse
import csv
import json
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

from nifty_stratlab.strategies.hybrid_assumption_engine import (
    ASSUMPTION_VERSION, build_feature_frame, evaluate_strategy,
)


def simulate_target_only(features: pd.DataFrame, signals: pd.Series) -> tuple[int, int, int]:
    """One-position smoke replay using the approved two-stage target contract."""
    closed=same_day=swing=0; next_free=0
    indices=list(features.index[signals])
    for signal_i in indices:
        if signal_i < next_free or signal_i+1 >= len(features): continue
        entry_i=signal_i+1; entry=float(features.at[entry_i,"open"]); entry_session=features.at[entry_i,"session"]
        exit_i=None; stage=""
        for i in range(entry_i+1,len(features)):
            same=features.at[i,"session"]==entry_session
            target=entry*1.003 if same else entry*1.01
            if float(features.at[i,"high"])>=target:
                exit_i=i; stage="same_day" if same else "swing"; break
        if exit_i is None: break
        closed+=1; same_day+=stage=="same_day"; swing+=stage=="swing"; next_free=exit_i+1
    return closed,same_day,swing


def main() -> int:
    p=argparse.ArgumentParser()
    p.add_argument("--catalogue",type=Path,required=True); p.add_argument("--csv",type=Path,required=True)
    p.add_argument("--symbol",default="RELIANCE"); p.add_argument("--start",default="2024-01-01"); p.add_argument("--end",default="2024-03-31")
    p.add_argument("--nifty-csv",type=Path); p.add_argument("--vix-csv",type=Path)
    p.add_argument("--output-dir",type=Path,required=True); args=p.parse_args()
    raw=pd.read_csv(args.csv)
    raw=raw[(raw.date>=f"{args.start} 00:00:00")&(raw.date<=f"{args.end} 23:59:59")].copy()
    if raw.empty: raise SystemExit("smoke slice has no bars")
    market=pd.read_csv(args.nifty_csv) if args.nifty_csv else None; vix=pd.read_csv(args.vix_csv) if args.vix_csv else None
    if market is not None: market=market[(market.date>=f"{args.start} 00:00:00")&(market.date<=f"{args.end} 23:59:59")]
    if vix is not None: vix=vix[(vix.date>=f"{args.start} 00:00:00")&(vix.date<=f"{args.end} 23:59:59")]
    features=build_feature_frame(raw,market,vix); catalogue=json.loads(args.catalogue.read_text())
    rows=[]; failures=[]
    for strategy in catalogue["strategies"]:
        try:
            signals,rule=evaluate_strategy(strategy,features)
            closed,same_day,swing=simulate_target_only(features,signals)
            rows.append({"strategy_id":strategy["strategy_id"],"family":strategy["family"],"wave":strategy["test_wave"],"data_tier":strategy["data_tier"],"signal_count":int(signals.sum()),"closed_trades":closed,"same_day_targets":same_day,"swing_targets":swing,"first_signal":features.loc[signals,"date"].min().isoformat() if signals.any() else "","assumption_count":len(rule.assumptions),"assumptions":"|".join(rule.assumptions),"status":"PASS"})
        except Exception as exc:
            failures.append({"strategy_id":strategy["strategy_id"],"error":f"{type(exc).__name__}: {exc}"})
    args.output_dir.mkdir(parents=True,exist_ok=True)
    with (args.output_dir/"detector_smoke.csv").open("w",newline="",encoding="utf-8") as f:
        writer=csv.DictWriter(f,fieldnames=rows[0].keys()); writer.writeheader(); writer.writerows(rows)
    summary={"status":"FAIL" if failures else "PASS","generated_at":datetime.now(timezone.utc).isoformat(),"assumption_version":ASSUMPTION_VERSION,"symbol":args.symbol.upper(),"start":args.start,"end":args.end,"bars":len(features),"strategies_requested":len(catalogue["strategies"]),"strategies_passed":len(rows),"strategies_with_signals":sum(r["signal_count"]>0 for r in rows),"failures":failures,"warning":"Assumption-engine smoke proves deterministic execution only; it does not validate profitability or source-author intent."}
    (args.output_dir/"detector_smoke_summary.json").write_text(json.dumps(summary,indent=2),encoding="utf-8")
    print(json.dumps(summary,indent=2)); return 1 if failures else 0


if __name__=="__main__": raise SystemExit(main())
