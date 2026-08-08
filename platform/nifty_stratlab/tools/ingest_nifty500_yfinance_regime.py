#!/usr/bin/env python3
"""Ingest the NSE NIFTY 500 universe from Yahoo Finance and classify each stock daily."""
from __future__ import annotations
import argparse, hashlib, os
from datetime import date, timedelta
from pathlib import Path
import pandas as pd, yfinance as yf, psycopg

ROOT=Path(__file__).resolve().parents[3]; DDL=ROOT/'db/sql/026_nifty500_stock_daily_regime.sql'
def calc(x):
    x=x.copy(); x['return_1d_pct']=x.close.pct_change()*100; x['return_5d_pct']=x.close.pct_change(5)*100; x['return_21d_pct']=x.close.pct_change(21)*100
    x['sma20']=x.close.rolling(20).mean(); x['sma50']=x.close.rolling(50).mean(); x['ema20']=x.close.ewm(span=20,adjust=False).mean(); prev=x.close.shift(); tr=pd.concat([x.high-x.low,(x.high-prev).abs(),(x.low-prev).abs()],axis=1).max(axis=1); x['atr14']=tr.rolling(14).mean(); d=x.close.diff(); g=d.clip(lower=0).ewm(alpha=1/14,adjust=False).mean(); l=(-d.clip(upper=0)).ewm(alpha=1/14,adjust=False).mean(); x['rsi14']=100-(100/(1+g/l.replace(0,pd.NA))); x['volatility20_pct']=x.close.pct_change().rolling(20).std()*(252**.5)*100; x['trend_score']=(x.close/x.sma50-1)*100
    up=(x.close>x.sma50)&(x.sma20>x.sma50)&(x.return_21d_pct>=2); dn=(x.close<x.sma50)&(x.sma20<x.sma50)&(x.return_21d_pct<=-2); x['primary_trend']='SIDEWAYS'; x.loc[up,'primary_trend']='UP_TREND'; x.loc[dn,'primary_trend']='DOWN_TREND'; x['market_zone']='SIDEWAYS'; x.loc[x.volatility20_pct>=25,'market_zone']='VOLATILE'; x.loc[(x.return_21d_pct>=5)&(x.volatility20_pct<25),'market_zone']='RISING'; x.loc[(x.return_21d_pct<=-5)&(x.volatility20_pct<25),'market_zone']='FALLING'; return x
def main():
    p=argparse.ArgumentParser(); p.add_argument('--database-url',default=os.getenv('DATABASE_URL') or os.getenv('TRADING_DATABASE_URL')); p.add_argument('--start',default='2000-01-01'); p.add_argument('--end',default=(date.today()+timedelta(days=1)).isoformat()); p.add_argument('--limit',type=int); p.add_argument('--csv-input',type=Path); p.add_argument('--skip-excel',action='store_true'); p.add_argument('--output-dir',type=Path,default=ROOT/'platform/nifty_stratlab/outputs/nifty500_yfinance_regime'); a=p.parse_args();
    if not a.database_url: raise SystemExit('Set DATABASE_URL or TRADING_DATABASE_URL')
    if a.csv_input:
        frame=pd.read_csv(a.csv_input); records=frame.where(pd.notna(frame),None).values.tolist(); universe=frame[['stock_name','yahoo_symbol']].drop_duplicates(); failures=[]
    else:
        universe=pd.read_csv('https://archives.nseindia.com/content/indices/ind_nifty500list.csv'); universe.columns=[c.strip() for c in universe.columns]; universe['stock_name']=universe['Company Name'].astype(str).str.strip(); universe['yahoo_symbol']=universe['Symbol'].astype(str).str.strip()+'.NS'; universe=universe[['stock_name','yahoo_symbol']].drop_duplicates(); records=[]; failures=[]
    if a.limit: universe=universe.head(a.limit)
    for i,row in universe.iterrows() if not a.csv_input else []:
        try:
            raw=yf.download(row.yahoo_symbol,start=a.start,end=a.end,auto_adjust=False,progress=False,threads=False); 
            if raw.empty: raise RuntimeError('empty')
            if isinstance(raw.columns,pd.MultiIndex): raw.columns=raw.columns.get_level_values(0)
            raw=raw.rename(columns={'Open':'open','High':'high','Low':'low','Close':'close','Adj Close':'adj_close','Volume':'volume'}); raw.index=pd.to_datetime(raw.index).tz_localize(None).date; raw=raw[['open','high','low','close','adj_close','volume']].apply(pd.to_numeric,errors='coerce').dropna(subset=['close']); x=calc(raw); x.index.name='trade_date';
            for _,r in x.iterrows():
                vals=[r.name,row.stock_name,row.yahoo_symbol]+[r.get(c) for c in ['open','high','low','close','adj_close','volume','return_1d_pct','return_5d_pct','return_21d_pct','sma20','sma50','ema20','atr14','rsi14','volatility20_pct','trend_score','primary_trend','market_zone']]; vals.append(hashlib.sha256('|'.join(map(str,vals)).encode()).hexdigest()); records.append([None if pd.isna(v) else v for v in vals])
        except Exception as e: failures.append({'stock_name':row.stock_name,'yahoo_symbol':row.yahoo_symbol,'error':str(e)})
        print(f'{len(records):,} rows; {i+1}/{len(universe)} {row.stock_name}',flush=True)
    cols=['trade_date','stock_name','yahoo_symbol','open_price','high_price','low_price','close_price','adj_close','volume','return_1d_pct','return_5d_pct','return_21d_pct','sma20','sma50','ema20','atr14','rsi14','volatility20_pct','trend_score','primary_trend','market_zone','row_hash']; a.output_dir.mkdir(parents=True,exist_ok=True); frame=pd.DataFrame(records,columns=cols); frame.to_csv(a.output_dir/'stock_daily_regime.csv',index=False)
    if not a.skip_excel:
        with pd.ExcelWriter(a.output_dir/'stock_daily_regime.xlsx',engine='xlsxwriter') as writer:
            for n,start in enumerate(range(0,len(frame),900000),1): frame.iloc[start:start+900000].to_excel(writer,sheet_name=f'DAILY_{n}',index=False)
            frame.groupby('primary_trend').size().reset_index(name='rows').to_excel(writer,sheet_name='TREND_COUNTS',index=False)
    with psycopg.connect(a.database_url) as conn:
        conn.execute(DDL.read_text()); sql='INSERT INTO strategy_eval.stock_daily_regime ('+','.join(cols)+') VALUES ('+','.join(['%s']*len(cols))+') ON CONFLICT (stock_name,trade_date) DO UPDATE SET '+','.join(f'{c}=EXCLUDED.{c}' for c in cols[2:]);
        with conn.cursor() as cur: cur.executemany(sql,records)
    pd.DataFrame(failures).to_csv(a.output_dir/'failures.csv',index=False); print(f'completed stocks={len(universe)-len(failures)} rows={len(frame)} failures={len(failures)} output={a.output_dir}')
if __name__=='__main__': main()
