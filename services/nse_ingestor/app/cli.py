from __future__ import annotations

import argparse
import logging
from pathlib import Path

from .config import get_settings, load_report_catalog
from .db import connect, finish_ingest_run, purge_old_data, run_migrations, create_ingest_run
from .ingestor import Ingestor
from .logging_setup import configure_logging

logger = logging.getLogger(__name__)


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="NSE EOD ingestor")
    sub = p.add_subparsers(dest="command", required=True)

    sub.add_parser("migrate", help="Run SQL migrations")

    s = sub.add_parser("sync", help="Download and ingest recent dated files")
    s.add_argument("--backfill-days", type=int, default=7)

    lb = sub.add_parser("load-bundle", help="Load a Reports-Daily-Multiple.zip bundle")
    lb.add_argument("--bundle", required=True)
    lb.add_argument("--source-date", required=False, help="Optional bundle source date in YYYY-MM-DD or DDMMYYYY")

    sub.add_parser("purge", help="Apply retention only")
    return p


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


if __name__ == "__main__":
    main()
