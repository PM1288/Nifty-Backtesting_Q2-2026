#!/usr/bin/env python3
"""
Trendlyne scraper entry point
----------------------------
Entry point for the Trendlyne research-reports scraper.

Scope (see README.md for the full explanation):
  - Only scrapes the PUBLIC, unauthenticated listing pages at
    https://trendlyne.com/research-reports/all/ (and its paginated
    successors), going back until reports are older than YEARS_BACK
    (default 5) or the site runs out of pages.
  - Does NOT log in, does NOT download gated PDFs, and does NOT attempt
    to work around Trendlyne's stated subscriber download quotas.
  - Resumable: progress is checkpointed after every page, and reports
    already seen are deduplicated on resume.

Usage:
    python main.py                     # fresh or resumed run
    python main.py --no-resume         # ignore any existing checkpoint
    python main.py --years 3           # override the lookback window
    python main.py --enrich            # also fetch public stock pages
                                        # for sector/industry/market cap
"""
from __future__ import annotations

import argparse
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from config import SETTINGS, compute_cutoff_date
from crawler import Crawler
from database import ReportDatabase
from exporter import export, print_validation_report
from postgres import PostgresStorageError, check_connectivity, upsert_reports, validate_storage
from utils import LOGGER


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Trendlyne research-reports scraper (public pages only)")
    p.add_argument("--no-resume", action="store_true", help="Ignore existing checkpoint, start fresh")
    p.add_argument("--years", type=int, default=None, help="Override lookback window in years (default 5)")
    p.add_argument(
        "--cutoff-date", type=str, default=None,
        help="Stop crawling once reports are older than this date (YYYY-MM-DD). Overrides --years.",
    )
    p.add_argument("--enrich", action="store_true", help="Best-effort enrich sector/industry/market cap")
    p.add_argument("--max-pages", type=int, default=None, help="Override max_pages_per_run safety valve")
    p.add_argument(
        "--all-stocks", action="store_true",
        help="Disable NIFTY 100 filtering and crawl reports for every stock (filtering is ON by default)",
    )
    p.add_argument(
        "--symbols-file", type=Path, default=None,
        help="Use this CSV (columns: symbol[,company_name]) as the NIFTY 100 universe instead of "
             "fetching/caching from NSE - useful if this machine can't reach nseindia.com",
    )
    p.add_argument(
        "--refresh-nifty100", action="store_true",
        help="Force a fresh fetch of the NIFTY 100 constituent list from NSE, ignoring any cache",
    )
    p.add_argument(
        "--no-postgres", action="store_true",
        help="Skip the optional PostgreSQL persistence step (same as POSTGRES_ENABLED=false)",
    )
    p.add_argument(
        "--check-postgres", action="store_true",
        help="Only verify PostgreSQL connectivity and that research.trendlyne_reports "
             "matches the pipeline schema, then exit",
    )
    return p.parse_args()


def main() -> int:
    args = parse_args()

    if args.enrich:
        os.environ["ENRICH_STOCK_PAGES"] = "true"

    cutoff = None
    if args.cutoff_date:
        try:
            cutoff = datetime.strptime(args.cutoff_date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        except ValueError:
            LOGGER.error("Invalid --cutoff-date '%s'; expected YYYY-MM-DD.", args.cutoff_date)
            return 2
    elif args.years is not None:
        cutoff = compute_cutoff_date(args.years)
    effective_cutoff = cutoff or SETTINGS.cutoff_date

    postgres_enabled = SETTINGS.postgres_enabled and not args.no_postgres

    if args.check_postgres:
        LOGGER.info("PostgreSQL connectivity + schema check")
        print("Checking PostgreSQL connectivity and schema...")
        try:
            check_connectivity()
            validate_storage()
        except PostgresStorageError as exc:
            print(f"PostgreSQL check FAILED: {exc}")
            LOGGER.error("PostgreSQL check failed: %s", exc)
            return 1
        print(f"PostgreSQL check OK: {SETTINGS.db_schema}.{SETTINGS.db_table} is ready.")
        return 0

    nifty100_only = not args.all_stocks

    LOGGER.info("=" * 60)
    LOGGER.info("Trendlyne research-reports scraper starting")
    LOGGER.info("Lookback window : last %d year(s) (cutoff %s)",
                SETTINGS.years_back if args.years is None else args.years,
                effective_cutoff.strftime("%Y-%m-%d"))
    LOGGER.info("Resume          : %s", not args.no_resume)
    LOGGER.info("Enrichment      : %s", SETTINGS.enrich_stock_pages or args.enrich)
    LOGGER.info("NIFTY 100 only  : %s%s", nifty100_only,
                f" (symbols file: {args.symbols_file})" if args.symbols_file else "")
    LOGGER.info("=" * 60)

    db = ReportDatabase(SETTINGS.sqlite_path)
    try:
        crawler = Crawler(
            resume=not args.no_resume,
            nifty100_only=nifty100_only,
            nifty100_symbols_file=args.symbols_file,
            nifty100_refresh=args.refresh_nifty100,
            cutoff_date=effective_cutoff,
            max_pages=args.max_pages,
        )
    except RuntimeError as exc:
        LOGGER.error(str(exc))
        db.close()
        return 1

    all_batches_for_enrich = []
    try:
        for batch in crawler.crawl():
            db.upsert_many(batch)
            all_batches_for_enrich.extend(batch)
    except KeyboardInterrupt:
        LOGGER.warning("Interrupted by user - progress is checkpointed, rerun to resume.")
    except Exception:
        LOGGER.exception("Unhandled error during crawl - progress is checkpointed, rerun to resume.")

    if SETTINGS.enrich_stock_pages and all_batches_for_enrich:
        try:
            crawler.enrich_stock_pages(all_batches_for_enrich)
            db.upsert_many(all_batches_for_enrich)
        except Exception:
            LOGGER.exception("Enrichment pass failed; continuing without it.")

    LOGGER.info(
        "Crawl finished. pages=%d reports=%d duplicates=%d non_nifty100_skipped=%d errors=%d",
        crawler.stats["pages_scraped"], crawler.stats["reports_scraped"],
        crawler.stats["duplicates_removed"], crawler.stats["nifty100_filtered_out"],
        crawler.stats["errors"],
    )

    records = db.fetch_all_as_records()
    df = export(records)
    print_validation_report(df, crawler.stats)

    if postgres_enabled:
        if len(df) > 0:
            LOGGER.info("Persistence step: writing processed output to %s.%s",
                        SETTINGS.db_schema, SETTINGS.db_table)
            try:
                upsert_reports(df.to_dict("records"))
            except PostgresStorageError as exc:
                # Local CSV/Parquet/SQLite output is already written and
                # stays intact; database storage is best-effort here.
                LOGGER.error(
                    "PostgreSQL persistence failed this run (local output is intact): %s",
                    exc,
                )
            except Exception:
                LOGGER.exception("Unexpected error during PostgreSQL persistence")
        else:
            LOGGER.warning("No processed rows to persist to PostgreSQL; skipping DB write.")
    else:
        LOGGER.info("PostgreSQL persistence disabled (POSTGRES_ENABLED=false or --no-postgres).")

    db.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
