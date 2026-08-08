#!/usr/bin/env python3
"""Create a bounded review workbook from a consolidated OIIS DOE run."""
import argparse
from pathlib import Path
import pandas as pd

def safe(df):
    x=df.copy()
    for c in x.columns:
        if isinstance(x[c].dtype,pd.DatetimeTZDtype): x[c]=x[c].dt.tz_localize(None)
    return x

def main():
    p=argparse.ArgumentParser(); p.add_argument('run_dir',type=Path); p.add_argument('--component-sample',type=int,default=250000); a=p.parse_args(); d=a.run_dir
    read=lambda n: pd.read_csv(d/n) if (d/n).exists() and (d/n).stat().st_size else pd.DataFrame()
    summary=read('trial_summary.csv'); effects=read('factor_effects_vs_baseline.csv'); trades=read('trades.csv'); regimes=read('regime_performance.csv'); targets=read('target_events.csv'); adverse=read('adverse_events.csv'); components=pd.read_csv(d/'component_event_scores.csv',nrows=a.component_sample) if (d/'component_event_scores.csv').exists() else pd.DataFrame()
    with pd.ExcelWriter(d/'OIIS_Component_DOE_Evaluation.xlsx',engine='xlsxwriter') as w:
        pd.DataFrame({'item':['Run directory','Component CSV','Component workbook policy','Component rows included in workbook'],'value':[str(d.resolve()),'component_event_scores.csv (complete)','Workbook uses bounded sample; CSV is authoritative','%d of complete CSV'%len(components)]}).to_excel(w,sheet_name='00 Executive',index=False)
        for frame,name in [(summary,'01 Trial Summary'),(effects,'02 Factor Effects'),(components,'03 Component Sample'),(trades,'04 Trade Detail'),(regimes,'05 Regime Performance'),(targets,'06 Reward Ladder'),(adverse,'07 Adverse Ladder')]: safe(frame).to_excel(w,sheet_name=name,index=False)
    (d/'README.md').write_text('# OIIS component DOE\n\nThree-trial all-stock validation completed. Complete component and decision event data remain in CSV files. The Excel workbook intentionally contains a bounded component sample because Excel cannot represent the full event volume.\n')
    print({'run_dir':str(d),'trials':len(summary),'trades':len(trades),'component_sample':len(components)})
if __name__=='__main__': main()
