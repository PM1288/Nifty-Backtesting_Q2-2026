import importlib.util
from pathlib import Path
import pandas as pd

MODULE=Path(__file__).resolve().parents[2]/'tools/evaluate_strategy_universal.py'
spec=importlib.util.spec_from_file_location('universal_eval',MODULE); mod=importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)

def test_percent_is_percentage_not_fraction():
    assert mod.pct(pd.Series([True,False,True,True])) == 75.0

def test_entry_only_without_exit_fails_realised_pnl_gate():
    trades=pd.DataFrame({'entry_date':['2025-01-01'],'symbol':['ABC']})
    gates=mod.gate_rows('ENTRY_ONLY',trades,pd.DataFrame(),pd.DataFrame(),{})
    row=gates[gates.gate_name=='authoritative_exit_for_realised_pnl'].iloc[0]
    assert row.status == 'FAIL'

def test_complete_strategy_with_exit_can_pass_exit_gate():
    trades=pd.DataFrame({'entry_date':['2025-01-01'],'exit_reason':['TARGET'],'quantity':[1],'entry_price':[100],'exit_date':['2025-01-02'],'capital_released':[True]})
    gates=mod.gate_rows('COMPLETE_RULE_BASED',trades,pd.DataFrame(),pd.DataFrame({'x':[1]}),{},authoritative_exit=True)
    assert gates[gates.gate_name=='authoritative_exit_for_realised_pnl'].iloc[0].status == 'PASS'
