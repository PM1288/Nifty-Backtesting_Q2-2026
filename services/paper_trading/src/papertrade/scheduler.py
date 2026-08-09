from __future__ import annotations

import json
import uuid
from datetime import date, timedelta
from typing import Any

from .events import append_event


class Scheduler:
    def __init__(self, db: Any, settings: Any) -> None:
        self.db, self.settings, self.schema = db, settings, settings.PAPER_TRADING_SCHEMA

    def daily(self, session_date: date, revision: int = 1) -> dict[str, Any]:
        with self.db.connection() as conn:
            conn.execute("SELECT pg_advisory_xact_lock(hashtext(%s))", (f"paper-daily:{session_date}",))
            prior = conn.execute(
                f"SELECT sr.summary_run_id,ds.metrics FROM {self.schema}.summary_runs sr JOIN {self.schema}.daily_summaries ds USING(summary_run_id) WHERE sr.account_id=%s AND sr.period_start=%s AND sr.revision=%s",
                (self.settings.DEFAULT_ACCOUNT_ID, session_date, revision),
            ).fetchone()
            if prior:
                return prior["metrics"]
            metrics = conn.execute(
                f"""SELECT
              (SELECT count(*) FROM {self.schema}.trade_intents WHERE account_id=%s AND (received_at AT TIME ZONE %s)::date=%s) requests_received,
              (SELECT count(*) FROM {self.schema}.trade_intents WHERE account_id=%s AND status='ACCEPTED' AND (received_at AT TIME ZONE %s)::date=%s) requests_accepted,
              (SELECT count(*) FROM {self.schema}.trade_groups WHERE account_id=%s AND opened_at IS NOT NULL AND (opened_at AT TIME ZONE %s)::date=%s) groups_opened,
              (SELECT count(*) FROM {self.schema}.trade_groups WHERE account_id=%s AND fully_closed AND (closed_at AT TIME ZONE %s)::date=%s) groups_closed,
              (SELECT coalesce(sum(amount),0) FROM {self.schema}.pnl_ledger WHERE account_id=%s AND entry_kind='REALISED_GROSS' AND (effective_at AT TIME ZONE %s)::date=%s) gross_realised_pnl,
              (SELECT coalesce(sum(amount),0) FROM {self.schema}.charge_ledger WHERE account_id=%s AND (effective_at AT TIME ZONE %s)::date=%s) trading_costs,
              (SELECT coalesce(sum(provision_amount),0) FROM {self.schema}.income_tax_provision_ledger WHERE account_id=%s AND (effective_at AT TIME ZONE %s)::date=%s) income_tax_provision,
              (SELECT count(*) FROM {self.schema}.target_hits h JOIN {self.schema}.target_tracks t USING(target_track_id) JOIN {self.schema}.trade_legs l USING(trade_leg_id) JOIN {self.schema}.trade_groups g USING(trade_group_id) WHERE g.account_id=%s AND (h.hit_at AT TIME ZONE %s)::date=%s) analytical_targets_hit
            """,
                tuple(
                    x
                    for _ in range(8)
                    for x in (self.settings.DEFAULT_ACCOUNT_ID, self.settings.EXCHANGE_TIMEZONE, session_date)
                ),
            ).fetchone()
            values = {k: str(v) if hasattr(v, "as_tuple") else v for k, v in metrics.items()}
            values["activity_status"] = "NO_ACTIVITY" if values["requests_received"] == 0 else "ACTIVE"
            values["environment"] = "PAPER"
            run_id = str(uuid.uuid4())
            conn.execute(
                f"INSERT INTO {self.schema}.summary_runs(summary_run_id,account_id,summary_type,period_start,period_end,revision,status,completed_at) VALUES (%s,%s,'DAILY',%s,%s,%s,'COMPLETE',now())",
                (run_id, self.settings.DEFAULT_ACCOUNT_ID, session_date, session_date, revision),
            )
            conn.execute(
                f"INSERT INTO {self.schema}.daily_summaries(summary_run_id,session_date,activity_status,metrics) VALUES (%s,%s,%s,%s::jsonb)",
                (run_id, session_date, values["activity_status"], json.dumps(values)),
            )
            aggregate = str(
                uuid.uuid5(
                    uuid.NAMESPACE_URL, f"daily:{self.settings.DEFAULT_ACCOUNT_ID}:{session_date}:{revision}"
                )
            )
            conn.execute(
                f"INSERT INTO {self.schema}.trade_groups(trade_group_id,account_id,client_group_id,strategy_id,strategy_version,asset_class,expected_leg_count,entry_policy,close_policy,performance_basis_type,status) VALUES (%s,%s,%s,'SYSTEM','1','EQUITY',1,'INDEPENDENT','INDEPENDENT','ENTRY_NOTIONAL','CLOSED') ON CONFLICT DO NOTHING",
                (aggregate, self.settings.DEFAULT_ACCOUNT_ID, f"daily-{session_date}-{revision}"),
            )
            append_event(
                conn,
                self.schema,
                "summary",
                aggregate,
                "com.papertrading.summary.daily_corrected.v1"
                if revision > 1
                else "com.papertrading.summary.daily.v1",
                str(uuid.uuid4()),
                {"event_name": "summary.daily", "summary": values},
            )
            return values

    def weekly(self, week_end: date, revision: int = 1) -> dict[str, Any]:
        week_start = week_end - timedelta(days=6)
        with self.db.connection() as conn:
            conn.execute(
                "SELECT pg_advisory_xact_lock(hashtext(%s))", (f"paper-weekly:{week_start}:{week_end}",)
            )
            prior = conn.execute(
                f"SELECT ws.metrics FROM {self.schema}.summary_runs sr JOIN {self.schema}.weekly_summaries ws USING(summary_run_id) WHERE sr.account_id=%s AND sr.period_start=%s AND sr.period_end=%s AND sr.revision=%s",
                (self.settings.DEFAULT_ACCOUNT_ID, week_start, week_end, revision),
            ).fetchone()
            if prior:
                return prior["metrics"]
            rows = conn.execute(
                f"SELECT ds.metrics FROM {self.schema}.summary_runs sr JOIN {self.schema}.daily_summaries ds USING(summary_run_id) WHERE sr.account_id=%s AND sr.period_start BETWEEN %s AND %s AND sr.status='COMPLETE'",
                (self.settings.DEFAULT_ACCOUNT_ID, week_start, week_end),
            ).fetchall()
            metrics = {
                "environment": "PAPER",
                "week_start": str(week_start),
                "week_end": str(week_end),
                "completed_sessions": len(rows),
                "requests_received": sum(int(x["metrics"].get("requests_received", 0)) for x in rows),
                "groups_closed": sum(int(x["metrics"].get("groups_closed", 0)) for x in rows),
                "gross_realised_pnl": str(
                    sum(
                        __import__("decimal").Decimal(str(x["metrics"].get("gross_realised_pnl", 0)))
                        for x in rows
                    )
                ),
                "trading_costs": str(
                    sum(
                        __import__("decimal").Decimal(str(x["metrics"].get("trading_costs", 0))) for x in rows
                    )
                ),
                "income_tax_provision": str(
                    sum(
                        __import__("decimal").Decimal(str(x["metrics"].get("income_tax_provision", 0)))
                        for x in rows
                    )
                ),
            }
            run_id = str(uuid.uuid4())
            conn.execute(
                f"INSERT INTO {self.schema}.summary_runs(summary_run_id,account_id,summary_type,period_start,period_end,revision,status,completed_at) VALUES (%s,%s,'WEEKLY',%s,%s,%s,'COMPLETE',now())",
                (run_id, self.settings.DEFAULT_ACCOUNT_ID, week_start, week_end, revision),
            )
            conn.execute(
                f"INSERT INTO {self.schema}.weekly_summaries(summary_run_id,week_start,week_end,metrics) VALUES (%s,%s,%s,%s::jsonb)",
                (run_id, week_start, week_end, json.dumps(metrics)),
            )
            aggregate = str(
                uuid.uuid5(
                    uuid.NAMESPACE_URL,
                    f"weekly:{self.settings.DEFAULT_ACCOUNT_ID}:{week_start}:{week_end}:{revision}",
                )
            )
            append_event(
                conn,
                self.schema,
                "summary",
                aggregate,
                "com.papertrading.summary.weekly_corrected.v1"
                if revision > 1
                else "com.papertrading.summary.weekly.v1",
                str(uuid.uuid4()),
                {"event_name": "summary.weekly", "summary": metrics},
            )
            return metrics
