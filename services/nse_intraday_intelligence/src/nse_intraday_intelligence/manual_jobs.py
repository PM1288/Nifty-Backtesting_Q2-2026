from __future__ import annotations

import argparse
from datetime import date

from .logging_utils import configure_logging
from .pipeline import (
    backfill_history,
    finalize_session,
    refresh_feature_tables,
    refresh_live_state,
    refresh_watchlists,
    retention_cleanup,
    run_quality_checks,
    sync_raw_minute,
)
from .sql_loader import install_sql


def _parse_trade_date(value: str | None) -> date | None:
    if not value:
        return None
    return date.fromisoformat(value)


def main() -> None:
    configure_logging()
    parser = argparse.ArgumentParser(description="Run manual NSE intraday intelligence jobs")
    parser.add_argument(
        "job",
        choices=[
            "install-sql",
            "sync-raw",
            "refresh-features",
            "refresh-dashboard",
            "refresh-watchlists",
            "run-quality-checks",
            "finalize-session",
            "retention",
            "backfill-history",
        ],
    )
    parser.add_argument("--trade-date")
    parser.add_argument("--index-code")
    parser.add_argument("--days", type=int, default=90)
    args = parser.parse_args()

    trade_date = _parse_trade_date(args.trade_date)

    if args.job == "install-sql":
        install_sql()
        return
    if args.job == "sync-raw":
        sync_raw_minute(trade_date=trade_date)
        return
    if args.job == "refresh-features":
        refresh_feature_tables(trade_date=trade_date, index_code=args.index_code)
        return
    if args.job == "refresh-dashboard":
        refresh_live_state(trade_date=trade_date, index_code=args.index_code)
        return
    if args.job == "refresh-watchlists":
        refresh_watchlists(trade_date=trade_date, index_code=args.index_code)
        return
    if args.job == "run-quality-checks":
        run_quality_checks(trade_date=trade_date, index_code=args.index_code)
        return
    if args.job == "finalize-session":
        finalize_session(trade_date=trade_date, index_code=args.index_code)
        return
    if args.job == "retention":
        retention_cleanup()
        return
    if args.job == "backfill-history":
        backfill_history(days=args.days, index_code=args.index_code)
        return


if __name__ == "__main__":
    main()
