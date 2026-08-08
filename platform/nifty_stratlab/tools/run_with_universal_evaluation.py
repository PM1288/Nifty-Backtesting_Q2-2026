#!/usr/bin/env python3
"""Run any backtest command and then enforce the Universal V2 output contract."""
from __future__ import annotations
import argparse, os, subprocess, sys
from pathlib import Path

HERE=Path(__file__).resolve().parent
def main():
 p=argparse.ArgumentParser(); p.add_argument('--strategy-name',required=True); p.add_argument('--strategy-version',required=True); p.add_argument('--archetype',required=True); p.add_argument('--run-output-dir',type=Path,required=True); p.add_argument('--authoritative-exit',action='store_true'); p.add_argument('--evaluation-output-dir',type=Path); p.add_argument('command',nargs=argparse.REMAINDER); a=p.parse_args()
 command=a.command[1:] if a.command and a.command[0]=='--' else a.command
 if not command: raise SystemExit('Supply the backtest command after --')
 completed=subprocess.run(command,check=False)
 if completed.returncode: raise SystemExit(f'Backtest failed with exit code {completed.returncode}; evaluation not generated')
 eval_out=a.evaluation_output_dir or a.run_output_dir/'evaluation'
 cmd=[sys.executable,str(HERE/'evaluate_strategy_universal.py'),'--input-dir',str(a.run_output_dir),'--strategy-name',a.strategy_name,'--strategy-version',a.strategy_version,'--archetype',a.archetype,'--output-dir',str(eval_out)]
 if a.authoritative_exit: cmd.append('--authoritative-exit')
 dsn=os.getenv('DATABASE_URL') or os.getenv('TRADING_DATABASE_URL')
 if dsn: cmd.extend(['--database-url',dsn])
 raise SystemExit(subprocess.run(cmd,check=False).returncode)
if __name__=='__main__':main()
