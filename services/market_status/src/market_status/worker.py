from __future__ import annotations

import argparse
import json
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

from .common import Runtime, check, run_forever
from .config import Settings
from .evaluation import (
    EvaluationError,
    close_snapshot,
    index_snapshot,
    membership_delta,
    oiis_candidates,
    rank_movers,
)
from .models import build_envelope

SERVICE = "market-status-worker"
INDEX_TOKEN = "99926000"


class Worker(Runtime):
    def __init__(self, settings: Settings) -> None:
        super().__init__(settings, SERVICE)

    def claim_job(self) -> dict[str, Any] | None:
        with self.pool.connection() as conn:
            row = conn.execute(
                """SELECT * FROM market_status.job_run
                WHERE status='PENDING' AND scheduled_for<=now()
                ORDER BY scheduled_for,created_at LIMIT 1 FOR UPDATE SKIP LOCKED"""
            ).fetchone()
            if not row:
                return None
            claimed = conn.execute(
                """UPDATE market_status.job_run SET status='RUNNING',started_at=COALESCE(started_at,now()),
                  updated_at=now() WHERE id=%s AND status='PENDING' RETURNING *""",
                (row["id"],),
            ).fetchone()
            return dict(claimed) if claimed else None

    def finish(
        self,
        job: dict[str, Any],
        *,
        status: str,
        reason: str | None = None,
        data_as_of: datetime | None = None,
        metrics: dict[str, Any] | None = None,
        envelope: Any | None = None,
        fingerprint: str | None = None,
    ) -> None:
        with self.pool.connection() as conn:
            if envelope is not None:
                payload = envelope.model_dump(by_alias=True, mode="json")
                conn.execute(
                    """INSERT INTO market_status.notification_outbox
                      (event_id,event_type,dedupe_key,trade_date,destination_key,source_run_id,
                       semantic_fingerprint,payload,correlation_id)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s::jsonb,%s)
                    ON CONFLICT(dedupe_key) DO NOTHING""",
                    (
                        envelope.event_id,
                        envelope.event_type,
                        envelope.dedupe_key,
                        envelope.trade_date,
                        self.settings.destination_key,
                        job.get("source_run_id"),
                        fingerprint,
                        json.dumps(payload),
                        envelope.correlation_id,
                    ),
                )
            conn.execute(
                """UPDATE market_status.job_run SET status=%s,suppression_reason=%s,
                  source_data_as_of=%s,metrics=metrics||%s::jsonb,completed_at=now(),updated_at=now()
                WHERE id=%s""",
                (status, reason, data_as_of, json.dumps(metrics or {}, default=str), job["id"]),
            )

    def defer(self, job: dict[str, Any], reason: str, deadline: datetime) -> bool:
        now = datetime.now(UTC)
        if now >= deadline.astimezone(UTC):
            self.finish(job, status="FAILED_DATA_QUALITY", reason=reason)
            return False
        with self.pool.connection() as conn:
            conn.execute(
                """UPDATE market_status.job_run SET status='PENDING',scheduled_for=LEAST(%s,now()+interval '5 seconds'),
                  suppression_reason=%s,updated_at=now() WHERE id=%s""",
                (deadline, reason, job["id"]),
            )
        return True

    def latest_index_quote(
        self, job: dict[str, Any], closed_only: bool = False, max_as_of: datetime | None = None
    ) -> dict[str, Any] | None:
        with self.pool.connection() as conn:
            row = conn.execute(
                """SELECT ts,ltp,open,high,low,close,session_phase FROM public.quote_snapshots
                WHERE exchange='NSE' AND symbol_token=%s
                  AND (ts AT TIME ZONE 'Asia/Kolkata')::date=%s
                  AND (%s=false OR session_phase='CLOSED')
                  AND (%s::timestamptz IS NULL OR ts<=%s)
                ORDER BY ts DESC LIMIT 1""",
                (INDEX_TOKEN, job["trade_date"], closed_only, max_as_of, max_as_of),
            ).fetchone()
        return dict(row) if row else None

    def evaluate_open(self, job: dict[str, Any]) -> None:
        deadline = datetime.fromisoformat(job["metrics"]["deadline"])
        if datetime.now(UTC) > deadline.astimezone(UTC):
            self.finish(job, status="SUPPRESSED", reason="MISSED_NOTIFICATION_DEADLINE")
            return
        row = self.latest_index_quote(job, max_as_of=deadline)
        if not row:
            self.defer(job, "INDEX_QUOTE_MISSING", deadline)
            return
        age = (min(datetime.now(UTC), deadline.astimezone(UTC)) - row["ts"].astimezone(UTC)).total_seconds()
        if age > self.settings.index_max_age_seconds:
            self.defer(job, "INDEX_QUOTE_STALE", deadline)
            return
        try:
            payload = index_snapshot(row)
        except EvaluationError as exc:
            self.finish(job, status="FAILED_DATA_QUALITY", reason=exc.reason, metrics=exc.detail)
            return
        payload["data_as_of"] = row["ts"].astimezone(UTC).isoformat()
        payload["source"] = "public.quote_snapshots"
        dedupe = f"market-open:NIFTY50:{job['trade_date']}"
        envelope = build_envelope(
            event_type="market.open.snapshot.v1",
            trade_date=job["trade_date"],
            data_as_of=row["ts"],
            dedupe_key=dedupe,
            source_provider="public.quote_snapshots",
            source_mode="CACHE",
            coverage_count=1,
            expected_count=1,
            max_age_seconds=max(0, int(age)),
            payload=payload,
        )
        self.finish(job, status="COMPLETED", data_as_of=row["ts"], envelope=envelope)

    def universe_quotes(self, job: dict[str, Any], max_as_of: datetime) -> list[dict[str, Any]]:
        with self.pool.connection() as conn:
            rows = conn.execute(
                """WITH effective_date AS (
                  SELECT max(effective_from) value FROM market_status.effective_universe_member
                  WHERE index_symbol='NIFTY50' AND effective_from<=%s
                    AND (effective_to IS NULL OR effective_to>=%s)
                )
                SELECT u.symbol,u.display_name,u.symbol_token,q.ts,q.ltp,q.close
                FROM market_status.effective_universe_member u
                JOIN effective_date e ON e.value=u.effective_from
                LEFT JOIN LATERAL (
                  SELECT ts,ltp,close FROM public.quote_snapshots
                  WHERE exchange=u.exchange AND symbol_token=u.symbol_token
                    AND (ts AT TIME ZONE 'Asia/Kolkata')::date=%s
                    AND ts<=%s
                  ORDER BY ts DESC LIMIT 1
                ) q ON true
                WHERE u.index_symbol='NIFTY50' ORDER BY u.symbol""",
                (job["trade_date"], job["trade_date"], job["trade_date"], max_as_of),
            ).fetchall()
        return [dict(row) for row in rows]

    def evaluate_movers(self, job: dict[str, Any]) -> None:
        deadline = datetime.fromisoformat(job["metrics"]["deadline"])
        if datetime.now(UTC) > deadline.astimezone(UTC):
            self.finish(job, status="SUPPRESSED", reason="MISSED_NOTIFICATION_DEADLINE")
            return
        rows = self.universe_quotes(job, deadline)
        required = self.settings.required_constituent_count
        missing = [row["symbol"] for row in rows if row["ts"] is None or row["ltp"] is None or row["close"] is None]
        stale = [
            row["symbol"]
            for row in rows
            if row["ts"] is not None
            and (min(datetime.now(UTC), deadline.astimezone(UTC)) - row["ts"].astimezone(UTC)).total_seconds()
            > self.settings.constituent_max_age_seconds
        ]
        if len(rows) != required:
            self.defer(job, "NIFTY50_UNIVERSE_INCOMPLETE", deadline)
            return
        if missing:
            if not self.defer(job, "CONSTITUENT_QUOTE_MISSING", deadline):
                with self.pool.connection() as conn:
                    conn.execute(
                        "UPDATE market_status.job_run SET metrics=metrics||%s::jsonb WHERE id=%s",
                        (json.dumps({"missing_symbols": missing}), job["id"]),
                    )
            return
        if stale:
            if not self.defer(job, "CONSTITUENT_QUOTE_STALE", deadline):
                with self.pool.connection() as conn:
                    conn.execute(
                        "UPDATE market_status.job_run SET metrics=metrics||%s::jsonb WHERE id=%s",
                        (json.dumps({"stale_symbols": stale}), job["id"]),
                    )
            return
        fresh_count = len(rows) - len(missing) - len(stale)
        if fresh_count != self.settings.required_fresh_quote_count:
            self.finish(
                job,
                status="FAILED_DATA_QUALITY",
                reason="MOVERS_COVERAGE_INCOMPLETE",
                metrics={
                    "fresh_quote_count": fresh_count,
                    "required_fresh_quote_count": self.settings.required_fresh_quote_count,
                },
            )
            return
        try:
            gainers, losers = rank_movers(rows, self.settings.movers_count)
        except EvaluationError as exc:
            self.finish(job, status="FAILED_DATA_QUALITY", reason=exc.reason, metrics=exc.detail)
            return
        data_as_of = min(row["ts"] for row in rows)
        max_age = max(
            int((min(datetime.now(UTC), deadline.astimezone(UTC)) - row["ts"].astimezone(UTC)).total_seconds())
            for row in rows
        )
        payload = {
            "index_symbol": "NIFTY50",
            "gainers": gainers,
            "losers": losers,
            "universe_count": required,
            "fresh_quote_count": len(rows),
            "data_as_of": data_as_of.astimezone(UTC).isoformat(),
            "ranking_basis": "PREVIOUS_OFFICIAL_CLOSE",
        }
        dedupe = f"market-movers:NIFTY50:{job['trade_date']}:09:20"
        envelope = build_envelope(
            event_type="market.movers.snapshot.v1",
            trade_date=job["trade_date"],
            data_as_of=data_as_of,
            dedupe_key=dedupe,
            source_provider="public.quote_snapshots+market_status.effective_universe_member",
            source_mode="CACHE",
            coverage_count=len(rows),
            expected_count=required,
            max_age_seconds=max_age,
            payload=payload,
        )
        self.finish(job, status="COMPLETED", data_as_of=data_as_of, envelope=envelope)

    def evaluate_close(self, job: dict[str, Any]) -> None:
        cutoff = datetime.fromisoformat(job["metrics"]["delayed_cutoff"])
        final_not_before = datetime.fromisoformat(job["metrics"]["final_not_before"])
        final_deadline = datetime.fromisoformat(job["metrics"]["final_deadline"])
        row = self.latest_index_quote(job, closed_only=True)
        if not row or row["ts"].astimezone(UTC) < final_not_before.astimezone(UTC):
            self.defer(job, "EOD_NOT_FINAL", cutoff)
            return
        try:
            payload = close_snapshot(row)
        except EvaluationError as exc:
            self.finish(job, status="FAILED_DATA_QUALITY", reason=exc.reason, metrics=exc.detail)
            return
        payload["data_as_of"] = row["ts"].astimezone(UTC).isoformat()
        dedupe = f"market-close:NIFTY50:{job['trade_date']}"
        envelope = build_envelope(
            event_type="market.close.snapshot.v1",
            trade_date=job["trade_date"],
            data_as_of=row["ts"],
            dedupe_key=dedupe,
            source_provider="SmartAPI CLOSED quote snapshot",
            source_mode="CACHE",
            coverage_count=1,
            expected_count=1,
            max_age_seconds=0,
            payload=payload,
        )
        self.finish(
            job,
            status="COMPLETED",
            data_as_of=row["ts"],
            envelope=envelope,
            metrics={"delayed_finalisation": datetime.now(UTC) > final_deadline.astimezone(UTC)},
        )

    def poll_oiis(self) -> int:
        if not self.settings.oiis_enabled:
            return 0
        with self.pool.connection() as conn:
            state = conn.execute(
                "SELECT state_value FROM market_status.worker_state WHERE state_key='oiis_watermark' FOR UPDATE"
            ).fetchone()
            if not state:
                latest = conn.execute(
                    "SELECT completed_at FROM oiis_live.selection_run WHERE status='COMPLETED' ORDER BY completed_at DESC LIMIT 1"
                ).fetchone()
                conn.execute(
                    """INSERT INTO market_status.worker_state(state_key,state_value)
                    VALUES ('oiis_watermark',jsonb_build_object('completed_at',%s::timestamptz))""",
                    ((latest or {}).get("completed_at") or datetime.now(UTC),),
                )
                return 0
            watermark = datetime.fromisoformat(state["state_value"]["completed_at"])
            run = conn.execute(
                """SELECT * FROM oiis_live.selection_run WHERE status='COMPLETED'
                  AND trade_date=(now() AT TIME ZONE 'Asia/Kolkata')::date AND completed_at>%s
                ORDER BY completed_at ASC LIMIT 1""",
                (watermark,),
            ).fetchone()
            if not run:
                return 0
            age = (datetime.now(UTC) - run["completed_at"].astimezone(UTC)).total_seconds()
            status = "PENDING" if age <= self.settings.oiis_max_run_age_seconds else "SUPPRESSED"
            reason = None if status == "PENDING" else "OIIS_RUN_STALE"
            inserted = conn.execute(
                """INSERT INTO market_status.job_run
                  (job_name,trade_date,slot,source_run_id,scheduled_for,status,suppression_reason,
                   completed_at,metrics)
                VALUES ('OIIS_CANDIDATES',%s,%s,%s,%s,%s,%s,
                  CASE WHEN %s='SUPPRESSED' THEN now() END,jsonb_build_object('run_age_seconds',%s))
                ON CONFLICT DO NOTHING RETURNING id""",
                (
                    run["trade_date"],
                    run["run_slot"],
                    run["run_id"],
                    run["completed_at"],
                    status,
                    reason,
                    status,
                    int(age),
                ),
            ).fetchone()
            conn.execute(
                """UPDATE market_status.worker_state SET
                  state_value=jsonb_build_object('completed_at',%s::timestamptz),updated_at=now()
                WHERE state_key='oiis_watermark'""",
                (run["completed_at"],),
            )
            return int(bool(inserted and status == "PENDING"))

    def evaluate_oiis(self, job: dict[str, Any]) -> None:
        lock_name = f"market-status-oiis:{job['trade_date']}:{self.settings.destination_key}"
        with self.pool.connection() as lock_conn:
            lock_conn.execute("SELECT pg_advisory_lock(hashtext(%s))", (lock_name,))
            try:
                self._evaluate_oiis_locked(job)
            finally:
                lock_conn.execute("SELECT pg_advisory_unlock(hashtext(%s))", (lock_name,))

    def _evaluate_oiis_locked(self, job: dict[str, Any]) -> None:
        with self.pool.connection() as conn:
            run = conn.execute(
                "SELECT * FROM oiis_live.selection_run WHERE run_id=%s AND status='COMPLETED'",
                (job["source_run_id"],),
            ).fetchone()
            rows = conn.execute(
                """SELECT symbol,direction,xfactor_snapshot,ofactor,directional_edge,opportunity_rank,
                  reference_price,canonical_status,data_permission,reason_codes,evidence,universe_flags
                FROM oiis_live.daily_candidate WHERE run_id=%s ORDER BY symbol""",
                (job["source_run_id"],),
            ).fetchall()
            state = conn.execute(
                """SELECT * FROM market_status.notification_state
                WHERE event_family='OIIS_CANDIDATES' AND destination_key=%s AND trade_date=%s FOR UPDATE""",
                (self.settings.destination_key, job["trade_date"]),
            ).fetchone()
        if not run:
            self.finish(job, status="SUPPRESSED", reason="OIIS_RUN_NOT_COMPLETE")
            return
        try:
            longs, shorts, membership, fingerprint = oiis_candidates(
                [dict(row) for row in rows],
                Decimal(self.settings.oiis_x_min_exclusive),
                Decimal(self.settings.oiis_o_min_exclusive),
                self.settings.oiis_max_per_direction,
            )
        except EvaluationError as exc:
            self.finish(job, status="FAILED_DATA_QUALITY", reason=exc.reason, metrics=exc.detail)
            return
        if not longs and not shorts:
            self.finish(
                job,
                status="SUPPRESSED",
                reason="OIIS_NO_QUALIFYING_CANDIDATES",
                metrics={
                    "evaluated_candidates": len(rows),
                    "strict_xfactor_threshold": self.settings.oiis_x_min_exclusive,
                    "strict_ofactor_threshold": self.settings.oiis_o_min_exclusive,
                    "long_members": 0,
                    "short_members": 0,
                },
            )
            return
        previous = dict(state["last_successful_membership"]) if state and state["last_successful_membership"] else None
        if state and state["last_successful_fingerprint"] == fingerprint:
            self.finish(job, status="SUPPRESSED", reason="OIIS_UNCHANGED_MEMBERSHIP")
            return
        with self.pool.connection() as conn:
            inflight = conn.execute(
                """SELECT 1 FROM market_status.notification_outbox
                WHERE trade_date=%s AND destination_key=%s AND semantic_fingerprint=%s
                  AND status IN ('PENDING','SENDING','RETRY') LIMIT 1""",
                (job["trade_date"], self.settings.destination_key, fingerprint),
            ).fetchone()
        if inflight:
            self.finish(job, status="SUPPRESSED", reason="OIIS_IDENTICAL_DELIVERY_IN_FLIGHT")
            return
        added, removed = membership_delta(previous, membership)
        payload = {
            "source_run_id": str(run["run_id"]),
            "source_run_slot": run["run_slot"],
            "source_run_completed_at": run["completed_at"].astimezone(UTC).isoformat(),
            "scoring_rule_version": f"{run['policy_id']}:{run['policy_version']}",
            "trade_date": str(run["trade_date"]),
            "long_candidates": longs,
            "short_candidates": shorts,
            "added_memberships": added,
            "removed_memberships": removed,
            "first_qualifying_scan_of_day": previous is None,
            "data_as_of": run["decision_as_of"].astimezone(UTC).isoformat(),
        }
        dedupe = f"oiis-candidates:{run['run_id']}"
        envelope = build_envelope(
            event_type="market.oiis.candidates.changed.v1",
            trade_date=run["trade_date"],
            data_as_of=run["decision_as_of"],
            dedupe_key=dedupe,
            source_provider="oiis_live.selection_run+daily_candidate",
            source_mode="DATABASE",
            coverage_count=len(rows),
            expected_count=int(run["evaluated_symbols"]),
            max_age_seconds=max(0, int((datetime.now(UTC) - run["completed_at"].astimezone(UTC)).total_seconds())),
            payload=payload,
        )
        self.finish(job, status="COMPLETED", data_as_of=run["decision_as_of"], envelope=envelope, fingerprint=fingerprint)
        with self.pool.connection() as conn:
            conn.execute(
                """INSERT INTO market_status.notification_state
                  (event_family,destination_key,trade_date,last_enqueued_fingerprint,last_enqueued_event_id)
                VALUES ('OIIS_CANDIDATES',%s,%s,%s,%s)
                ON CONFLICT(event_family,destination_key,trade_date) DO UPDATE SET
                  last_enqueued_fingerprint=excluded.last_enqueued_fingerprint,
                  last_enqueued_event_id=excluded.last_enqueued_event_id,updated_at=now()""",
                (self.settings.destination_key, job["trade_date"], fingerprint, envelope.event_id),
            )

    def process_one(self) -> bool:
        job = self.claim_job()
        if not job:
            return False
        try:
            if job["job_name"] == "MARKET_OPEN":
                self.evaluate_open(job)
            elif job["job_name"] == "MARKET_MOVERS":
                self.evaluate_movers(job)
            elif job["job_name"] == "MARKET_CLOSE":
                self.evaluate_close(job)
            else:
                self.evaluate_oiis(job)
        except Exception as exc:
            self.finish(
                job,
                status="FAILED",
                reason="PROCESSING_FAILURE",
                metrics={"error": f"{type(exc).__name__}: {exc}"[:500]},
            )
            raise
        return True

    def tick(self) -> dict[str, Any]:
        if not self.settings.notifications_enabled:
            return {"disabled": True, "jobs_processed": 0, "oiis_jobs_enqueued": 0}
        oiis = self.poll_oiis()
        processed = 0
        while processed < 20 and self.process_one():
            processed += 1
        return {"disabled": False, "jobs_processed": processed, "oiis_jobs_enqueued": oiis}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=("run", "tick", "check"))
    args = parser.parse_args()
    runtime = Worker(Settings())
    try:
        if args.command == "run":
            run_forever(runtime, runtime.tick)
        elif args.command == "tick":
            print(json.dumps(runtime.tick(), indent=2, default=str))
        else:
            check(runtime)
    finally:
        runtime.close()


if __name__ == "__main__":
    main()
