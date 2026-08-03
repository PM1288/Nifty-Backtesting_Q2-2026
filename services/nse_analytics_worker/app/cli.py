from __future__ import annotations

import argparse
import logging
from pathlib import Path

from .checks import run_checks
from .backtesting import refresh_backtesting_snapshots
from .config import get_settings
from .db import connect, create_job_run, finish_job_run, run_migrations
from .indicator_strategy import refresh_indicator_strategy_snapshots
from .logging_setup import configure_logging
from .refresh import refresh_all_pipeline, determine_refresh_window, refresh_security_features, refresh_signals, refresh_market_summary, refresh_signal_performance, purge_old_analytics
from .snapshot_refresh import trigger_snapshot_refresh

logger = logging.getLogger(__name__)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="NSE analytics and dashboard layer")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("migrate", help="Apply SQL migrations")

    sub.add_parser("refresh-all", help="Refresh features, signals, summaries, performance, and purge")

    sub.add_parser("refresh-features", help="Refresh only the compact feature table")
    sub.add_parser("refresh-signals", help="Refresh only the signal table")
    sub.add_parser("refresh-summary", help="Refresh only the market summary and performance tables")
    sub.add_parser("refresh-indicator-strategy", help="Refresh only the precomputed indicator and strategy snapshots")
    sub.add_parser("refresh-backtesting", help="Refresh only the precomputed backtesting snapshots")
    sub.add_parser("run-checks", help="Run data-quality checks")
    sub.add_parser("purge", help="Purge old analytics rows")

    return parser


def main() -> None:
    args = build_parser().parse_args()
    settings = get_settings()
    configure_logging(settings.log_dir, settings.log_level)
    conn = connect(settings.database_url)
    run_migrations(conn, Path("/app/sql"))

    if args.command == "migrate":
        logger.info("Migrations complete")
        return

    if args.command == "refresh-all":
        run_id = create_job_run(conn, "refresh-all")
        try:
            metrics = refresh_all_pipeline(conn, settings, run_id)
            check_metrics = run_checks(conn, settings.quality_checks_path, job_run_id=run_id)
            metrics.update(check_metrics)
            metrics.update(trigger_snapshot_refresh(settings))
            finish_job_run(conn, run_id, "success" if check_metrics.get("checks_failed", 0) == 0 else "warning", metrics)
            logger.info("Refresh-all complete: %s", metrics)
        except Exception as exc:
            conn.rollback()
            finish_job_run(conn, run_id, "failed", {"error": str(exc)})
            raise
        return

    if args.command == "run-checks":
        run_id = create_job_run(conn, "run-checks")
        try:
            metrics = run_checks(conn, settings.quality_checks_path, job_run_id=run_id)
            finish_job_run(conn, run_id, "success" if metrics.get("checks_failed", 0) == 0 else "warning", metrics)
            logger.info("Checks complete: %s", metrics)
        except Exception as exc:
            conn.rollback()
            finish_job_run(conn, run_id, "failed", {"error": str(exc)})
            raise
        return

    if args.command == "purge":
        run_id = create_job_run(conn, "purge")
        try:
            metrics = purge_old_analytics(conn, settings)
            finish_job_run(conn, run_id, "success", metrics)
            logger.info("Purge complete: %s", metrics)
        except Exception as exc:
            conn.rollback()
            finish_job_run(conn, run_id, "failed", {"error": str(exc)})
            raise
        return

    if args.command in {"refresh-features", "refresh-signals", "refresh-summary", "refresh-indicator-strategy", "refresh-backtesting"}:
        run_id = create_job_run(conn, args.command)
        try:
            window = determine_refresh_window(conn, settings)
            if args.command == "refresh-features":
                metrics = refresh_security_features(conn, window)
            elif args.command == "refresh-signals":
                metrics = refresh_signals(conn, window)
            elif args.command == "refresh-indicator-strategy":
                metrics = refresh_indicator_strategy_snapshots(conn, settings.indicator_strategy_registry_path, run_id)
            elif args.command == "refresh-backtesting":
                metrics = refresh_backtesting_snapshots(conn, run_id)
            else:
                metrics = {}
                metrics.update(refresh_market_summary(conn, window))
                metrics.update(refresh_signal_performance(conn, window))
            finish_job_run(conn, run_id, "success", metrics)
            logger.info("%s complete: %s", args.command, metrics)
        except Exception as exc:
            conn.rollback()
            finish_job_run(conn, run_id, "failed", {"error": str(exc)})
            raise
        return


if __name__ == "__main__":
    main()
