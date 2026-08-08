#!/usr/bin/env python3
"""Run governed OIIS component DOE trials with point-in-time multi-market regime context."""
from __future__ import annotations
import argparse, hashlib, json, os, sys, uuid, zipfile
from datetime import date,timedelta
from pathlib import Path
from typing import Any
import numpy as np, pandas as pd, psycopg
from psycopg.rows import dict_row

PROJECT=Path(__file__).resolve().parents[1]; ROOT=PROJECT.parents[1]; sys.path.insert(0,str(PROJECT/'src')); sys.path.insert(0,str(PROJECT/'tools'))
import run_oiis_cash_daily_replay as shared

DELIVERY=ROOT/'OIIS-DOE/OIIS_FACTOR_DOE_COMPLETE_DELIVERY_V1.0'
MATRIX=DELIVERY/'OIIS_DOE_Run_Matrix.csv'; EXPERIMENT=DELIVERY/'OIIS_DOE_Experiment_Config.json'; SCHEMA=ROOT/'db/sql/029_oiis_component_doe.sql'
DELIVERY_ZIP=ROOT/'OIIS-DOE/OIIS_FACTOR_DOE_COMPLETE_DELIVERY_V1.0.zip'
O_MAP={'MRS':'market_regime_support','SRS':'sector_industry_support','TQS':'trend_quality','RSS':'relative_strength','MFS':'money_flow_participation','MQS':'momentum_quality','ICS':'institutional_confirmation','LTS':'liquidity_tradability','CCS':'catalyst_context'}
X_MAP={'SIS':'setup_integrity','ELQ':'entry_location_quality','TCS':'trigger_confirmation','SIQ':'stop_invalidation_quality','RRQ':'reward_path_quality','MSS':'market_sector_synchronisation','LSQ':'liquidity_slippage_quality','TSQ':'timing_session_quality','IOQ':'instrument_quality'}
def js(v): return json.loads(v) if isinstance(v,str) and v.strip() else {}
def digest(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def ensure_delivery():
 if MATRIX.exists() and EXPERIMENT.exists():return
 if not DELIVERY_ZIP.exists():raise FileNotFoundError(f'Missing DOE delivery ZIP: {DELIVERY_ZIP}')
 with zipfile.ZipFile(DELIVERY_ZIP) as archive:
  root=DELIVERY_ZIP.parent.resolve()
  if any(root not in (root/member).resolve().parents and (root/member).resolve()!=root for member in archive.namelist()): raise RuntimeError('Unsafe path in DOE delivery ZIP')
  archive.extractall(root)
def map_weights(raw,mapping): return {mapping[k]:float(v) for k,v in raw.items()}
def number(v): return None if v is None or pd.isna(v) else float(v)
def excel_safe(df):
 x=df.copy()
 for c in x.columns:
  if isinstance(x[c].dtype,pd.DatetimeTZDtype): x[c]=x[c].dt.tz_localize(None)
  elif x[c].dtype=='object': x[c]=x[c].map(lambda v:v.tz_localize(None) if isinstance(v,pd.Timestamp) and v.tzinfo is not None else v)
 return x
def load_context(conn,start,end,symbol=None):
 with conn.cursor() as cur:
  stock_sql="""SELECT trade_date,UPPER(REGEXP_REPLACE(yahoo_symbol,'\\.NS$','')) symbol,primary_trend stock_yf_trend,market_zone stock_yf_zone,return_21d_pct stock_yf_return_21d_pct,rsi14 stock_yf_rsi14,volatility20_pct stock_yf_volatility20_pct,trend_score stock_yf_trend_score,100*(close_price/sma20-1) stock_yf_vs_sma20_pct,100*(close_price/sma50-1) stock_yf_vs_sma50_pct FROM strategy_eval.stock_daily_regime WHERE trade_date BETWEEN %s AND %s"""
  params=(start,end)
  if symbol:
   stock_sql += " AND UPPER(REGEXP_REPLACE(yahoo_symbol,'\\.NS$',''))=%s"; params=(start,end,symbol)
  stock=shared.frame(cur,stock_sql,params)
  nifty=shared.frame(cur,"""SELECT trade_date,primary_trend nifty_yf_trend,market_zone nifty_yf_zone,return_21d_pct nifty_yf_return_21d_pct,rsi14 nifty_yf_rsi14,volatility20_pct nifty_yf_volatility20_pct,trend_score nifty_yf_trend_score,100*(close_price/sma20-1) nifty_yf_vs_sma20_pct,100*(close_price/sma50-1) nifty_yf_vs_sma50_pct FROM strategy_eval.nifty50_daily_regime WHERE trade_date BETWEEN %s AND %s""",(start,end))
  glob=shared.frame(cur,"""SELECT trade_date,instrument_name,primary_trend,market_zone,return_21d_pct,rsi14,volatility20_pct,trend_score,100*(close_price/sma20-1) vs_sma20_pct,100*(close_price/sma50-1) vs_sma50_pct FROM strategy_eval.global_market_daily_regime WHERE trade_date BETWEEN %s AND %s""",(start,end))
 return stock,nifty,glob
def attach_context(df,stock,nifty,glob):
 if df.empty:return df
 x=df.copy(); x['trade_date']=pd.to_datetime(x.trade_date)
 for f in [stock,nifty]:
  if len(f):
   f=f.copy(); f['trade_date']=pd.to_datetime(f.trade_date); keys=['trade_date']+(['symbol'] if 'symbol' in f and 'symbol' in x else []); x=x.merge(f,on=keys,how='left')
 if len(glob):
  g=glob.copy(); g['trade_date']=pd.to_datetime(g.trade_date)
  for instrument,part in g.groupby('instrument_name'):
   prefix=instrument.lower(); cols={c:f'{prefix}_{c}' for c in part.columns if c not in ['trade_date','instrument_name']}; x=x.merge(part.drop(columns='instrument_name').rename(columns=cols),on='trade_date',how='left')
 return x
def select_trials(matrix,ids,max_trials,all_trials=False):
 if ids: return matrix[matrix.run_id.isin(ids)].copy()
 if all_trials: return matrix.copy()
 baseline=matrix[matrix.run_id=='S0_BASELINE_FULL']; oa=matrix[matrix.run_id.str.startswith('S1O_ABLATE_')].head(1); xa=matrix[matrix.run_id.str.startswith('S1X_ABLATE_')].head(1); chosen=pd.concat([baseline,oa,xa])
 return chosen if max_trials==0 else chosen.head(max_trials)
def treatment(row):
 f=js(row.factor_settings_json); return f.get('ablation_factor') or f.get('factor_id') or 'BASELINE'
def experiment_options(row):
 t=js(row.thresholds_json); w=js(row.weights_json); gates=js(row.gates_json); disabled=[name for name,enabled in gates.items() if not enabled]
 return {'ofactor_min':float(t.get('ofactor_min',74)),'xfactor_b':float(t.get('xfactor_tier_b',76)),'xfactor_a':float(t.get('xfactor_tier_a',84)),'ofactor_weights':map_weights(w['ofactor'],O_MAP),'xfactor_weights':map_weights(w['xfactor'],X_MAP),'disabled_gates':disabled}
def flatten_decisions(trial_id,decisions):
 rows=[]
 for d in decisions:
  e=d['evidence']; base={k:d.get(k) for k in ['symbol','sector','trade_date','decision_hash','decision_code','selected_direction','setup_id','setup_state','data_quality_score','ofactor_long','ofactor_short','directional_edge','xfactor_score','stock_primary_trend','stock_market_zone','nifty_primary_trend','nifty_market_zone','vix_regime']}; base['trial_id']=trial_id
  for direction,key in [('LONG','ofactor_long'),('SHORT','ofactor_short')]:
   layer=e[key]
   for name,score in layer['components'].items(): rows.append({**base,'direction':direction,'factor_layer':'OFACTOR','component_name':name,'component_score':score,'component_weight':layer['weights'][name],'weighted_contribution':layer['weighted_contributions'][name]})
  layer=e['xfactor']
  for name,score in layer['components'].items(): rows.append({**base,'direction':e['direction'],'factor_layer':'XFACTOR','component_name':name,'component_score':score,'component_weight':layer['weights'][name],'weighted_contribution':layer['weighted_contributions'][name]})
 return rows
def target_rows(trial_id,trades,kind):
 key='target_events' if kind=='TARGET' else 'adverse_events'; return [{'trial_id':trial_id,'symbol':t['symbol'],'entry_path_id':t['entry_path_id'],**e} for t in trades for e in t[key]]
def trial_summary(row,decisions,trades):
 closed=[t for t in trades if t['status']=='CLOSED']; open_=[t for t in trades if t['status']!='CLOSED']; target=lambda level:sum(any(e['level_id']==level and e['hit_flag'] for e in t['target_events']) for t in trades); clean=sum(any(e.get('sequence')=='TARGET_FIRST' and e['hit_flag'] for e in t['target_events']) for t in trades)
 return {'trial_id':row.run_id,'phase':row.phase,'trial_kind':row.trial_kind,'treatment_factor':treatment(row),'decision_count':len(decisions),'ofactor_qualified_count':sum(max(d['ofactor_long'],d['ofactor_short'])>=js(row.thresholds_json).get('ofactor_min',74) for d in decisions),'enterable_count':sum(d['decision_code'] in ['ENTERABLE_TIER_A','ENTERABLE_TIER_B'] for d in decisions),'trade_count':len(trades),'closed_count':len(closed),'open_count':len(open_),'total_net_liquidation_pnl':sum(t['after_tax_net_pnl'] for t in closed)+sum(t['unrealized_net_liquidation_pnl'] for t in open_),'median_mfe_pct':np.median([t['mfe_pct'] for t in trades]) if trades else None,'median_mae_pct':np.median([t['mae_pct'] for t in trades]) if trades else None,'i030_rate_pct':100*target('I030')/len(trades) if trades else None,'d5_1pct_rate_pct':100*target('S100')/len(trades) if trades else None,'d5_2pct_rate_pct':100*target('S200')/len(trades) if trades else None,'d5_5pct_rate_pct':100*target('S500')/len(trades) if trades else None,'clean_target_rate_pct':100*clean/len(trades) if trades else None}
def main():
 p=argparse.ArgumentParser(); p.add_argument('--database-url',default=os.getenv('DATABASE_URL') or os.getenv('TRADING_DATABASE_URL')); p.add_argument('--symbol',default='RELIANCE'); p.add_argument('--all-stocks',action='store_true'); p.add_argument('--all-trials',action='store_true'); p.add_argument('--start',type=date.fromisoformat,default=date(2024,1,1)); p.add_argument('--end',type=date.fromisoformat,default=date(2025,12,31)); p.add_argument('--trial-id',action='append'); p.add_argument('--max-trials',type=int,default=3); p.add_argument('--minute-csv-dir',type=Path,default=shared.DEFAULT_MINUTE_CSV_DIR); p.add_argument('--output-root',type=Path,default=PROJECT/'outputs/oiis_component_doe_v1'); a=p.parse_args()
 if not a.database_url: raise SystemExit('DATABASE_URL required')
 ensure_delivery()
 matrix=pd.read_csv(MATRIX); selected=select_trials(matrix,a.trial_id,a.max_trials,a.all_trials)
 if selected.empty:raise SystemExit('No DOE trials selected')
 run_id=str(uuid.uuid4()); out=a.output_root/run_id; out.mkdir(parents=True); experiment=json.loads(EXPERIMENT.read_text()); streaming=bool(a.all_stocks or a.all_trials); all_components=[]; all_trades=[]; all_targets=[]; all_adverse=[]; summaries=[]
 with psycopg.connect(a.database_url,row_factory=dict_row) as conn:
  prices,regimes=shared.load_source(conn,a.start,a.end,None if a.all_stocks else a.symbol,a.all_stocks); features=shared.derive_features(prices,regimes); stock,nifty,glob=load_context(conn,a.start-timedelta(days=7),a.end,None if a.all_stocks else a.symbol)
  groups=list(features.groupby('symbol',sort=True))
  for row in selected.itertuples(index=False):
   opts=experiment_options(row); decisions=[d for item in groups for d in shared.evaluate_symbol(item,a.start,a.end,opts)]; trial_run=f'{run_id}:{row.run_id}'; trades=shared.simulate_trades(decisions,features,json.loads(shared.DEFAULT_CONFIG.read_text()),a.minute_csv_dir,a.end,trial_run)
   components=attach_context(pd.DataFrame(flatten_decisions(row.run_id,decisions)),stock,nifty,glob); trade_frame=pd.DataFrame([{k:v for k,v in t.items() if k not in ['target_events','adverse_events','path_checkpoints','invariant_checks','policy','h30_observation']}|{'trial_id':row.run_id} for t in trades]); trade_frame=attach_context(trade_frame.rename(columns={'signal_date':'trade_date'}),stock,nifty,glob).rename(columns={'trade_date':'signal_date'})
   if streaming:
    def append_df(frame,name):
     path=out/name; frame.to_csv(path,mode='a',header=not path.exists(),index=False)
    append_df(components,'component_event_scores.csv'); append_df(trade_frame,'trades.csv')
    append_df(pd.DataFrame(target_rows(row.run_id,trades,'TARGET')),'target_events.csv'); append_df(pd.DataFrame(target_rows(row.run_id,trades,'ADVERSE')),'adverse_events.csv')
    append_df(pd.DataFrame(flatten_decisions(row.run_id,decisions)),'decision_component_events.csv')
   else:
    all_components.append(components); all_trades.append(trade_frame); all_targets.extend(target_rows(row.run_id,trades,'TARGET')); all_adverse.extend(target_rows(row.run_id,trades,'ADVERSE'))
   summaries.append(trial_summary(row,decisions,trades)); print(row.run_id,'decisions',len(decisions),'trades',len(trades),flush=True)
  if streaming:
   comp=pd.read_csv(out/'component_event_scores.csv') if (out/'component_event_scores.csv').exists() else pd.DataFrame(); trades=pd.read_csv(out/'trades.csv') if (out/'trades.csv').exists() else pd.DataFrame(); all_targets=[]; all_adverse=[]
  else:
   comp=pd.concat(all_components,ignore_index=True) if all_components else pd.DataFrame(); trades=pd.concat(all_trades,ignore_index=True) if all_trades else pd.DataFrame()
  summary=pd.DataFrame(summaries); baseline=summary.iloc[0]; effects=summary.copy()
  for c in ['ofactor_qualified_count','enterable_count','trade_count','total_net_liquidation_pnl','median_mfe_pct','median_mae_pct','clean_target_rate_pct']:
   base_value=pd.to_numeric(pd.Series([baseline[c]]),errors='coerce').iloc[0]; effects[f'delta_{c}_vs_baseline']=pd.to_numeric(effects[c],errors='coerce')-base_value
  regime_cols=[c for c in ['trial_id','stock_yf_trend','nifty_yf_trend','india_vix_primary_trend','dow_jones_primary_trend','gold_primary_trend','crude_oil_primary_trend','usd_inr_primary_trend'] if c in trades]; regime_perf=trades.groupby(regime_cols,dropna=False).agg(trades=('entry_path_id','size'),median_mfe_pct=('mfe_pct','median'),median_mae_pct=('mae_pct','median'),net_pnl=('after_tax_net_pnl','sum')).reset_index() if len(regime_cols)>1 and len(trades) else pd.DataFrame()
  if not streaming:
   comp.to_csv(out/'component_event_scores.csv',index=False); trades.to_csv(out/'trades.csv',index=False); pd.DataFrame(all_targets).to_csv(out/'target_events.csv',index=False); pd.DataFrame(all_adverse).to_csv(out/'adverse_events.csv',index=False)
  summary.to_csv(out/'trial_summary.csv',index=False); effects.to_csv(out/'factor_effects_vs_baseline.csv',index=False); regime_perf.to_csv(out/'regime_performance.csv',index=False)
  with pd.ExcelWriter(out/'OIIS_Component_DOE_Evaluation.xlsx',engine='xlsxwriter') as w:
   pd.DataFrame({'item':['Experiment','Run ID','Symbol','Period','Exit interpretation','Regime context'],'value':[experiment['experiment_id'],run_id,a.symbol,f'{a.start} to {a.end}','OIIS is ENTRY_ONLY; common intraday/swing exit is a shared RoE scenario, not an OIIS-owned exit','Point-in-time Stock, NIFTY, India VIX, Dow, Gold, Crude Oil and USD/INR']}).to_excel(w,sheet_name='00 Executive',index=False); excel_safe(summary).to_excel(w,sheet_name='01 Trial Summary',index=False); excel_safe(effects).to_excel(w,sheet_name='02 Factor Effects',index=False); excel_safe(comp).to_excel(w,sheet_name='03 Component Events',index=False); excel_safe(trades).to_excel(w,sheet_name='04 Trade Detail',index=False); excel_safe(regime_perf).to_excel(w,sheet_name='05 Regime Performance',index=False); excel_safe(pd.DataFrame(all_targets)).to_excel(w,sheet_name='06 Reward Ladder',index=False); excel_safe(pd.DataFrame(all_adverse)).to_excel(w,sheet_name='07 Adverse Ladder',index=False); excel_safe(selected).to_excel(w,sheet_name='08 Trial Definitions',index=False)
  conn.execute(SCHEMA.read_text()); conn.execute('INSERT INTO strategy_eval.oiis_doe_run VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb,now())',(run_id,experiment['experiment_id'],a.symbol if not a.all_stocks else 'ALL_STOCKS',a.start,a.end,len(summary),len(comp),len(trades),'SUCCEEDED',str(out.resolve()),json.dumps({'matrix_sha256':digest(MATRIX),'experiment_sha256':digest(EXPERIMENT),'all_stocks':a.all_stocks,'all_trials':a.all_trials})))
  with conn.cursor() as cur:
   cur.executemany('INSERT INTO strategy_eval.oiis_doe_trial (doe_run_id,trial_id,phase,trial_kind,treatment_factor,decision_count,ofactor_qualified_count,enterable_count,trade_count,total_net_liquidation_pnl,median_mfe_pct,median_mae_pct,clean_target_rate_pct,config_json) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb)',[(run_id,r.trial_id,r.phase,r.trial_kind,r.treatment_factor,r.decision_count,r.ofactor_qualified_count,r.enterable_count,r.trade_count,number(r.total_net_liquidation_pnl),number(r.median_mfe_pct),number(r.median_mae_pct),number(r.clean_target_rate_pct),json.dumps(experiment_options(selected[selected.run_id==r.trial_id].iloc[0]))) for r in summary.itertuples()])
   component_rows=[] if not streaming else None
   for r in comp.itertuples(): component_rows.append((run_id,r.trial_id,r.symbol,pd.Timestamp(r.trade_date).date(),r.direction,r.factor_layer,r.component_name,number(r.component_score),number(r.component_weight),number(r.weighted_contribution),number(r.ofactor_long),number(r.xfactor_score),r.decision_code,getattr(r,'stock_yf_trend',None),getattr(r,'nifty_yf_trend',None)))
   if component_rows: cur.executemany('INSERT INTO strategy_eval.oiis_doe_component_event VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)',component_rows)
  conn.commit()
 (out/'README.md').write_text(f'# OIIS component DOE\n\nRun `{run_id}` evaluated {len(summary)} governed trials for `{a.symbol if not a.all_stocks else "ALL_STOCKS"}`. All event files are consolidated per run. Regimes and indicators are point-in-time PostgreSQL joins. OIIS remains entry-only; shared exit outcomes are evaluation scenarios.\n'); print(json.dumps({'doe_run_id':run_id,'trials':len(summary),'component_events':len(comp),'trades':len(trades),'output':str(out)},indent=2))
if __name__=='__main__':main()
