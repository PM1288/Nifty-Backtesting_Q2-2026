#!/usr/bin/env python3
"""Replay supplied entry-only strategies under the shared ROE exit/ladder/H30 contract."""
from __future__ import annotations
import argparse, hashlib, json, os, sys, uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from pathlib import Path
import pandas as pd
import psycopg
from psycopg.rows import dict_row

ROOT=Path(__file__).resolve().parents[1]; sys.path.insert(0,str(ROOT/"src")); sys.path.insert(0,str(ROOT/"tools"))
from nifty_stratlab.entry_only_three import DETECTORS
from nifty_stratlab.evaluation.horizon_ranking import rank_h30
import run_oiis_cash_daily_replay as shared

CONFIG=ROOT/"config/oiis/formulas/oiis_cash_daily_research_v1.json"
MINUTE=Path("/home/novius2/data/nifty-50-minute-data/aaditya555/NIFTY50")

def one(item, strategy, start, end):
    symbol, rows=item; detector=DETECTORS[strategy]; emitted={r["trade_date"]:r for r in detector(rows)}; out=[]
    for row in rows.itertuples(index=False):
        d=pd.Timestamp(row.trade_date).date()
        if d<start or d>end: continue
        signal=emitted.get(d); evidence=signal["evidence"] if signal else {"strategy":strategy,"condition_pass":False}
        payload={"symbol":symbol,"sector":row.sector,"trade_date":d,"data_quality_score":100.0,"data_permission":"FULL","ofactor_long":None,"ofactor_short":None,"directional_edge":None,"selected_direction":"LONG","setup_id":strategy if signal else None,"setup_state":"TRIGGERED" if signal else "FORMING","xfactor_score":None,"decision_code":"ENTERABLE_TIER_A" if signal else "NO_ENTRY_SIGNAL","hard_gates":[] if signal else ["ENTRY_RULE_NOT_SATISFIED"],"evidence":evidence,"stock_primary_trend":getattr(row,"stock_trend",None),"stock_market_zone":getattr(row,"stock_zone",None),"nifty_primary_trend":getattr(row,"nifty_trend",None),"nifty_market_zone":getattr(row,"nifty_zone",None),"bank_nifty_primary_trend":getattr(row,"bank_nifty_trend",None),"bank_nifty_market_zone":getattr(row,"bank_nifty_zone",None),"vix_regime":getattr(row,"vix_regime",None)}
        payload["decision_hash"]=hashlib.sha256(json.dumps(payload,sort_keys=True,default=str).encode()).hexdigest(); out.append(payload)
    return out

def main():
    p=argparse.ArgumentParser(); p.add_argument("--database-url",default=os.environ.get("DATABASE_URL")); p.add_argument("--strategy",choices=[*DETECTORS,"all"],default="all"); p.add_argument("--start",type=date.fromisoformat,default=date(2016,1,1)); p.add_argument("--end",type=date.fromisoformat,default=date(2026,8,5)); p.add_argument("--symbol"); p.add_argument("--workers",type=int,default=4); p.add_argument("--minute-csv-dir",type=Path,default=MINUTE); p.add_argument("--output-root",type=Path,default=ROOT/"outputs"/"three_entry_only_v1"); a=p.parse_args()
    if not a.database_url: raise SystemExit("DATABASE_URL required")
    config=json.loads(CONFIG.read_text()); strategies=list(DETECTORS) if a.strategy=="all" else [a.strategy]
    with psycopg.connect(a.database_url,row_factory=dict_row) as conn:
        prices,regimes=shared.load_source(conn,a.start,a.end,a.symbol.upper() if a.symbol else None); features=shared.derive_features(prices,regimes); groups=list(features.groupby("symbol",sort=True))
    for strategy in strategies:
        run_id=str(uuid.uuid4()); shared.STRATEGY_ID=strategy; shared.FORMULA_VERSION=strategy
        with ThreadPoolExecutor(max_workers=max(1,min(a.workers,len(groups)))) as pool: nested=list(pool.map(lambda g:one(g,strategy,a.start,a.end),groups))
        decisions=[r for part in nested for r in part]; trades=shared.simulate_trades(decisions,features,config,a.minute_csv_dir,a.end,run_id); missing=list(getattr(shared.simulate_trades,"missing_minute_symbols",[])); buckets=shared.performance(decisions,trades); h30=rank_h30([t["h30_observation"] for t in trades]); closed=[t for t in trades if t["status"]=="CLOSED"]
        summary={"run_id":run_id,"strategy_version_id":strategy,"requested_start":str(a.start),"requested_end":str(a.end),"symbol_count":len(groups),"decision_count":len(decisions),"signal_count":sum(d["decision_code"]=="ENTERABLE_TIER_A" for d in decisions),"trade_count":len(trades),"after_tax_net_pnl":round(sum(t["after_tax_net_pnl"] for t in closed),4),"shared_exit_policy_id":"COMMON-TARGET-ONLY-0.3-1.0-V1","evaluation_policy_id":"FULL-PATH-LADDER-EVAL-I030-I050-I070-S100-S200-S500-A050-A100-A200-A500-A1000-A_GT1000-V2","h30_policy_id":"FULL-PATH-LADDER-PLUS-H30T-MAX-CLOSE-OPPORTUNITY-V3","h30_diagnostic_score":h30["diagnostic_score"],"h30_ranking_status":h30["status"],"missing_minute_symbols":missing,"entry_only":True,"strategy_exit_override":False}
        out=a.output_root/strategy/run_id; shared.write_outputs(out,run_id,decisions,trades,buckets,summary,missing,h30); print(json.dumps({**summary,"output_dir":str(out)},default=str))
if __name__=="__main__": main()
