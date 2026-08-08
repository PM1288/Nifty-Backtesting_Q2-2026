#!/usr/bin/env python3
"""Ingest Crude Oil, Gold, USD-INR, Dow Jones and India VIX daily regimes."""
from __future__ import annotations
import argparse, hashlib, os
from datetime import date,timedelta
from pathlib import Path
import pandas as pd, yfinance as yf, psycopg
ROOT=Path(__file__).resolve().parents[3]; DDL=ROOT/'db/sql/027_global_market_daily_regime.sql'
INSTRUMENTS={'CRUDE_OIL':'CL=F','GOLD':'GC=F','USD_INR':'USDINR=X','DOW_JONES':'^DJI','INDIA_VIX':'^INDIAVIX'}
def calc(x):
 x=x.copy(); x['return_1d_pct']=x.close.pct_change()*100; x['return_5d_pct']=x.close.pct_change(5)*100; x['return_21d_pct']=x.close.pct_change(21)*100; x['sma20']=x.close.rolling(20).mean(); x['sma50']=x.close.rolling(50).mean(); x['ema20']=x.close.ewm(span=20,adjust=False).mean(); p=x.close.shift(); tr=pd.concat([x.high-x.low,(x.high-p).abs(),(x.low-p).abs()],axis=1).max(axis=1); x['atr14']=tr.rolling(14).mean(); d=x.close.diff(); g=d.clip(lower=0).ewm(alpha=1/14,adjust=False).mean(); l=(-d.clip(upper=0)).ewm(alpha=1/14,adjust=False).mean(); x['rsi14']=100-(100/(1+g/l.replace(0,pd.NA))); x['volatility20_pct']=x.close.pct_change().rolling(20).std()*(252**.5)*100; x['trend_score']=(x.close/x.sma50-1)*100; up=(x.close>x.sma50)&(x.sma20>x.sma50)&(x.return_21d_pct>=2); dn=(x.close<x.sma50)&(x.sma20<x.sma50)&(x.return_21d_pct<=-2); x['primary_trend']='SIDEWAYS'; x.loc[up,'primary_trend']='UP_TREND'; x.loc[dn,'primary_trend']='DOWN_TREND'; x['market_zone']='SIDEWAYS'; x.loc[x.volatility20_pct>=25,'market_zone']='VOLATILE'; x.loc[(x.return_21d_pct>=5)&(x.volatility20_pct<25),'market_zone']='RISING'; x.loc[(x.return_21d_pct<=-5)&(x.volatility20_pct<25),'market_zone']='FALLING'; return x
def main():
 p=argparse.ArgumentParser(); p.add_argument('--database-url',default=os.getenv('DATABASE_URL') or os.getenv('TRADING_DATABASE_URL')); p.add_argument('--start',default='2000-01-01'); p.add_argument('--end',default=(date.today()+timedelta(days=1)).isoformat()); p.add_argument('--output-dir',type=Path,default=ROOT/'platform/nifty_stratlab/outputs/global_yfinance_regime'); a=p.parse_args();
 if not a.database_url: raise SystemExit('Set DATABASE_URL or TRADING_DATABASE_URL')
 cols=['trade_date','instrument_name','yahoo_symbol','open_price','high_price','low_price','close_price','adj_close','volume','return_1d_pct','return_5d_pct','return_21d_pct','sma20','sma50','ema20','atr14','rsi14','volatility20_pct','trend_score','primary_trend','market_zone','row_hash']; rows=[]; failures=[]
 for name,ticker in INSTRUMENTS.items():
  try:
   r=yf.download(ticker,start=a.start,end=a.end,auto_adjust=False,progress=False,threads=False)
   if r.empty: raise RuntimeError('empty response')
   if isinstance(r.columns,pd.MultiIndex): r.columns=r.columns.get_level_values(0)
   r=r.rename(columns={'Open':'open','High':'high','Low':'low','Close':'close','Adj Close':'adj_close','Volume':'volume'}); r.index=pd.to_datetime(r.index).tz_localize(None).date; r=r[['open','high','low','close','adj_close','volume']].apply(pd.to_numeric,errors='coerce').dropna(subset=['close']); x=calc(r)
   for _,v in x.iterrows():
    z=[v.name,name,ticker]+[v.get(c) for c in ['open','high','low','close','adj_close','volume','return_1d_pct','return_5d_pct','return_21d_pct','sma20','sma50','ema20','atr14','rsi14','volatility20_pct','trend_score','primary_trend','market_zone']]; z.append(hashlib.sha256('|'.join(map(str,z)).encode()).hexdigest()); rows.append([None if pd.isna(q) else q for q in z])
   print(name,len(x),flush=True)
  except Exception as e: failures.append({'instrument_name':name,'yahoo_symbol':ticker,'error':str(e)}); print(name,'FAILED',e,flush=True)
 a.output_dir.mkdir(parents=True,exist_ok=True); frame=pd.DataFrame(rows,columns=cols); frame.to_csv(a.output_dir/'global_market_daily_regime.csv',index=False)
 with pd.ExcelWriter(a.output_dir/'global_market_daily_regime.xlsx',engine='xlsxwriter') as w: frame.to_excel(w,sheet_name='DAILY_REGIMES',index=False); frame.groupby(['instrument_name','primary_trend']).size().reset_index(name='rows').to_excel(w,sheet_name='TREND_COUNTS',index=False); frame.groupby(['instrument_name','market_zone']).size().reset_index(name='rows').to_excel(w,sheet_name='ZONE_COUNTS',index=False); pd.DataFrame(failures).to_excel(w,sheet_name='FAILURES',index=False)
 with psycopg.connect(a.database_url) as conn:
  conn.execute(DDL.read_text()); sql='INSERT INTO strategy_eval.global_market_daily_regime ('+','.join(cols)+') VALUES ('+','.join(['%s']*len(cols))+') ON CONFLICT (instrument_name,trade_date) DO UPDATE SET '+','.join(f'{c}=EXCLUDED.{c}' for c in cols[2:]);
  with conn.cursor() as cur: cur.executemany(sql,rows)
 print(f'rows={len(rows)} failures={len(failures)} output={a.output_dir}')
if __name__=='__main__': main()
