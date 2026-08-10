from __future__ import annotations

import argparse
import json
import logging
import os
import time
from datetime import date, datetime
from pathlib import Path

from .service import IST, VolatilityService


def required(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"{name} is required")
    return value


def service() -> VolatilityService:
    policy = Path(os.getenv("FNO_VOLATILITY_POLICY_PATH", "/app/config/policy.json"))
    return VolatilityService(required("DATABASE_URL"), policy)


def due_slot(now: datetime, slots: list[str], completed: set[str]) -> str | None:
    current = now.strftime("%H:%M")
    eligible = [slot for slot in slots if slot <= current and slot not in completed]
    return eligible[-1] if eligible else None


def run_scheduler(runtime: VolatilityService) -> None:
    completed: dict[date, set[str]] = {}
    schedule = runtime.policy["schedule"]
    while True:
        now = datetime.now(IST)
        today = now.date()
        if runtime.is_trading_day(today):
            done = completed.setdefault(today, set())
            pre = schedule["premarket"]
            if now.strftime("%H:%M") >= pre and f"PRE:{pre}" not in done:
                runtime.run_premarket(today, f"PREMARKET_{pre.replace(':', '')}")
                done.add(f"PRE:{pre}")
            slot = due_slot(now, schedule["live_slots"], done)
            if slot and now.strftime("%H:%M") <= schedule["entry_cutoff"]:
                runtime.run_live(today, now, f"LIVE_{slot.replace(':', '')}")
                done.add(slot)
        for old in list(completed):
            if old != today:
                del completed[old]
        time.sleep(max(5, int(os.getenv("FNO_VOLATILITY_POLL_SECONDS", "30"))))


def main() -> None:
    parser = argparse.ArgumentParser(description="F&O two-gate volatility paper signal service")
    parser.add_argument("command", choices=["migrate", "premarket", "live", "scheduler", "verify-config"])
    parser.add_argument("--trade-date")
    parser.add_argument("--as-of")
    parser.add_argument("--slot")
    args = parser.parse_args()
    logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"), format="%(asctime)s %(levelname)s %(message)s")
    runtime = service()
    try:
        if args.command == "migrate":
            migration = Path(os.getenv("FNO_VOLATILITY_MIGRATION_PATH", "/app/sql/001_fno_volatility.sql"))
            result = runtime.migrate(migration)
        elif args.command == "verify-config":
            result = {
                "status": "PASS",
                "environment": "PAPER",
                "strategy": runtime.policy["strategy_id"],
                "version": runtime.policy["version"],
            }
        elif args.command == "scheduler":
            run_scheduler(runtime)
            return
        else:
            trade_date = date.fromisoformat(args.trade_date) if args.trade_date else datetime.now(IST).date()
            if args.command == "premarket":
                result = runtime.run_premarket(trade_date, args.slot or "PREMARKET_MANUAL")
            else:
                as_of = datetime.fromisoformat(args.as_of).astimezone(IST) if args.as_of else None
                result = runtime.run_live(trade_date, as_of, args.slot or "LIVE_MANUAL")
        print(json.dumps(result, indent=2, default=str))
    finally:
        runtime.close()


if __name__ == "__main__":
    main()
