#!/usr/bin/env python3
"""One idempotent database-backed incremental Trendlyne collection run."""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, time, timedelta, timezone

from config import SETTINGS
from analysis import refresh_recommendation_analysis
from crawler import Crawler
from database import ReportDatabase
from incremental_storage import (
    IncrementalRunAlreadyActive,
    abandon_interrupted_runs,
    advisory_lock,
    begin_run,
    ensure_operational_tables,
    existing_report_state,
    finish_run,
    insert_new_reports,
)
from utils import LOGGER
from webhook import drain_pending


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Incremental Trendlyne collector")
    parser.add_argument("--trigger", choices=("startup", "schedule", "manual"), default="manual")
    parser.add_argument("--max-pages", type=int, default=None)
    return parser.parse_args()


def run(trigger: str, max_pages: int | None = None) -> int:
    ensure_operational_tables()
    run_id: str | None = None
    stats: dict = {}
    detail: dict = {"trigger": trigger}
    try:
        with advisory_lock():
            detail["interrupted_runs_closed"] = abandon_interrupted_runs()
            existing_ids, newest_date = existing_report_state()
            if newest_date:
                cutoff_day = newest_date - timedelta(days=max(1, SETTINGS.incremental_overlap_days))
                cutoff = datetime.combine(cutoff_day, time.min, tzinfo=timezone.utc)
            else:
                cutoff = SETTINGS.cutoff_date
                cutoff_day = cutoff.date()
            run_id = begin_run(trigger, cutoff_day)
            LOGGER.info(
                "Incremental run %s starting: existing=%d newest=%s cutoff=%s",
                run_id, len(existing_ids), newest_date, cutoff_day,
            )

            # Retry any durable notification from an earlier successful insert
            # before crawling. A delivery failure never causes a duplicate DB row.
            try:
                detail["prior_webhook"] = drain_pending()
            except Exception as exc:
                detail["prior_webhook_error"] = f"{type(exc).__name__}: {exc}"

            crawler = Crawler(
                resume=False,
                nifty100_only=False,
                cutoff_date=cutoff,
                max_pages=max_pages,
                existing_report_ids=existing_ids,
                stop_after_known_pages=SETTINGS.incremental_stop_after_known_pages,
            )
            new_candidates = []
            for batch in crawler.crawl():
                new_candidates.extend(batch)
            stats = dict(crawler.stats)

            if stats.get("pages_scraped", 0) == 0 and stats.get("errors", 0) > 0:
                raise RuntimeError("listing crawl failed before a page could be parsed")

            if SETTINGS.enrich_stock_pages and new_candidates:
                crawler.enrich_stock_pages(new_candidates)

            if new_candidates:
                local_db = ReportDatabase(SETTINGS.sqlite_path)
                try:
                    local_db.upsert_many(new_candidates)
                finally:
                    local_db.close()

            inserted = insert_new_reports([record.as_dict() for record in new_candidates], run_id)
            stats["reports_inserted"] = len(inserted)
            detail.update(
                {
                    "newest_report_before_run": newest_date,
                    "candidate_count": len(new_candidates),
                    "inserted_report_ids": [record["report_id"] for record in inserted],
                }
            )
            try:
                detail["webhook"] = drain_pending()
            except Exception as exc:
                detail["webhook_error"] = f"{type(exc).__name__}: {exc}"

            # Rebuild the complete six-month recommendation evidence after
            # every successful collection cycle, including zero-insert runs.
            # This advances developing 5D/30D paths as daily prices arrive.
            detail["recommendation_analysis"] = refresh_recommendation_analysis()

            status = "SUCCESS" if not stats.get("errors") else "SUCCESS_WITH_SOURCE_ERRORS"
            finish_run(run_id, status, stats, detail)
            SETTINGS.scheduler_state_path.write_text(
                json.dumps(
                    {
                        "last_run_id": run_id,
                        "last_status": status,
                        "last_completed_at": datetime.now(timezone.utc).isoformat(),
                        "reports_inserted": len(inserted),
                        "pages_scraped": stats.get("pages_scraped", 0),
                    },
                    indent=2,
                    default=str,
                ),
                encoding="utf-8",
            )
            LOGGER.info("Incremental run %s complete: status=%s inserted=%d", run_id, status, len(inserted))
            return 0
    except IncrementalRunAlreadyActive as exc:
        LOGGER.warning("Incremental run skipped: %s", exc)
        return 0
    except Exception as exc:
        LOGGER.exception("Incremental run failed")
        if run_id:
            stats.setdefault("errors", 1)
            detail["error"] = f"{type(exc).__name__}: {exc}"
            try:
                finish_run(run_id, "FAILED", stats, detail)
            except Exception:
                LOGGER.exception("Could not record failed run status")
        return 1


if __name__ == "__main__":
    arguments = parse_args()
    sys.exit(run(arguments.trigger, arguments.max_pages))
