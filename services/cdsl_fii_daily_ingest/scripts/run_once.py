from __future__ import annotations

import argparse
import json
import logging
import sys
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.calendar import TradingCalendar
from app.config import load_settings
from app.db import connect, ensure_tables, target_date_exists, upsert_derivative_rows, upsert_investment_rows
from app.ingest import available_market_dates, fetch_tables, parse_derivative_rows, parse_investment_rows


LOGGER = logging.getLogger("cdsl_fii_daily.run_once")


def _safe_parse_date(value: object):
    try:
        return datetime.strptime(str(value).strip(), "%d-%b-%Y").date()
    except ValueError:
        return None


def _resolve_target_date(mode: str, target_date_raw: str | None, calendar: TradingCalendar, now: datetime):
    if target_date_raw:
        return datetime.strptime(target_date_raw, "%Y-%m-%d").date()
    if mode == "morning":
        return calendar.previous_trading_day(now.date())
    if mode == "evening":
        return now.date()
    raise ValueError("target date is required for manual mode")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=["morning", "evening", "manual"], default="manual")
    parser.add_argument("--target-date")
    parser.add_argument("--skip-existing-check", action="store_true")
    args = parser.parse_args()

    settings = load_settings()
    logging.basicConfig(
        level=settings.log_level,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    now = datetime.now(ZoneInfo(settings.timezone))
    calendar = TradingCalendar(settings.holiday_overrides)
    target_date = _resolve_target_date(args.mode, args.target_date, calendar, now)

    if args.mode == "evening" and not calendar.is_trading_day(target_date):
        LOGGER.info("Skipping evening run for non-trading day %s", target_date.isoformat())
        print(json.dumps({"status": "skipped", "reason": "non_trading_day", "target_date": target_date.isoformat()}))
        return 0

    with connect(settings.database_url) as conn:
        ensure_tables(conn, settings.schema_name)
        if args.mode == "morning" and not args.skip_existing_check and target_date_exists(conn, settings.schema_name, target_date):
            LOGGER.info("Previous trading day %s already present in both tables", target_date.isoformat())
            print(json.dumps({"status": "noop", "reason": "already_present", "target_date": target_date.isoformat()}))
            return 0

        tables = fetch_tables(settings.url, settings.user_agent, settings.timeout_seconds)
        if len(tables) < 2:
            raise RuntimeError(f"Expected at least 2 tables, found {len(tables)}")

        investment_dates = available_market_dates(tables[0], "Reporting Date")
        derivative_dates = sorted(
            {
                parsed
                for value in tables[1].iloc[:, 0].dropna().unique().tolist()
                if (parsed := _safe_parse_date(value)) is not None
            }
        )
        investment_rows = parse_investment_rows(tables[0], target_date, settings.url)
        derivative_rows = parse_derivative_rows(tables[1], target_date, settings.url)

        if not investment_rows or not derivative_rows:
            latest_available = max(investment_dates + derivative_dates) if (investment_dates or derivative_dates) else None
            if args.mode == "morning" and latest_available is not None and latest_available > target_date:
                payload = {
                    "status": "skipped",
                    "reason": "source_advanced_past_target",
                    "target_date": target_date.isoformat(),
                    "latest_available_date": latest_available.isoformat(),
                }
                LOGGER.info("Skipping stale morning recovery: %s", payload)
                print(json.dumps(payload))
                return 0
            raise RuntimeError(
                "Target date not present in CDSL page. "
                f"target_date={target_date.isoformat()} "
                f"investment_dates={[item.isoformat() for item in investment_dates]} "
                f"derivative_dates={[item.isoformat() for item in derivative_dates]}"
            )

        investment_count = upsert_investment_rows(conn, settings.schema_name, investment_rows)
        derivative_count = upsert_derivative_rows(conn, settings.schema_name, derivative_rows)

    payload = {
        "status": "ingested",
        "mode": args.mode,
        "target_date": target_date.isoformat(),
        "investment_rows": investment_count,
        "derivative_rows": derivative_count,
    }
    LOGGER.info("CDSL FII daily ingest completed: %s", payload)
    print(json.dumps(payload))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
