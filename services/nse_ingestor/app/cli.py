from __future__ import annotations

import argparse
import logging
from pathlib import Path

from .config import get_settings, load_report_catalog
from .db import connect, finish_ingest_run, purge_old_data, run_migrations, create_ingest_run
from .ingestor import Ingestor
from .logging_setup import configure_logging
from .notifications import DeliveryWorker, build_missing_files_event

logger = logging.getLogger(__name__)


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="NSE EOD ingestor")
    sub = p.add_subparsers(dest="command", required=True)

    sub.add_parser("migrate", help="Run SQL migrations")

    s = sub.add_parser("sync", help="Download and ingest recent dated files")
    s.add_argument("--backfill-days", type=int, default=7)

    daily = sub.add_parser("daily", help="Ingest every enabled report for one exchange session")
    daily.add_argument("--date", required=False, help="Source exchange date; defaults to previous trading session")

    lb = sub.add_parser("load-bundle", help="Load a Reports-Daily-Multiple.zip bundle")
    lb.add_argument("--bundle", required=True)
    lb.add_argument("--source-date", required=False, help="Optional bundle source date in YYYY-MM-DD or DDMMYYYY")

    sub.add_parser("purge", help="Apply retention only")
    sub.add_parser("scheduler", help="Run the 07:55 IST daily scheduler")
    sub.add_parser("delivery-worker", help="Deliver the durable NSE notification outbox")
    sub.add_parser("healthcheck", help="Validate database and daily-ingest configuration")
    return p


def execute_daily(conn, settings, report_catalog, job_id: int | None, job_date, source_date) -> dict:
    run_id = create_ingest_run(conn, "daily", backfill_start=source_date, backfill_end=source_date)
    ing = Ingestor(conn, settings, report_catalog)
    try:
        metrics = ing.daily(run_id, source_date)
        status = "failed" if metrics["errors"] else ("partial" if metrics["missing_count"] else "success")
        finish_ingest_run(conn, run_id, status, metrics)
        if metrics["missing_count"]:
            dedupe_key, payload = build_missing_files_event(job_date, source_date, run_id, metrics)
            from .db import enqueue_notification
            metrics["notification_enqueued"] = enqueue_notification(
                conn, payload["event_type"], dedupe_key, source_date, payload
            )
        if job_id is not None:
            from .db import finish_daily_job
            finish_daily_job(conn, job_id, run_id, status.upper(), metrics)
        return metrics
    except Exception as exc:
        conn.rollback()
        finish_ingest_run(conn, run_id, "failed", {"error": str(exc)})
        if job_id is not None:
            from .db import finish_daily_job
            finish_daily_job(conn, job_id, run_id, "FAILED", {"error": str(exc)})
        raise


def main() -> None:
    args = build_parser().parse_args()
    settings = get_settings()
    configure_logging(settings.log_dir)
    report_catalog = load_report_catalog(settings.report_catalog_path)

    conn = connect(settings.database_url)
    run_migrations(conn, Path("/app/sql"))

    if args.command == "migrate":
        logger.info("Migrations complete")
        return

    ing = Ingestor(conn, settings, report_catalog)

    if args.command == "sync":
        run_id = create_ingest_run(conn, "sync")
        try:
            metrics = ing.sync(run_id=run_id, backfill_days=args.backfill_days)
            metrics["staging_deleted"] = ing.cleanup_staging()
            metrics.update(purge_old_data(conn, settings.retention_days, settings.log_retention_days))
            finish_ingest_run(conn, run_id, "success", metrics)
            logger.info("Sync success: %s", metrics)
        except Exception as exc:
            conn.rollback()
            finish_ingest_run(conn, run_id, "failed", {"error": str(exc)})
            raise
    elif args.command == "daily":
        from datetime import date
        from .utils import parse_flexible_date
        source_date = parse_flexible_date(args.date) if args.date else None
        if source_date is None:
            source_date = __import__("app.db", fromlist=["resolve_previous_trading_day"]).resolve_previous_trading_day(conn, date.today())
        metrics = execute_daily(conn, settings, report_catalog, None, date.today(), source_date)
        logger.info("Daily ingest finished: %s", metrics)
    elif args.command == "load-bundle":
        bundle = Path(args.bundle)
        run_id = create_ingest_run(conn, "load-bundle", notes=str(bundle))
        try:
            from .utils import parse_flexible_date
            source_date_override = parse_flexible_date(args.source_date) if args.source_date else None
            metrics = ing.load_bundle(run_id=run_id, bundle_path=bundle, source_date_override=source_date_override)
            metrics["staging_deleted"] = ing.cleanup_staging()
            metrics.update(purge_old_data(conn, settings.retention_days, settings.log_retention_days))
            finish_ingest_run(conn, run_id, "success", metrics)
            logger.info("Bundle load success: %s", metrics)
        except Exception as exc:
            conn.rollback()
            finish_ingest_run(conn, run_id, "failed", {"error": str(exc)})
            raise
    elif args.command == "purge":
        run_id = create_ingest_run(conn, "purge")
        try:
            metrics = purge_old_data(conn, settings.retention_days, settings.log_retention_days)
            metrics["staging_deleted"] = ing.cleanup_staging()
            finish_ingest_run(conn, run_id, "success", metrics)
            logger.info("Purge success: %s", metrics)
        except Exception as exc:
            conn.rollback()
            finish_ingest_run(conn, run_id, "failed", {"error": str(exc)})
            raise
    elif args.command == "scheduler":
        conn.close()
        from .scheduler import run
        run()
    elif args.command == "delivery-worker":
        worker = DeliveryWorker(conn, settings)
        import time
        while True:
            worker.deliver_once()
            time.sleep(5)
    elif args.command == "healthcheck":
        row = conn.execute("SELECT to_regclass('nse.daily_job_run'), to_regclass('nse.notification_outbox')").fetchone()
        if not all(row):
            raise SystemExit("NSE daily-ingest schema is incomplete")
        if settings.schedule_time != "07:55":
            raise SystemExit(f"Unexpected NSE schedule: {settings.schedule_time}")
        if settings.notifications_enabled and not settings.n8n_webhook_url:
            raise SystemExit("NSE notifications enabled without webhook URL")
        print("healthy")


if __name__ == "__main__":
    main()
