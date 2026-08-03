from __future__ import annotations

import argparse
import json

from .config import Settings
from .logging_utils import configure_logging
from .orchestrator import load_run, read_latest_metadata, run_backfill, run_latest_pull


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="NSE FII daily reports service CLI")
    subparsers = parser.add_subparsers(dest="command", required=True)

    pull_latest = subparsers.add_parser("pull-latest", help="Fetch the latest available daily report set")
    pull_latest.add_argument("--as-of-date")
    pull_latest.add_argument("--max-lookback-days", type=int, default=10)
    pull_latest.add_argument("--no-parse", action="store_true")

    backfill = subparsers.add_parser("backfill", help="Backfill a date range")
    backfill.add_argument("--start-date", required=True)
    backfill.add_argument("--end-date", required=True)
    backfill.add_argument("--no-parse", action="store_true")
    backfill.add_argument("--fail-fast", action="store_true")

    load = subparsers.add_parser("load", help="Load a daily or backfill run into Postgres")
    load.add_argument("--kind", choices=["daily", "backfill"])
    load.add_argument("--run-id")
    load.add_argument("--truncate-tables", action="store_true")

    subparsers.add_parser("latest-run", help="Show latest metadata")
    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()

    settings = Settings.from_env()
    configure_logging(settings.log_level)

    if args.command == "pull-latest":
        payload = run_latest_pull(
            settings,
            as_of_date=args.as_of_date,
            max_lookback_days=args.max_lookback_days,
            save_parsed=not args.no_parse,
        )
    elif args.command == "backfill":
        payload = run_backfill(
            settings,
            start_date=args.start_date,
            end_date=args.end_date,
            save_parsed=not args.no_parse,
            continue_on_error=not args.fail_fast,
        )
    elif args.command == "load":
        payload = load_run(
            settings,
            kind=args.kind,
            run_id=args.run_id,
            truncate_tables_on_load=True if args.truncate_tables else None,
        )
    else:
        payload = read_latest_metadata(settings)

    print(json.dumps(payload, indent=2))


if __name__ == "__main__":
    main()
