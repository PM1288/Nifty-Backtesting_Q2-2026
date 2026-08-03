#!/usr/bin/env python3
from __future__ import annotations
import json, sys
from pathlib import Path
from datetime import datetime

ROOT=Path(__file__).resolve().parents[2]

def load(p): return json.loads(p.read_text(encoding='utf-8'))
def ts_time(s): return datetime.fromisoformat(s).time().isoformat()

def val(row,f): return row['features'].get(f)

def compare(a,op,b,prev_a=None,prev_b=None,range_=None):
    if a is None: return False
    if op=='<': return a<b
    if op=='<=': return a<=b
    if op=='>': return a>b
    if op=='>=': return a>=b
    if op=='==': return a==b
    if op=='!=': return a!=b
    if op=='between':
        lo,hi=range_['lower'],range_['upper']; il=range_.get('include_lower',True); iu=range_.get('include_upper',True)
        return (a>=lo if il else a>lo) and (a<=hi if iu else a<hi)
    if op=='not_between':
        lo,hi=range_['lower'],range_['upper']; return not (lo<=a<=hi)
    if op=='crosses_above': return prev_a is not None and prev_b is not None and prev_a<=prev_b and a>b
    if op=='crosses_below': return prev_a is not None and prev_b is not None and prev_a>=prev_b and a<b
    raise ValueError(op)

def eval_node(node,row,prev):
    if 'feature' in node:
        a=val(row,node['feature']); pa=val(prev,node['feature']) if prev else None
        if 'compare_feature' in node:
            b=val(row,node['compare_feature']); pb=val(prev,node['compare_feature']) if prev else None
            return compare(a,node['operator'],b,pa,pb)
        if 'range' in node: return compare(a,node['operator'],None,pa,None,node['range'])
        b=node.get('value'); pb=b
        return compare(a,node['operator'],b,pa,pb)
    if 'all' in node: return all(eval_node(x,row,prev) for x in node['all'])
    if 'any' in node: return any(eval_node(x,row,prev) for x in node['any'])
    if 'not' in node: return not eval_node(node['not'],row,prev)
    raise ValueError(node)

def within(ts,start,end):
    t=ts_time(ts); return start<=t<=end

def main():
    fixtures=[json.loads(x) for x in (ROOT/'tests/fixtures/baseline_comparison_v1/feature_snapshots.jsonl').read_text().splitlines() if x.strip()]
    expected=load(ROOT/'tests/expected/baseline_comparison_v1/golden_expected.json')
    got=[]
    for sp in sorted((ROOT/'config/strategies').glob('*.json')):
        s=load(sp); sid=s['strategy_version_id']; rows=sorted([r for r in fixtures if r['strategy_version_id']==sid],key=lambda r:r['minute_ts'])
        if not rows: continue
        if not eval_node(s['day_eligibility'],rows[0],None): continue
        pos=False; entry_signal=None; entry_fill=None; exit_signal=None; exit_fill=None
        for i,row in enumerate(rows):
            prev=rows[i-1] if i else None
            if not pos and entry_signal is None and within(row['minute_ts'],s['entry']['allowed_signal_time']['start'],s['entry']['allowed_signal_time']['end']) and eval_node(s['entry']['conditions'],row,prev):
                entry_signal=row
                if i+1<len(rows): entry_fill=rows[i+1]; pos=True
                continue
            if pos and entry_fill is not None and row['minute_ts']<=entry_fill['minute_ts']: continue
            if pos and eval_node(s['exit']['conditions'],row,prev):
                exit_signal=row
                if i+1<len(rows): exit_fill=rows[i+1]
                pos=False; break
        if all([entry_signal,entry_fill,exit_signal,exit_fill]):
            got.append({'strategy_version_id':sid,'symbol':rows[0]['symbol'],'entry_signal_ts':entry_signal['minute_ts'],'entry_fill_ts':entry_fill['minute_ts'],'exit_signal_ts':exit_signal['minute_ts'],'exit_fill_ts':exit_fill['minute_ts'],'entry_price':entry_fill['open_px'],'exit_price':exit_fill['open_px']})
    exp_map={(x['strategy_version_id'],x['symbol']):x for x in expected['trades']}
    errors=[]
    if len(got)!=expected['expected_trade_count']: errors.append(f'trade count expected {expected["expected_trade_count"]} got {len(got)}')
    for g in got:
        e=exp_map.get((g['strategy_version_id'],g['symbol']))
        if not e: errors.append(f'unexpected trade {g}'); continue
        for k in ('entry_signal_ts','entry_fill_ts','exit_signal_ts','exit_fill_ts'):
            if g[k]!=e[k]: errors.append(f'{g["strategy_version_id"]} {k}: expected {e[k]} got {g[k]}')
    out={'suite_id':expected['suite_id'],'status':'PASS' if not errors else 'FAIL','strategy_count':len(list((ROOT/'config/strategies').glob('*.json'))),'trade_count':len(got),'trades':got,'errors':errors}
    outp=ROOT/'evidence/baseline_comparison_v1/reference_golden_result.json'; outp.write_text(json.dumps(out,indent=2),encoding='utf-8')
    print(json.dumps(out,indent=2))
    if errors: sys.exit(1)
    print(f'PASS: {len(got)} strategy golden trades matched expected signal and next-bar fill timestamps.')
main()
