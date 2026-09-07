#!/usr/bin/env python3
"""Explicit additive archive/backfill. Never deletes raw bars or authorizes retention."""
import argparse
import datetime as dt
import json
import subprocess
from pathlib import Path
from zoneinfo import ZoneInfo

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--start',type=dt.date.fromisoformat,required=True)
    parser.add_argument('--end',type=dt.date.fromisoformat,required=True)
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args()
    if args.end>=dt.datetime.now(ZoneInfo('Asia/Kolkata')).date() or args.start>args.end:
        parser.error('Only completed prior sessions and ordered bounds are allowed')
    rows=[];day=args.start
    args.output.parent.mkdir(parents=True,exist_ok=True)
    while day<=args.end:
        query=f"SELECT public.archive_minute_session('{day.isoformat()}'::date);"
        try:
            result=subprocess.run(['docker','exec','-i','trading-stack-novius2-postgres-1','sh','-c',
            'PGOPTIONS="-c statement_timeout=30000 -c lock_timeout=2000" psql -X -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -f -'],
                input=query,text=True,capture_output=True,timeout=40,check=False)
        except subprocess.TimeoutExpired:
            rows.append({'date':str(day),'state':'FAILED_TIMEOUT','reason':'client deadline exceeded; verify server checkpoint before retry'})
            args.output.write_text(json.dumps(rows,indent=2))
            raise SystemExit(f'Archive stopped at {day}; no raw data was deleted')
        if result.returncode:
            rows.append({'date':str(day),'state':'FAILED','reason':'database archive failed; inspect local PostgreSQL diagnostics'})
            args.output.write_text(json.dumps(rows,indent=2))
            raise SystemExit(f'Archive stopped at {day}; no raw data was deleted')
        count=int(result.stdout.strip())
        rows.append({'date':str(day),'state':'ARCHIVED' if count else 'NO_ROWS_CHANGED','rows':count})
        args.output.write_text(json.dumps(rows,indent=2))
        print(json.dumps(rows[-1]),flush=True)
        day+=dt.timedelta(days=1)

if __name__=='__main__':main()
