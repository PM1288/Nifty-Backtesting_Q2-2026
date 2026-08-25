from __future__ import annotations

import argparse
import json
import os
import time

from .service import execute, execute_absolute_first_sessions, execute_absolute_months, execute_expiry_history, execute_rolling_windows, load_config
from .export import export_absolute_first_sessions, export_absolute_months


def main() -> None:
    parser = argparse.ArgumentParser(description="Independent Rolling Monthly quality runner")
    parser.add_argument("command", choices=("run", "daemon", "backfill-expiry", "backfill-absolute", "backfill-absolute-first-session", "backfill-rolling", "export-absolute", "export-absolute-first-session", "verify-config"), nargs="?", default="run")
    parser.add_argument("--database-url", default=os.getenv("DATABASE_URL"))
    parser.add_argument("--config", default=os.getenv("ROLLING_MONTHLY_CONFIG"))
    parser.add_argument("--interval-seconds", type=int, default=int(os.getenv("ROLLING_MONTHLY_INTERVAL_SECONDS", "900")))
    parser.add_argument("--months", type=int, default=6)
    parser.add_argument("--output-dir", default="/tmp/rolling-monthly-absolute")
    args = parser.parse_args()
    if args.command == "verify-config":
        value, digest = load_config(args.config)
        print(json.dumps({"factor_id": value["factor_id"], "version": value["version"], "sha256": digest}))
        return
    if not args.database_url:
        raise SystemExit("DATABASE_URL is required")
    if args.command == "run":
        print(json.dumps(execute(args.database_url, args.config), default=str))
        return
    if args.command == "backfill-expiry":
        print(json.dumps(execute_expiry_history(args.database_url, args.months, args.config), default=str))
        return
    if args.command == "backfill-absolute":
        print(json.dumps(execute_absolute_months(args.database_url, args.months), default=str))
        return
    if args.command == "backfill-absolute-first-session":
        print(json.dumps(execute_absolute_first_sessions(args.database_url, args.months), default=str))
        return
    if args.command == "backfill-rolling":
        print(json.dumps(execute_rolling_windows(args.database_url, max(1, args.months // 12)), default=str))
        return
    if args.command == "export-absolute":
        print(json.dumps(export_absolute_months(args.database_url, args.output_dir), default=str))
        return
    if args.command == "export-absolute-first-session":
        print(json.dumps(export_absolute_first_sessions(args.database_url, args.output_dir), default=str))
        return
    while True:
        try:
            current = execute(args.database_url, args.config)
            # Historical months are immutable; refresh only the latest completed
            # expiry during the daemon loop. Use backfill-expiry for older months.
            expiry = execute_expiry_history(args.database_url, 1, args.config)
            absolute = execute_absolute_months(args.database_url, 1)
            first_session = execute_absolute_first_sessions(args.database_url, 1)
            rolling = execute_rolling_windows(args.database_url, 3)
            print(json.dumps({"current": current, "expiry_history": expiry, "absolute_month": absolute, "absolute_first_session": first_session, "rolling_window": rolling}, default=str), flush=True)
        except Exception as exc:
            print(json.dumps({"status": "FAILED", "error": str(exc)[:500]}), flush=True)
        time.sleep(max(60, args.interval_seconds))


if __name__ == "__main__":
    main()
