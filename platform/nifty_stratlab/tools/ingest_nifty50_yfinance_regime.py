#!/usr/bin/env python3
"""Download Yahoo Finance NIFTY 50 daily candles, classify regimes, persist and export Excel."""
from __future__ import annotations
import argparse, hashlib, os
from datetime import date, timedelta
from pathlib import Path
import pandas as pd
import yfinance as yf
import psycopg

DDL = Path(__file__).resolve().parents[3] / 'db/sql/025_nifty50_yfinance_daily_regime.sql'

def indicators(df: pd.DataFrame) -> pd.DataFrame:
    x = df.copy()
    x['return_1d_pct'] = x.close.pct_change(1) * 100
    x['return_5d_pct'] = x.close.pct_change(5) * 100
    x['return_21d_pct'] = x.close.pct_change(21) * 100
    x['sma20'], x['sma50'], x['ema20'] = x.close.rolling(20).mean(), x.close.rolling(50).mean(), x.close.ewm(span=20, adjust=False).mean()
    prev = x.close.shift(1)
    tr = pd.concat([x.high-x.low, (x.high-prev).abs(), (x.low-prev).abs()], axis=1).max(axis=1)
    x['atr14'] = tr.rolling(14).mean()
    delta = x.close.diff(); gain = delta.clip(lower=0).ewm(alpha=1/14, adjust=False).mean(); loss = (-delta.clip(upper=0)).ewm(alpha=1/14, adjust=False).mean()
    x['rsi14'] = 100 - (100 / (1 + gain / loss.replace(0, pd.NA)))
    x['volatility20_pct'] = x.close.pct_change().rolling(20).std() * (252 ** 0.5) * 100
    x['trend_score'] = ((x.close / x.sma50) - 1) * 100
    up = (x.close > x.sma50) & (x.sma20 > x.sma50) & (x.return_21d_pct >= 2)
    down = (x.close < x.sma50) & (x.sma20 < x.sma50) & (x.return_21d_pct <= -2)
    x['primary_trend'] = 'SIDEWAYS'; x.loc[up, 'primary_trend'] = 'UP_TREND'; x.loc[down, 'primary_trend'] = 'DOWN_TREND'
    x['market_zone'] = 'SIDEWAYS'; x.loc[x.volatility20_pct >= 25, 'market_zone'] = 'VOLATILE'; x.loc[(x.return_21d_pct >= 5) & (x.volatility20_pct < 25), 'market_zone'] = 'RISING'; x.loc[(x.return_21d_pct <= -5) & (x.volatility20_pct < 25), 'market_zone'] = 'FALLING'
    return x

def download(ticker: str, start: str, end: str) -> pd.DataFrame:
    raw = yf.download(ticker, start=start, end=end, auto_adjust=False, progress=False, threads=False)
    if raw.empty: raise RuntimeError(f'No data returned for {ticker}')
    if isinstance(raw.columns, pd.MultiIndex): raw.columns = raw.columns.get_level_values(0)
    raw = raw.rename(columns={'Open':'open','High':'high','Low':'low','Close':'close','Adj Close':'adj_close','Volume':'volume'})
    raw.index = pd.to_datetime(raw.index).tz_localize(None).date
    return raw[['open','high','low','close','adj_close','volume']].apply(pd.to_numeric, errors='coerce').dropna(subset=['close'])

def main() -> None:
    p = argparse.ArgumentParser(); p.add_argument('--database-url', default=os.getenv('DATABASE_URL') or os.getenv('TRADING_DATABASE_URL')); p.add_argument('--ticker', default='^NSEI'); p.add_argument('--start', default='2000-01-01'); p.add_argument('--end', default=(date.today()+timedelta(days=1)).isoformat()); p.add_argument('--output-dir', type=Path, default=Path(__file__).resolve().parents[1]/'outputs/nifty50_yfinance_regime'); args = p.parse_args()
    if not args.database_url: raise SystemExit('Set DATABASE_URL or TRADING_DATABASE_URL')
    out = indicators(download(args.ticker, args.start, args.end)); out.index.name = 'trade_date'; args.output_dir.mkdir(parents=True, exist_ok=True)
    csv_path = args.output_dir / 'nifty50_daily_regime.csv'; xlsx_path = args.output_dir / 'nifty50_daily_regime.xlsx'
    export = out.reset_index(); export.to_csv(csv_path, index=False)
    with pd.ExcelWriter(xlsx_path, engine='openpyxl') as w:
        pd.DataFrame({'item':['Source','Ticker','Trend rule','Zone rule','Database table'],'value':['Yahoo Finance via yfinance',args.ticker,'UP: close>SMA50, SMA20>SMA50, 21d return >=2%; DOWN analogous <=-2%; else SIDEWAYS','VOLATILE: annualized 20d volatility >=25%; otherwise RISING/FALLING at +/-5% 21d return; else SIDEWAYS','strategy_eval.nifty50_daily_regime']}).to_excel(w, sheet_name='README', index=False)
        export.to_excel(w, sheet_name='DAILY_REGIME', index=False); export.assign(month=export.trade_date.astype(str).str[:7]).groupby('month').agg(rows=('trade_date','size'),avg_return_21d_pct=('return_21d_pct','mean')).reset_index().to_excel(w, sheet_name='MONTHLY_SUMMARY', index=False)
        export.primary_trend.value_counts().rename_axis('primary_trend').reset_index(name='rows').to_excel(w, sheet_name='TREND_COUNTS', index=False)
    insert_cols=['trade_date','symbol','source_symbol','open_price','high_price','low_price','close_price','adj_close','volume','return_1d_pct','return_5d_pct','return_21d_pct','sma20','sma50','ema20','atr14','rsi14','volatility20_pct','trend_score','primary_trend','market_zone','row_hash']
    with psycopg.connect(args.database_url) as conn:
        conn.execute(DDL.read_text());
        rows=[]
        for _, r in out.iterrows():
            vals=[r.get(c.replace('_price','')) if c in ['open_price','high_price','low_price','close_price','adj_close','volume'] else r.get(c) for c in insert_cols]
            vals[0]=r.name; vals[1]='NIFTY 50'; vals[2]=args.ticker; vals[21]=hashlib.sha256('|'.join(map(str, vals[:21])).encode()).hexdigest()
            vals=[None if pd.isna(v) else v for v in vals]
            rows.append(vals)
        sql='INSERT INTO strategy_eval.nifty50_daily_regime ('+','.join(insert_cols)+') VALUES ('+','.join(['%s']*len(insert_cols))+') ON CONFLICT (trade_date) DO UPDATE SET '+','.join(f'{c}=EXCLUDED.{c}' for c in insert_cols[1:])
        with conn.cursor() as cur: cur.executemany(sql, rows)
    print(f'rows={len(out)} csv={csv_path} excel={xlsx_path}')

if __name__ == '__main__': main()
