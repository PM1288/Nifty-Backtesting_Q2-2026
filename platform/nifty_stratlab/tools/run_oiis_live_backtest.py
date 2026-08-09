#!/usr/bin/env python3
from __future__ import annotations

import argparse, hashlib, json, os, sys, uuid
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd
import psycopg
from psycopg.rows import dict_row

ROOT=Path(__file__).resolve().parents[3]
sys.path.insert(0,str(ROOT/'services/oiis_live/src'))
from oiis_live.policy import classify_daily  # noqa: E402

MASTER=ROOT/'platform/nifty_stratlab/outputs/oiis_all_signal_capture_v1/22808cf7-c0b3-4beb-9420-6b9e2b40f7ac/OIIS_ALL_SIGNAL_MASTER.csv.gz'
MINUTE_ROOT=Path('/home/novius2/data/algo-trading-data-nifty-100-data-with-indicators')


def candidates(start:date,end:date)->pd.DataFrame:
    required=['signal_date','symbol','sector','selected_direction','ofactor_long','ofactor_short','xfactor_score','directional_edge','data_quality_score','data_permission','decision_code','setup_state','hard_gates','rsi_14','willr_14','close_price','close_vs_ema61_pct','macd_line_pct_close','atr14','volume_vs_sma20','o_long_market_regime_support','o_short_market_regime_support','x_long_stop_invalidation_quality','x_short_stop_invalidation_quality','x_long_entry_location_quality','x_short_entry_location_quality','x_long_market_sector_synchronisation','x_short_market_sector_synchronisation','nifty_primary_trend','stock_primary_trend','vix_regime']
    parts=[]
    for chunk in pd.read_csv(MASTER,usecols=required,chunksize=100_000):
        chunk.signal_date=pd.to_datetime(chunk.signal_date).dt.date
        chunk=chunk[(chunk.signal_date>=start)&(chunk.signal_date<=end)]
        if chunk.empty: continue
        rows=[]
        for row in chunk.to_dict('records'):
            result=classify_daily(row)
            if result.level=='NO_CANDIDATE' or row['selected_direction']!='LONG': continue
            row['daily_level']=result.level; row['canonical_status']=result.canonical_status
            row['qualified']=result.canonical_status=='QUALIFIED_FOR_INTRADAY_REVALIDATION'
            rows.append(row)
        if rows: parts.append(pd.DataFrame(rows))
    return pd.concat(parts,ignore_index=True) if parts else pd.DataFrame()


def minute_path(symbol:str)->Path|None:
    for value in (MINUTE_ROOT/f'{symbol}_minute.csv',MINUTE_ROOT/f'{symbol}.csv',Path('/home/novius2/data/nifty-50-minute-data/aaditya555/NIFTY50')/f'{symbol}.csv'):
        if value.is_file(): return value
    return None


def load_minutes(path:Path,start:date,end:date)->pd.DataFrame:
    values=[]
    for chunk in pd.read_csv(path,usecols=['date','open','high','low','close'],chunksize=250_000):
        text=chunk.date.astype(str); chunk=chunk[(text>=f'{start} 00:00:00')&(text<=f'{end} 23:59:59')]
        if not chunk.empty: values.append(chunk)
    if not values: return pd.DataFrame()
    frame=pd.concat(values,ignore_index=True); frame['ts']=pd.to_datetime(frame.pop('date'),errors='coerce')
    if frame.ts.dt.tz is None: frame.ts=frame.ts.dt.tz_localize('Asia/Kolkata',ambiguous='NaT',nonexistent='NaT')
    frame=frame.dropna().sort_values('ts').drop_duplicates('ts',keep='last')
    for col in ['open','high','low','close']: frame[col]=pd.to_numeric(frame[col],errors='coerce')
    minute=frame.ts.dt.hour*60+frame.ts.dt.minute
    frame=frame[(frame.ts.dt.weekday<5)&(minute>=555)&(minute<=930)&(frame.low>0)&(frame.high>=frame[['open','close']].max(axis=1))&(frame.low<=frame[['open','close']].min(axis=1))]
    delta=frame.close.diff(); gain=delta.clip(lower=0); loss=-delta.clip(upper=0)
    avg_gain=gain.rolling(14,min_periods=14).mean(); avg_loss=loss.rolling(14,min_periods=14).mean()
    frame['rsi14']=(100-100/(1+avg_gain/avg_loss.replace(0,np.nan))).where(avg_loss!=0,100)
    highest=frame.high.rolling(14,min_periods=14).max(); lowest=frame.low.rolling(14,min_periods=14).min()
    frame['willr14']=-100*(highest-frame.close)/(highest-lowest).replace(0,np.nan); frame['session']=frame.ts.dt.date
    return frame.reset_index(drop=True)


def load_db_minutes(conn: Any, symbol: str, start: date, end: date) -> pd.DataFrame:
    token=conn.execute("""SELECT symbol_token FROM public.instruments
      WHERE exchange='NSE' AND tradingsymbol IN (%s,%s)
      ORDER BY CASE WHEN tradingsymbol=%s THEN 0 ELSE 1 END LIMIT 1""",
      (symbol+'-EQ',symbol,symbol+'-EQ')).fetchone()
    if not token:return pd.DataFrame()
    lower=datetime.combine(start,time.min,tzinfo=ZoneInfo('Asia/Kolkata'))
    upper=datetime.combine(end+timedelta(days=1),time.min,tzinfo=ZoneInfo('Asia/Kolkata'))
    rows=conn.execute("""SELECT ts,open,high,low,close FROM public.bars_1m
      WHERE exchange='NSE' AND symbol_token=%s AND ts>=%s AND ts<%s ORDER BY ts""",
      (token[0],lower,upper)).fetchall()
    if not rows:return pd.DataFrame()
    frame=pd.DataFrame(rows,columns=['ts','open','high','low','close'])
    frame['ts']=pd.to_datetime(frame.ts,utc=True).dt.tz_convert('Asia/Kolkata')
    for col in ['open','high','low','close']:frame[col]=pd.to_numeric(frame[col],errors='coerce')
    minute=frame.ts.dt.hour*60+frame.ts.dt.minute
    return frame[(frame.ts.dt.weekday<5)&(minute>=555)&(minute<=930)].copy()


def add_intraday_indicators(frame: pd.DataFrame) -> pd.DataFrame:
    if frame.empty:return frame
    frame=frame.sort_values('ts').drop_duplicates('ts',keep='last').reset_index(drop=True)
    delta=frame.close.diff();gain=delta.clip(lower=0);loss=-delta.clip(upper=0)
    avg_gain=gain.rolling(14,min_periods=14).mean();avg_loss=loss.rolling(14,min_periods=14).mean()
    frame['rsi14']=(100-100/(1+avg_gain/avg_loss.replace(0,np.nan))).where(avg_loss!=0,100)
    highest=frame.high.rolling(14,min_periods=14).max();lowest=frame.low.rolling(14,min_periods=14).min()
    frame['willr14']=-100*(highest-frame.close)/(highest-lowest).replace(0,np.nan);frame['session']=frame.ts.dt.date
    return frame


def first_touch(frame:pd.DataFrame,price:float)->tuple[bool,Any,float|None]:
    if frame.empty:return False,None,None
    hits=frame[(frame.open>=price)|(frame.high>=price)]
    if hits.empty:return False,None,None
    row=hits.iloc[0]; return True,row.ts,float(row.open if row.open>=price else price)


def load_cost_profile(conn: Any | None) -> dict[str, str] | None:
    if conn is None:return None
    row=conn.execute("""SELECT cost_profile_id,version,rates FROM paper_trading.cost_profiles
      WHERE cost_profile_id='india-equity-current' AND enabled
      ORDER BY effective_from DESC,version DESC LIMIT 1""").fetchone()
    return None if not row else {"cost_profile_id":row[0],"version":str(row[1]),**row[2]}


def execution_economics(entry:float,exit_price:float|None,quantity:int,
                        profile:dict[str,str]|None)->dict[str,float|None]:
    if exit_price is None:return {'gross_pnl':None,'transaction_costs':None,'net_before_tax':None,'tax_provision':None,'after_tax_pnl':None}
    entry_value=Decimal(str(entry))*quantity;exit_value=Decimal(str(exit_price))*quantity;gross=exit_value-entry_value
    charges=Decimal('0')
    if profile:
        turnover=entry_value+exit_value;brokerage=Decimal(profile['brokerage_flat_per_order'])*2
        exchange=turnover*Decimal(profile['exchange_turnover_rate']);sebi=turnover*Decimal(profile['sebi_turnover_rate'])
        gst=(brokerage+exchange+sebi)*Decimal(profile['gst_rate'])
        charges=brokerage+exchange+sebi+gst+exit_value*Decimal(profile['stt_sell_rate'])+entry_value*Decimal(profile['stamp_buy_rate'])
    net=gross-charges;tax=max(net,Decimal('0'))*Decimal('0.35')
    return {'gross_pnl':float(gross),'transaction_costs':float(charges),'net_before_tax':float(net),'tax_provision':float(tax),'after_tax_pnl':float(net-tax)}


def optional_value(value: Any) -> Any:
    return None if pd.isna(value) else value


def persist_existing(output_dir: Path, database_url: str) -> None:
    summary=json.loads((output_dir/'OIIS_V1_HISTORICAL_SUMMARY.json').read_text())
    frame=pd.read_csv(output_dir/'OIIS_V1_TRADES.csv')
    outcome_columns=['i030_hit','i050_hit','i070_hit','s100_d5_hit','s200_d5_hit','s500_d5_hit',
      'intraday_mfe_pct','intraday_mae_pct','d5_mfe_pct','d5_mae_pct','h30_mfe_pct','h30_mae_pct',
      'd5_sessions','h30_sessions','actual_holding_minutes','actual_holding_sessions']
    with psycopg.connect(database_url) as conn:
        run_id=uuid.uuid4()
        conn.execute("INSERT INTO oiis_live.historical_run(historical_run_id,policy_id,start_date,end_date,status,candidate_count,qualified_candidate_count,triggered_trade_count,summary,artifact_path,result_hash,completed_at) VALUES (%s,%s,%s,%s,'COMPLETED',%s,%s,%s,%s::jsonb,%s,%s,now())",(run_id,summary['policy_id'],summary['start'],summary['end'],summary['daily_candidates'],summary['qualified_candidates'],summary['triggered_trades'],json.dumps(summary,allow_nan=False),str(output_dir.resolve()),summary['result_hash']))
        for raw in frame.to_dict('records'):
            row={key:optional_value(value) for key,value in raw.items()}
            outcomes={key:row.get(key) for key in outcome_columns}
            outcomes['market_context']={'nifty_regime':row.get('nifty_regime'),'stock_regime':row.get('stock_regime'),'vix_regime':row.get('vix_regime')}
            conn.execute("INSERT INTO oiis_live.historical_trade(historical_run_id,symbol,signal_date,entry_ts,entry_price,rsi14,willr14,exit_state,exit_ts,exit_price,gross_pnl,tax_provision,after_tax_pnl,outcomes) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb)",(run_id,row['symbol'],row['signal_date'],row['entry_ts'],row['entry_price'],row['entry_rsi14'],row['entry_willr14'],row['exit_state'],row['exit_ts'],row['exit_price'],row['gross_pnl'],row['tax_provision'],row['after_tax_pnl'],json.dumps(outcomes,allow_nan=False)))
    print(json.dumps({'status':'PERSISTED','historical_run_id':str(run_id),'trades':len(frame),'result_hash':summary['result_hash']},indent=2))


def run_symbol(symbol:str,group:pd.DataFrame,start:date,end:date,conn:Any|None=None,cost_profile:dict[str,str]|None=None)->tuple[list[dict],list[dict]]:
    path=minute_path(symbol)
    sources=[]
    if path is not None:sources.append(load_minutes(path,start,end).drop(columns=['rsi14','willr14','session'],errors='ignore'))
    if conn is not None:sources.append(load_db_minutes(conn,symbol,start,end))
    frame=add_intraday_indicators(pd.concat([item for item in sources if not item.empty],ignore_index=True)) if any(not item.empty for item in sources) else pd.DataFrame()
    if path is None and frame.empty:return [],[{"symbol":symbol,"signal_date":str(day),"reason":"FILE_NOT_FOUND"} for day in group.signal_date]
    if frame.empty:return [],[{"symbol":symbol,"signal_date":str(day),"reason":"ENTRY_DATE_AFTER_SOURCE_END"} for day in group.signal_date]
    trades=[]; skips=[]; sessions=sorted(frame.session.unique()); session_index={value:index for index,value in enumerate(sessions)}
    for candidate in group.itertuples(index=False):
        day=frame[frame.session==candidate.signal_date]
        if day.empty: skips.append({"symbol":symbol,"signal_date":str(candidate.signal_date),"reason":"ENTRY_SESSION_UNAVAILABLE"}); continue
        signals=day[(day.rsi14<30)&(day.willr14<-80)]
        if signals.empty: skips.append({"symbol":symbol,"signal_date":str(candidate.signal_date),"reason":"RSI_WILLR_NOT_TRIGGERED"}); continue
        signal=signals.iloc[0]; future=day[day.ts>signal.ts]
        if future.empty: skips.append({"symbol":symbol,"signal_date":str(candidate.signal_date),"reason":"NO_NEXT_EXECUTABLE_MINUTE"}); continue
        fill=future.iloc[0]; entry=float(fill.open); after=day[day.ts>=fill.ts]
        i030=first_touch(after,entry*1.003); i050=first_touch(after,entry*1.005); i070=first_touch(after,entry*1.007)
        idx=session_index[candidate.signal_date]; d5_sessions=sessions[idx:min(len(sessions),idx+6)]; h30_sessions=sessions[idx:min(len(sessions),idx+31)]
        d5=frame[frame.session.isin(d5_sessions)&(frame.ts>=fill.ts)]; h30=frame[frame.session.isin(h30_sessions)&(frame.ts>=fill.ts)]
        s100=first_touch(d5[d5.session!=candidate.signal_date],entry*1.01); s200=first_touch(d5[d5.session!=candidate.signal_date],entry*1.02); s500=first_touch(d5[d5.session!=candidate.signal_date],entry*1.05)
        if i030[0]: exit_state='CLOSED_INTRADAY'; exit_ts=i030[1]; exit_price=i030[2]
        else:
            later=frame[(frame.session>candidate.signal_date)&(frame.ts>fill.ts)]; actual=first_touch(later,entry*1.01)
            exit_state='CLOSED_SWING' if actual[0] else 'OPEN_AS_OF_END'; exit_ts=actual[1]; exit_price=actual[2]
        holding_minutes=None if exit_ts is None else (exit_ts-fill.ts).total_seconds()/60
        holding_sessions=None if exit_ts is None else sum(candidate.signal_date<=value<=exit_ts.date() for value in sessions)
        quantity=max(1,int(200000//entry)); economics=execution_economics(entry,exit_price,quantity,cost_profile)
        outcomes={'i030_hit':i030[0],'i050_hit':i050[0],'i070_hit':i070[0],'s100_d5_hit':s100[0],'s200_d5_hit':s200[0],'s500_d5_hit':s500[0],'intraday_mfe_pct':100*(after.high.max()/entry-1),'intraday_mae_pct':100*(after.low.min()/entry-1),'d5_mfe_pct':100*(d5.high.max()/entry-1),'d5_mae_pct':100*(d5.low.min()/entry-1),'h30_mfe_pct':100*(h30.high.max()/entry-1),'h30_mae_pct':100*(h30.low.min()/entry-1),'d5_sessions':len(d5_sessions),'h30_sessions':len(h30_sessions)}
        context={'nifty_regime':optional_value(candidate.nifty_primary_trend),'stock_regime':optional_value(candidate.stock_primary_trend),'vix_regime':optional_value(candidate.vix_regime)}
        trades.append({'symbol':symbol,'sector':candidate.sector,'signal_date':candidate.signal_date,'daily_level':candidate.daily_level,'decision_code':candidate.decision_code,'setup_state':candidate.setup_state,'ofactor_long':candidate.ofactor_long,'xfactor_score':candidate.xfactor_score,'directional_edge':candidate.directional_edge,'data_quality_score':candidate.data_quality_score,'daily_rsi14':candidate.rsi_14,'daily_willr14':candidate.willr_14,'close_vs_ema61_pct':candidate.close_vs_ema61_pct,'macd_line_pct_close':candidate.macd_line_pct_close,'atr14':candidate.atr14,'volume_vs_sma20':candidate.volume_vs_sma20,**context,'entry_ts':fill.ts,'entry_price':entry,'entry_rsi14':float(signal.rsi14),'entry_willr14':float(signal.willr14),'quantity':quantity,'exit_state':exit_state,'exit_ts':exit_ts,'exit_price':exit_price,'actual_holding_minutes':holding_minutes,'actual_holding_sessions':holding_sessions,**economics,**outcomes,'outcomes':{**outcomes,'actual_holding_minutes':holding_minutes,'actual_holding_sessions':holding_sessions,'market_context':context}})
    return trades,skips


def main()->None:
    p=argparse.ArgumentParser();p.add_argument('--start',type=date.fromisoformat,default=date(2023,8,7));p.add_argument('--end',type=date.fromisoformat,default=date(2026,8,7));p.add_argument('--symbol');p.add_argument('--max-symbols',type=int);p.add_argument('--database-url',default=os.getenv('DATABASE_URL'));p.add_argument('--output-dir',type=Path,required=True);p.add_argument('--persist-existing',action='store_true');a=p.parse_args()
    # Validate the destination before the expensive full-universe evaluation.
    a.output_dir.mkdir(parents=True,exist_ok=True)
    probe=a.output_dir/'.write_test'; probe.write_text('ok'); probe.unlink()
    if a.persist_existing:
        if not a.database_url:raise SystemExit('--database-url or DATABASE_URL is required with --persist-existing')
        persist_existing(a.output_dir,a.database_url);return
    cand=candidates(a.start,a.end)
    if a.symbol:
        cand=cand[cand.symbol==a.symbol.upper()].copy()
    qualified=cand[cand.qualified].copy()
    symbols=sorted(qualified.symbol.unique()); symbols=symbols[:a.max_symbols] if a.max_symbols else symbols
    trades=[];skips=[];db_conn=psycopg.connect(a.database_url) if a.database_url else None;cost_profile=load_cost_profile(db_conn)
    for index,symbol in enumerate(symbols,1):
        print(f'[{index}/{len(symbols)}] {symbol}',flush=True); t,s=run_symbol(symbol,qualified[qualified.symbol==symbol],a.start,a.end,db_conn,cost_profile);trades.extend(t);skips.extend(s)
    trade_frame=pd.DataFrame(trades);skip_frame=pd.DataFrame(skips)
    cand.to_csv(a.output_dir/'OIIS_V1_DAILY_CANDIDATES.csv',index=False);trade_frame.drop(columns=['outcomes'],errors='ignore').to_csv(a.output_dir/'OIIS_V1_TRADES.csv',index=False);skip_frame.to_csv(a.output_dir/'OIIS_V1_SKIPPED_SIGNALS.csv',index=False)
    summary={'policy_id':'OIIS_DAILY_SELECTION_INTRADAY_ENTRY_V1.0','start':str(a.start),'end':str(a.end),'daily_candidates':len(cand),'qualified_candidates':len(qualified),'symbols_requested':len(symbols),'triggered_trades':len(trade_frame),'closed_intraday':int((trade_frame.exit_state=='CLOSED_INTRADAY').sum()) if not trade_frame.empty else 0,'closed_swing':int((trade_frame.exit_state=='CLOSED_SWING').sum()) if not trade_frame.empty else 0,'open_as_of_end':int((trade_frame.exit_state=='OPEN_AS_OF_END').sum()) if not trade_frame.empty else 0,'gross_pnl':float(trade_frame.gross_pnl.fillna(0).sum()) if not trade_frame.empty else 0,'transaction_costs':float(trade_frame.transaction_costs.fillna(0).sum()) if not trade_frame.empty else 0,'net_before_tax':float(trade_frame.net_before_tax.fillna(0).sum()) if not trade_frame.empty else 0,'tax_provision':float(trade_frame.tax_provision.fillna(0).sum()) if not trade_frame.empty else 0,'after_tax_pnl':float(trade_frame.after_tax_pnl.fillna(0).sum()) if not trade_frame.empty else 0,'cost_profile':None if cost_profile is None else f"{cost_profile['cost_profile_id']}:v{cost_profile['version']}",'limitations':['Minute source ends before requested end for many symbols; missing symbol-dates are explicit skips.','Daily screening is full-universe; execution is qualified minute-data intersection.','No stop, forced close, D+5 timeout or run-end liquidation is applied.','This is unconstrained signal-path economics, not a finite-capital portfolio return.']}
    digest=hashlib.sha256(json.dumps(summary,sort_keys=True).encode()).hexdigest();summary['result_hash']=digest
    (a.output_dir/'OIIS_V1_HISTORICAL_SUMMARY.json').write_text(json.dumps(summary,indent=2));(a.output_dir/'OIIS_V1_HISTORICAL_SUMMARY.md').write_text('# OIIS Live V1 historical summary\n\n'+''.join(f'- {k}: `{v}`\n' for k,v in summary.items()))
    excel_trades=trade_frame.drop(columns=['outcomes'],errors='ignore').copy()
    for column in excel_trades.select_dtypes(include=['datetimetz']).columns:
        excel_trades[column]=excel_trades[column].dt.tz_localize(None)
    with pd.ExcelWriter(a.output_dir/'OIIS_V1_HISTORICAL_REVIEW.xlsx',engine='xlsxwriter') as w:
        pd.DataFrame([summary]).to_excel(w,sheet_name='00 Executive Summary',index=False)
        cand.to_excel(w,sheet_name='01 Daily Candidates',index=False)
        excel_trades.to_excel(w,sheet_name='02 Trades',index=False)
        skip_frame.to_excel(w,sheet_name='03 Skips',index=False)
    if a.database_url:
        if db_conn is not None:db_conn.close()
        with psycopg.connect(a.database_url,row_factory=dict_row) as conn:
            run_id=uuid.uuid4();conn.execute("INSERT INTO oiis_live.historical_run(historical_run_id,policy_id,start_date,end_date,status,candidate_count,qualified_candidate_count,triggered_trade_count,summary,artifact_path,result_hash,completed_at) VALUES (%s,%s,%s,%s,'COMPLETED',%s,%s,%s,%s::jsonb,%s,%s,now())",(run_id,summary['policy_id'],a.start,a.end,len(cand),len(qualified),len(trade_frame),json.dumps(summary),str(a.output_dir.resolve()),digest))
            for row in trades: conn.execute("INSERT INTO oiis_live.historical_trade(historical_run_id,symbol,signal_date,entry_ts,entry_price,rsi14,willr14,exit_state,exit_ts,exit_price,gross_pnl,tax_provision,after_tax_pnl,outcomes) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb)",(run_id,row['symbol'],row['signal_date'],row['entry_ts'],row['entry_price'],row['entry_rsi14'],row['entry_willr14'],row['exit_state'],row['exit_ts'],row['exit_price'],row['gross_pnl'],row['tax_provision'],row['after_tax_pnl'],json.dumps(row['outcomes'],default=str,allow_nan=False)))
    print(json.dumps(summary,indent=2))


if __name__=='__main__':main()
