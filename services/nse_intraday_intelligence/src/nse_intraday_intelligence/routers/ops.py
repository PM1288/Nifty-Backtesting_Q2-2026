from __future__ import annotations

from datetime import date

from fastapi import APIRouter, HTTPException, Query

from ..db import fetch_all
from ..pipeline import get_live_guard_status, run_job_key

router = APIRouter(prefix="/api/v1/intraday/ops", tags=["intraday-ops"])


@router.get("/status")
def get_status(limit: int = Query(default=20, ge=1, le=200)) -> dict:
    try:
        jobs = fetch_all(
            '''
            select job_key, title, cron_expr, enabled, updated_at
            from nse_ops.job_definition
            where job_key like 'intraday_%%'
            order by job_key
            '''
        )
        runs = fetch_all(
            '''
            select run_id, job_key, trigger_type, status, requested_at, started_at, finished_at, duration_ms, exit_code
            from nse_ops.job_run
            where job_key like 'intraday_%%'
            order by requested_at desc
            limit %(limit)s
            ''',
            {"limit": limit},
        )
        guards = get_live_guard_status()
        try:
            alert_states = fetch_all(
                """
                select
                  alert_key,
                  status,
                  severity,
                  message,
                  last_observed_at,
                  last_status_change_at,
                  last_alert_at,
                  last_recovery_at,
                  updated_at
                from nse_ops.alert_state_intraday
                order by
                  case status when 'alerting' then 0 else 1 end,
                  updated_at desc,
                  alert_key
                """
            )
        except Exception:
            alert_states = []
        return {"jobs": jobs, "runs": runs, "guards": guards, "alert_states": alert_states}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/run/{job_key}")
def run_job(
    job_key: str,
    trade_date: date | None = Query(default=None),
    index_code: str | None = Query(default=None),
    days: int | None = Query(default=None),
) -> dict:
    try:
        return run_job_key(job_key=job_key, trigger_type="api", trade_date=trade_date, index_code=index_code, days=days)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
