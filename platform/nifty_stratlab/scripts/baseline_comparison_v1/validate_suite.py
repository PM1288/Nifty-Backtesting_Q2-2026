#!/usr/bin/env python3
from __future__ import annotations
import json, sys
from pathlib import Path
from jsonschema import Draft202012Validator, FormatChecker

ROOT=Path(__file__).resolve().parents[2]

def load(p): return json.loads(p.read_text(encoding='utf-8'))
def validate_file(schema_path, data_path):
    schema=load(schema_path); data=load(data_path)
    errors=sorted(Draft202012Validator(schema,format_checker=FormatChecker()).iter_errors(data),key=lambda e:list(e.path))
    if errors:
        print(f'FAIL {data_path}')
        for e in errors: print('  -', '/'.join(map(str,e.path)) or '<root>', e.message)
        return False
    print('PASS',data_path.relative_to(ROOT)); return True

def walk_conditions(node, refs):
    if 'feature' in node:
        refs.add(node['feature'])
        if 'compare_feature' in node: refs.add(node['compare_feature'])
    else:
        for k in ('all','any'):
            for item in node.get(k,[]): walk_conditions(item,refs)
        if 'not' in node: walk_conditions(node['not'],refs)

ok=True
ss=ROOT/'contracts/baseline_comparison_v1/declarative-strategy-v2.schema.json'
ids=set()
for p in sorted((ROOT/'config/strategies').glob('*.json')):
    ok=validate_file(ss,p) and ok
    d=load(p); sid=d['strategy_version_id']
    if sid in ids: print('FAIL duplicate strategy id',sid); ok=False
    ids.add(sid)
    fids={f['feature_id'] for f in d['features']}
    refs=set(); walk_conditions(d['day_eligibility'],refs); walk_conditions(d['entry']['conditions'],refs); walk_conditions(d['exit']['conditions'],refs)
    missing=refs-fids
    if missing: print('FAIL',sid,'unknown feature references',sorted(missing)); ok=False
suite_path=ROOT/'config/suites/nifty_intraday_baseline_comparison_v1.json'
ok=validate_file(ROOT/'contracts/baseline_comparison_v1/strategy-comparison-suite.schema.json',suite_path) and ok
suite=load(suite_path)
for item in suite['strategies']:
    p=(suite_path.parent/item['strategy_file']).resolve()
    if not p.exists(): print('FAIL missing strategy file',p); ok=False
    elif load(p)['strategy_version_id']!=item['strategy_version_id']: print('FAIL suite id mismatch',item); ok=False
for p in sorted((ROOT/'config/runs').glob('*.json')):
    ok=validate_file(ROOT/'contracts/baseline_comparison_v1/comparison-run-config.schema.json',p) and ok
print(f'Validated {len(ids)} strategies, {len(suite["strategies"])} suite members, {len(list((ROOT/"config/runs").glob("*.json")))} run profiles.')
sys.exit(0 if ok else 1)
