from __future__ import annotations

import json
import uuid
from datetime import date, timedelta
from typing import Any

from .events import append_event


class Scheduler:
    def __init__(self, db: Any, settings: Any) -> None:
        self.db, self.settings, self.schema = db, settings, settings.PAPER_TRADING_SCHEMA

    def finalize_target_windows(self, session_date: date) -> dict[str, int]:
        """Close analytical target windows without waiting for a future market bar.

        Intraday targets expire after their entry session. Swing targets use the
        product's long observation boundary and expire only after 30 observed
        trading sessions. HIT/CLOSED_AT_TARGET rows are immutable.
        """
        with self.db.connection() as conn:
            conn.execute(
                "SELECT pg_advisory_xact_lock(hashtext(%s))",
                (f"paper-target-finalize:{session_date}",),
            )
            inferred = conn.execute(
                f"""WITH implied AS (
                       SELECT lower_track.target_track_id,
                              min(higher_track.first_hit_at) AS implied_hit_at
                         FROM {self.schema}.target_tracks lower_track
                         JOIN {self.schema}.target_definitions lower_def
                           ON lower_def.target_definition_id=lower_track.target_definition_id
                         JOIN {self.schema}.target_definitions higher_def
                           ON higher_def.trade_group_id=lower_def.trade_group_id
                          AND higher_def.lifecycle=lower_def.lifecycle
                          AND higher_def.target_pct>lower_def.target_pct
                         JOIN {self.schema}.target_tracks higher_track
                           ON higher_track.target_definition_id=higher_def.target_definition_id
                          AND higher_track.trade_leg_id=lower_track.trade_leg_id
                        WHERE higher_track.status IN ('HIT','CLOSED_AT_TARGET')
                          AND higher_track.first_hit_at IS NOT NULL
                        GROUP BY lower_track.target_track_id
                     )
                     UPDATE {self.schema}.target_tracks t
                        SET status='CLOSED_AT_TARGET',
                            first_hit_at=LEAST(COALESCE(t.first_hit_at,implied.implied_hit_at),implied.implied_hit_at),
                            result_kind='INFERRED_MONOTONIC',version=t.version+1
                       FROM implied
                      WHERE t.target_track_id=implied.target_track_id
                        AND (t.status NOT IN ('HIT','CLOSED_AT_TARGET') OR t.first_hit_at>implied.implied_hit_at)
                  RETURNING t.target_track_id"""
            ).fetchall()
            intraday = conn.execute(
                f"""UPDATE {self.schema}.target_tracks t
                       SET status='NOT_HIT_INTRADAY',version=t.version+1
                      FROM {self.schema}.target_definitions d,
                           {self.schema}.observation_trackers o
                     WHERE t.target_definition_id=d.target_definition_id
                       AND t.trade_leg_id=o.trade_leg_id
                       AND t.status='ACTIVE'
                       AND d.lifecycle='INTRADAY'
                       AND o.entry_session IS NOT NULL
                       AND o.entry_session<=%s
                       AND o.bars_observed>0
                 RETURNING t.target_track_id""",
                (session_date,),
            ).fetchall()
            swing = conn.execute(
                f"""UPDATE {self.schema}.target_tracks t
                       SET status='TIMED_OUT',version=t.version+1
                      FROM {self.schema}.target_definitions d,
                           {self.schema}.observation_trackers o
                     WHERE t.target_definition_id=d.target_definition_id
                       AND t.trade_leg_id=o.trade_leg_id
                       AND t.status='ACTIVE'
                       AND d.lifecycle='SWING'
                       AND o.sessions_observed>=30
                 RETURNING t.target_track_id"""
            ).fetchall()
            return {
                "targets_inferred_monotonic": len(inferred),
                "intraday_missed": len(intraday),
                "swing_timed_out": len(swing),
            }

    def daily(self, session_date: date, revision: int = 1) -> dict[str, Any]:
        target_finalization = self.finalize_target_windows(session_date)
        with self.db.connection() as conn:
            conn.execute("SELECT pg_advisory_xact_lock(hashtext(%s))", (f"paper-daily:{session_date}",))
            prior = conn.execute(
                f"SELECT sr.summary_run_id,ds.metrics FROM {self.schema}.summary_runs sr JOIN {self.schema}.daily_summaries ds USING(summary_run_id) WHERE sr.account_id=%s AND sr.period_start=%s AND sr.revision=%s",
                (self.settings.DEFAULT_ACCOUNT_ID, session_date, revision),
            ).fetchone()
            if prior:
                return {**prior["metrics"], "target_finalization": target_finalization}
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
            values["target_finalization"] = target_finalization
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
