#!/usr/bin/env python3
"""Run one supplied entry-only strategy from a minute-CSV estate."""
from __future__ import annotations
import argparse, hashlib, json, os, sys, uuid
from datetime import date
from pathlib import Path
from concurrent.futures import ProcessPoolExecutor, as_completed
import pandas as pd

ROOT=Path(__file__).resolve().parents[1]; sys.path.insert(0,str(ROOT/"src")); sys.path.insert(0,str(ROOT/"tools"))
from nifty_stratlab.entry_only_three import DETECTORS
import run_oiis_cash_daily_replay as shared

CONFIG=ROOT/"config/oiis/formulas/oiis_cash_daily_research_v1.json"
PROFILES={"low_low":(60,65,70),"low_medium":(60,76,84),"low_high":(60,84,90),"medium_low":(74,65,70),"medium_medium":(74,76,84),"medium_high":(74,84,90),"high_low":(82,65,70),"high_medium":(82,76,84),"high_high":(82,84,90)}

def load_minute(path: Path) -> pd.DataFrame:
    df=pd.read_csv(path,usecols=["date","open","high","low","close","volume"]); df["date"]=pd.to_datetime(df["date"],errors="coerce");
    for c in ("open","high","low","close","volume"): df[c]=pd.to_numeric(df[c],errors="coerce")
    return df.dropna(subset=["date","open","high","low","close"]).sort_values("date")

def aggregate(path: Path, symbol: str) -> tuple[pd.DataFrame,pd.DataFrame]:
    minute=load_minute(path); minute["session"]=minute.date.dt.date
    daily=minute.groupby("session",sort=True).agg(open=("open","first"),high=("high","max"),low=("low","min"),close=("close","last"),volume=("volume","sum")).reset_index().rename(columns={"session":"trade_date"}); daily["symbol"]=symbol; daily["sector"]="UNKNOWN"; daily["trade_date"]=pd.to_datetime(daily.trade_date)
    return daily,minute

def run_one(path: Path, strategy: str, profile: str, start: date, end: date, out_root: Path) -> dict:
    symbol=path.name.removesuffix("_minute.csv").removesuffix("_minute_new.csv").upper()
    daily,minute=aggregate(path,symbol); daily=daily[(daily.trade_date.dt.date>=start)&(daily.trade_date.dt.date<=end)].copy()
    signals={x["trade_date"]:x for x in DETECTORS[strategy](daily)}; decisions=[]
    for row in daily.itertuples(index=False):
        d=row.trade_date.date(); ev=signals.get(d); payload={"symbol":symbol,"sector":"UNKNOWN","trade_date":d,"data_quality_score":100.0,"data_permission":"FULL","ofactor_long":None,"ofactor_short":None,"directional_edge":None,"selected_direction":"LONG","setup_id":strategy if ev else None,"setup_state":"TRIGGERED" if ev else "FORMING","xfactor_score":None,"decision_code":"ENTERABLE_TIER_A" if ev else "NO_ENTRY_SIGNAL","hard_gates":[] if ev else ["ENTRY_RULE_NOT_SATISFIED"],"evidence":ev["evidence"] if ev else {"strategy":strategy,"condition_pass":False},"vix_regime":None}
        payload["decision_hash"]=hashlib.sha256(json.dumps(payload,sort_keys=True,default=str).encode()).hexdigest(); decisions.append(payload)
    # Shared simulator expects the minute filename to be <SYMBOL>.csv. Use a
    # temporary symlink created by the caller, so source data is never copied.
    prices=daily.rename(columns={"open":"open_price","high":"high_price","low":"low_price","close":"close_price"}); prices["prev_close"]=prices.close_price.shift(1); prices["deliverable_pct"]=None; prices["turnover_lacs"]=prices.close_price*prices.volume/100000
    run_id=str(uuid.uuid4()); shared.STRATEGY_ID=strategy; shared.FORMULA_VERSION=f"{strategy}|{profile}"; config=json.loads(CONFIG.read_text()); trades=shared.simulate_trades(decisions,prices,config,Path(path.parent)/".three_entry_minute_links",end,run_id); missing=list(getattr(shared.simulate_trades,"missing_minute_symbols",[])); buckets=shared.performance(decisions,trades); h30=shared.rank_h30([t["h30_observation"] for t in trades]); closed=[t for t in trades if t["status"]=="CLOSED"]
    summary={"run_id":run_id,"strategy_version_id":strategy,"evaluation_profile":profile,"ofactor_xfactor_thresholds":dict(zip(("ofactor_min","xfactor_b","xfactor_a"),PROFILES[profile])),"symbol_count":1,"decision_count":len(decisions),"signal_count":len(signals),"trade_count":len(trades),"after_tax_net_pnl":round(sum(t["after_tax_net_pnl"] for t in closed),4),"shared_exit_policy_id":"COMMON-TARGET-ONLY-0.3-1.0-V1","evaluation_policy_id":"FULL-PATH-LADDER-EVAL-I030-I050-I070-S100-S200-S500-A050-A100-A200-A500-A1000-A_GT1000-V2","h30_policy_id":"FULL-PATH-LADDER-PLUS-H30T-MAX-CLOSE-OPPORTUNITY-V3","h30_diagnostic_score":h30["diagnostic_score"],"h30_ranking_status":h30["status"],"entry_only":True,"strategy_exit_override":False,"missing_minute_symbols":missing}
    out=out_root/strategy/profile/run_id; shared.write_outputs(out,run_id,decisions,trades,buckets,summary,missing,h30); return {**summary,"output_dir":str(out)}

def main():
    p=argparse.ArgumentParser(); p.add_argument("--data-dir",type=Path,required=True); p.add_argument("--strategy",choices=[*DETECTORS]); p.add_argument("--profile",choices=list(PROFILES)); p.add_argument("--symbol"); p.add_argument("--workers",type=int,default=4); p.add_argument("--start",type=date.fromisoformat,default=date(2015,1,1)); p.add_argument("--end",type=date.fromisoformat,default=date(2026,8,5)); p.add_argument("--output-root",type=Path,default=ROOT/"outputs"/"three_entry_minute_v1"); a=p.parse_args();
    files=sorted(a.data_dir.glob("*_minute.csv"));
    if a.symbol: files=[f for f in files if f.name.removesuffix("_minute.csv").upper()==a.symbol.upper()]
    if not files: raise SystemExit("No minute CSV matched")
    # Link each selected source under the shared simulator's expected name.
    linkdir=a.data_dir/".three_entry_minute_links"; linkdir.mkdir(exist_ok=True)
    for f in files:
        target=linkdir/(f.name.removesuffix("_minute.csv")+".csv");
        if not target.exists(): target.symlink_to(f)
    strategies=[a.strategy] if a.strategy else list(DETECTORS); profiles=[a.profile] if a.profile else list(PROFILES); jobs=[(f,s,profile) for s in strategies for profile in profiles for f in files]; results=[]
    with ProcessPoolExecutor(max_workers=max(1,a.workers)) as pool:
        futures=[pool.submit(run_one,f,s,profile,a.start,a.end,a.output_root) for f,s,profile in jobs]
        for future in as_completed(futures): results.append(future.result())
    print(json.dumps(results,indent=2,default=str))
if __name__=="__main__": main()
