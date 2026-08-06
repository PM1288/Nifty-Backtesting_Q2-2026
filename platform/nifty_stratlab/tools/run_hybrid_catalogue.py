#!/usr/bin/env python3
"""Assumption-backed hybrid catalogue runner with consolidated strategy reports."""
from __future__ import annotations

import argparse
import json
import math
from concurrent.futures import ProcessPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from decimal import Decimal
from typing import Any

import pandas as pd

from nifty_stratlab.strategies.hybrid_assumption_engine import ASSUMPTION_VERSION, build_feature_frame, evaluate_strategy
from nifty_stratlab.evaluation.common_exit import PathBar, evaluate_long_target_only


def _simulate(symbol: str, strategy: dict[str, Any], f: pd.DataFrame, signals: pd.Series) -> tuple[list[dict], dict]:
    candidate_indices=list(f.index[signals])
    # Frozen v1 assumption: first completed signal per symbol-session.
    first=[]; seen=set()
    for i in candidate_indices:
        session=str(f.at[i,"session"])
        if session not in seen: seen.add(session); first.append(i)
    trades=[]; next_free=0; rejected=0
    for signal_i in first:
        if signal_i < next_free or signal_i+1>=len(f): rejected+=1; continue
        entry_i=signal_i+1; entry=float(f.at[entry_i,"open"]); entry_session=f.at[entry_i,"session"]
        if not math.isfinite(entry) or entry <= 0: rejected+=1; continue
        quantity=math.floor(200000/entry)
        if quantity<=0: rejected+=1; continue
        path = [PathBar(
            ts=pd.Timestamp(f.at[i,"date"]).to_pydatetime(), session=f.at[i,"session"],
            open=Decimal(str(f.at[i,"open"])), high=Decimal(str(f.at[i,"high"])),
            low=Decimal(str(f.at[i,"low"])), close=Decimal(str(f.at[i,"close"])),
        ) for i in range(entry_i, len(f))]
        outcome = evaluate_long_target_only(
            symbol=symbol, signal_date=f.at[signal_i,"session"], entry_price=Decimal(str(entry)),
            quantity=quantity, bars=path,
        )
        if outcome["status"] != "CLOSED":
            trades.append({"strategy_id":strategy["strategy_id"],"symbol":symbol,"signal_ts":f.at[signal_i,"date"].isoformat(),"entry_ts":f.at[entry_i,"date"].isoformat(),"exit_ts":"","entry_price":entry,"exit_price":"","quantity":quantity,"target_stage":"OPEN_SWING_1_0","gross_pnl":0.0,"estimated_charges":outcome["costs"],"net_pnl":0.0,"tax_35_pct":0.0,"after_tax_pnl":0.0,"unrealized_net_liquidation_pnl":outcome["unrealized_net_liquidation_pnl"],"status":"OPEN_AS_OF_END","mfe_pct":outcome["mfe_pct"],"mae_pct":outcome["mae_pct"],"stop_exit_enabled":False,"capital_released":False})
            break
        exit_ts=pd.Timestamp(outcome["exit_ts"]); exit_i=int(f.index[f.date.eq(exit_ts)][0])
        stage="INTRADAY_0_3" if outcome["exit_reason"].startswith("TARGET_INTRADAY") else "SWING_1_0"
        net=float(outcome["gross_pnl"])-float(outcome["costs"])
        trades.append({"strategy_id":strategy["strategy_id"],"symbol":symbol,"signal_ts":f.at[signal_i,"date"].isoformat(),"entry_ts":f.at[entry_i,"date"].isoformat(),"exit_ts":exit_ts.isoformat(),"entry_price":outcome["entry_price"],"exit_price":outcome["exit_price"],"quantity":quantity,"target_stage":stage,"gross_pnl":outcome["gross_pnl"],"estimated_charges":outcome["costs"],"net_pnl":round(net,2),"tax_35_pct":outcome["tax_reserve"],"after_tax_pnl":outcome["after_tax_net_pnl"],"unrealized_net_liquidation_pnl":0.0,"status":"CLOSED","mfe_pct":outcome["mfe_pct"],"mae_pct":outcome["mae_pct"],"stop_exit_enabled":False,"capital_released":True})
        next_free=exit_i+1
    closed=[t for t in trades if t["status"]=="CLOSED"]
    summary={"strategy_id":strategy["strategy_id"],"symbol":symbol,"raw_signals":int(signals.sum()),"daily_candidates":len(first),"accepted_trades":len(trades),"closed_trades":len(closed),"open_trades":len(trades)-len(closed),"rejected_while_position_open":rejected,"net_pnl":round(sum(float(t["net_pnl"]) for t in closed),2),"after_tax_pnl":round(sum(float(t["after_tax_pnl"]) for t in closed),2)}
    return trades,summary


def _bounded(path: str, start: str, end: str) -> pd.DataFrame:
    raw=pd.read_csv(path); return raw[(raw.date>=f"{start} 00:00:00")&(raw.date<=f"{end} 23:59:59")].copy()


def _run_symbol(csv_path: str, symbol: str, start: str, end: str, strategies: list[dict], market_path: str, vix_path: str) -> dict:
    raw=_bounded(csv_path,start,end)
    raw["_clock"]=raw.date.str.slice(11,16); raw=raw[raw._clock.between("09:15","15:29")].drop(columns="_clock")
    for col in ("open","high","low","close","volume"): raw[col]=pd.to_numeric(raw[col],errors="coerce")
    raw=raw.dropna(subset=["open","high","low","close"]); raw=raw[(raw.open>0)&(raw.high>=raw[["open","close","low"]].max(axis=1))&(raw.low<=raw[["open","close","high"]].min(axis=1))]
    if raw.empty: return {"symbol":symbol,"error":"NO_DATA","strategies":{}}
    market=_bounded(market_path,start,end); vix=_bounded(vix_path,start,end)
    f=build_feature_frame(raw,market,vix); results={}
    for strategy in strategies:
        signals,rule=evaluate_strategy(strategy,f); trades,summary=_simulate(symbol,strategy,f,signals)
        results[strategy["strategy_id"]]={"summary":summary,"trades":trades,"assumptions":list(rule.assumptions)}
    return {"symbol":symbol,"bars":len(f),"strategies":results}


def main() -> int:
    p=argparse.ArgumentParser(); p.add_argument("--catalogue",type=Path,required=True); p.add_argument("--csv-dir",type=Path,required=True); p.add_argument("--output-dir",type=Path,required=True)
    p.add_argument("--symbols",nargs="*"); p.add_argument("--exclude",nargs="*",default=["TMPV"]); p.add_argument("--start",default="2015-02-02"); p.add_argument("--end",default="2025-08-06"); p.add_argument("--workers",type=int,default=2)
    p.add_argument("--nifty-csv",default="/home/novius2/data/nifty-50-minute-data/debashis74017/NIFTY 50_minute.csv"); p.add_argument("--vix-csv",default="/home/novius2/data/nifty-50-minute-data/debashis74017/INDIA VIX_minute.csv")
    args=p.parse_args(); catalogue=json.loads(args.catalogue.read_text()); strategies=catalogue["strategies"]
    excluded={x.upper() for x in args.exclude}; available={x.stem.upper():x for x in args.csv_dir.glob("*.csv") if x.stem.upper() not in excluded}
    selected=[x.upper() for x in args.symbols] if args.symbols else sorted(available)
    missing=[s for s in selected if s not in available]
    if missing: raise SystemExit(f"missing CSV symbols: {missing}")
    args.output_dir.mkdir(parents=True,exist_ok=True); results=[]
    with ProcessPoolExecutor(max_workers=args.workers) as pool:
        futures={pool.submit(_run_symbol,str(available[s]),s,args.start,args.end,strategies,args.nifty_csv,args.vix_csv):s for s in selected}
        for future in as_completed(futures):
            result=future.result(); results.append(result); print(json.dumps({"symbol":result["symbol"],"bars":result.get("bars"),"error":result.get("error")}),flush=True)
    run_summary={"status":"SUCCESS" if all("error" not in r for r in results) else "PARTIAL","generated_at":datetime.now(timezone.utc).isoformat(),"assumption_version":ASSUMPTION_VERSION,"start":args.start,"end":args.end,"symbols":sorted(selected),"excluded_symbols":sorted(excluded),"strategy_count":len(strategies),"workers":args.workers,"exit_contract":"target-only: 0.3% same session, then 1.0% swing from original entry","cost_assumption":"8 bps intraday or 22 bps swing round trip","profit_tax_assumption_pct":35,"warning":"Assumption-backed research result; current-universe and proxy bias applies."}
    for strategy in strategies:
        sid=strategy["strategy_id"]; out=args.output_dir/sid; out.mkdir(exist_ok=True)
        trades=[]; summaries=[]
        for result in results:
            item=result.get("strategies",{}).get(sid)
            if item: trades.extend(item["trades"]); summaries.append(item["summary"])
        pd.DataFrame(trades).to_csv(out/"trades.csv",index=False)
        pd.DataFrame(summaries).to_csv(out/"symbol_summary.csv",index=False)
        closed=[t for t in trades if t["status"]=="CLOSED"]
        summary={**run_summary,"strategy_id":sid,"display_name":strategy["display_name"],"family":strategy["family"],"wave":strategy["test_wave"],"data_tier":strategy["data_tier"],"total_trades":len(trades),"closed_trades":len(closed),"open_trades":len(trades)-len(closed),"net_pnl":round(sum(float(t["net_pnl"]) for t in closed),2),"after_tax_pnl":round(sum(float(t["after_tax_pnl"]) for t in closed),2)}
        (out/"summary.json").write_text(json.dumps(summary,indent=2),encoding="utf-8")
    (args.output_dir/"run_summary.json").write_text(json.dumps(run_summary,indent=2),encoding="utf-8")
    print(json.dumps(run_summary,indent=2)); return 0 if run_summary["status"]=="SUCCESS" else 1


if __name__=="__main__": raise SystemExit(main())
