from __future__ import annotations

import argparse
import json
from datetime import date, datetime
from typing import Any

from .common import Runtime, check, run_forever
from .config import Settings
from .planning import plan_daily_jobs

SERVICE = "market-status-scheduler"


class Scheduler(Runtime):
    def __init__(self, settings: Settings) -> None:
        super().__init__(settings, SERVICE)

    def sync_calendar(self, conn: Any, trade_date: date) -> dict[str, Any] | None:
        row = conn.execute(
            "SELECT * FROM market_status.exchange_session_calendar WHERE trade_date=%s", (trade_date,)
        ).fetchone()
        if row:
            return dict(row)
        source = conn.execute(
            "SELECT * FROM public.trading_calendar WHERE trade_date=%s", (trade_date,)
        ).fetchone()
        if not source:
            return None
        row = conn.execute(
            """INSERT INTO market_status.exchange_session_calendar
              (trade_date,is_trading_day,regular_open_time,regular_close_trigger_time,source,session_label)
            VALUES (%s,%s,(%s AT TIME ZONE 'Asia/Kolkata')::time,
              LEAST((%s AT TIME ZONE 'Asia/Kolkata')::time,'15:30:00'::time),
              'public.trading_calendar','REGULAR') RETURNING *""",
            (
                trade_date,
                source["is_trading_day"],
                source["market_open_ts"],
                source["market_close_ts"],
            ),
        ).fetchone()
        return dict(row)

    def snapshot_universe(self, conn: Any, trade_date: date) -> dict[str, Any]:
        existing = conn.execute(
            """SELECT count(*) count,count(DISTINCT symbol_token) tokens
            FROM market_status.effective_universe_member
            WHERE index_symbol='NIFTY50' AND effective_from=%s""",
            (trade_date,),
        ).fetchone()
        if existing and existing["count"]:
            return {"count": int(existing["count"]), "tokens": int(existing["tokens"]), "created": False}
        rows = conn.execute(
            """WITH cash AS (
              SELECT DISTINCT ON (UPPER(REGEXP_REPLACE(tradingsymbol,'-EQ$','')))
                UPPER(REGEXP_REPLACE(tradingsymbol,'-EQ$','')) symbol,symbol_token,name
              FROM public.instruments
              WHERE exchange='NSE' AND COALESCE(instrumenttype,'') IN ('EQ','')
              ORDER BY UPPER(REGEXP_REPLACE(tradingsymbol,'-EQ$','')),updated_at DESC
            )
            SELECT u.symbol,c.symbol_token,c.name display_name
            FROM oiis_live.universe_member u LEFT JOIN cash c ON c.symbol=u.symbol
            WHERE u.is_nifty50 ORDER BY u.symbol"""
        ).fetchall()
        symbols = [row["symbol"] for row in rows]
        tokens = [row["symbol_token"] for row in rows if row["symbol_token"]]
        required = self.settings.required_constituent_count
        if len(rows) != required or len(set(symbols)) != required or len(tokens) != required or len(set(tokens)) != required:
            return {
                "count": len(rows),
                "tokens": len(set(tokens)),
                "created": False,
                "error": "NIFTY50_UNIVERSE_INCOMPLETE",
                "missing": [row["symbol"] for row in rows if not row["symbol_token"]],
            }
        with conn.cursor() as cursor:
            cursor.executemany(
                """INSERT INTO market_status.effective_universe_member
                  (index_symbol,symbol,display_name,symbol_token,effective_from,source,source_version)
                VALUES ('NIFTY50',%s,%s,%s,%s,'oiis_live.universe_member+public.instruments','v1')
                ON CONFLICT DO NOTHING""",
                [(row["symbol"], row["display_name"], row["symbol_token"], trade_date) for row in rows],
            )
        return {"count": required, "tokens": required, "created": True}

    def enqueue(
        self,
        conn: Any,
        *,
        job_name: str,
        trade_date: date,
        slot: str,
        scheduled_for: datetime,
        status: str = "PENDING",
        reason: str | None = None,
        metrics: dict[str, Any] | None = None,
    ) -> bool:
        return bool(
            conn.execute(
                """INSERT INTO market_status.job_run
                  (job_name,trade_date,slot,scheduled_for,status,suppression_reason,completed_at,metrics)
                VALUES (%s,%s,%s,%s,%s,%s,CASE WHEN %s='SUPPRESSED' THEN now() END,%s::jsonb)
                ON CONFLICT DO NOTHING RETURNING id""",
                (job_name, trade_date, slot, scheduled_for, status, reason, status, json.dumps(metrics or {})),
            ).fetchone()
        )

    def tick(self, now: datetime | None = None) -> dict[str, Any]:
        current = (now or datetime.now(self.settings.timezone)).astimezone(self.settings.timezone)
        detail: dict[str, Any] = {"now_ist": current.isoformat(), "enqueued": 0, "suppressed": 0}
        if not self.settings.notifications_enabled:
            detail["disabled"] = True
            return detail
        with self.pool.connection() as conn:
            locked = conn.execute(
                "SELECT pg_try_advisory_xact_lock(hashtext('market-status-scheduler-v1')) acquired"
            ).fetchone()["acquired"]
            if not locked:
                return {**detail, "lock_acquired": False}
            calendar = self.sync_calendar(conn, current.date())
            if not calendar or not calendar["is_trading_day"]:
                return {**detail, "trading_day": False}
            detail["trading_day"] = True
            universe = self.snapshot_universe(conn, current.date())
            detail["universe"] = universe
            for planned in plan_daily_jobs(current, calendar, self.settings):
                created = self.enqueue(
                    conn,
                    job_name=planned.job_name,
                    trade_date=current.date(),
                    slot=planned.slot,
                    scheduled_for=planned.scheduled_for,
                    status=planned.status,
                    reason=planned.reason,
                    metrics=planned.metrics,
                )
                detail["suppressed" if planned.status == "SUPPRESSED" else "enqueued"] += int(created)
        return detail


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=("run", "tick", "check"))
    parser.add_argument("--at", type=datetime.fromisoformat)
    args = parser.parse_args()
    runtime = Scheduler(Settings())
    try:
        if args.command == "run":
            run_forever(runtime, runtime.tick)
        elif args.command == "tick":
            value = args.at
            if value and value.tzinfo is None:
                value = value.replace(tzinfo=runtime.settings.timezone)
            print(json.dumps(runtime.tick(value), indent=2, default=str))
        else:
            check(runtime)
    finally:
        runtime.close()


if __name__ == "__main__":
    main()
