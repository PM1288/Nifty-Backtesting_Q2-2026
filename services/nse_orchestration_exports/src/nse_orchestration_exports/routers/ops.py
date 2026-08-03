from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from ..db import fetch_all
from ..job_registry import default_jobs
from ..pipeline import run_quality_checks
from ..scheduler_main import run_once

router = APIRouter(prefix="/api/v1/ops", tags=["ops"])


@router.get("/jobs")
def get_jobs() -> dict:
    return {
        "items": [
            {
                "job_key": job.job_key,
                "title": job.title,
                "cron_expr": job.cron_expr,
                "timeout_sec": job.timeout_sec,
                "has_command": bool(job.command_text),
            }
            for job in default_jobs()
        ]
    }


@router.get("/runs")
def get_runs(job_key: str | None = Query(default=None), limit: int = Query(default=100, ge=1, le=1000)) -> dict:
    sql = """
        select run_id, job_key, trigger_type, host_name, status, command_text, requested_at,
               started_at, finished_at, duration_ms, exit_code, stdout_tail, stderr_tail, meta_json
        from nse_ops.job_run
    """
    params = {"limit": limit}
    if job_key:
        sql += " where job_key = %(job_key)s"
        params["job_key"] = job_key
    sql += " order by requested_at desc limit %(limit)s"
    return {"items": fetch_all(sql, params)}


@router.get("/quality")
def get_quality(limit: int = Query(default=100, ge=1, le=1000)) -> dict:
    rows = fetch_all(
        """
        select quality_id, run_id, check_key, severity, passed, observed_value, threshold_value, detail, created_at
        from nse_ops.quality_check_result
        order by created_at desc
        limit %(limit)s
        """,
        {"limit": limit},
    )
    return {"items": rows}


@router.post("/run/{job_key}")
def trigger_job(job_key: str) -> dict:
    try:
        run_once(job_key)
        return {"status": "started", "job_key": job_key}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
