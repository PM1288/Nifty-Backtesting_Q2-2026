from __future__ import annotations

import json
from datetime import date
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query

from nse_reco_state_aware_engine.core.config import settings
from nse_reco_state_aware_engine.db.conn import db_conn, ping
from nse_reco_state_aware_engine.db.sql import fetch_all, fetch_one
from nse_reco_state_aware_engine.jobs.service import run_job

router = APIRouter()


@router.get("/health")
def health() -> Dict[str, Any]:
    with db_conn() as conn:
        try:
            ping(conn)
        except Exception as e:
            raise HTTPException(status_code=503, detail=f"db_unreachable: {e}")
        contract = fetch_one(conn, "SELECT ok, message, missing FROM nse_reco_ops.contract_check()")
        last_runs = fetch_all(
            conn,
            """
            SELECT job_name, trade_date, status, started_at, ended_at, error_code
            FROM nse_reco_ops.job_run
            ORDER BY started_at DESC
            LIMIT 10
            """,
        )
    return {"db": "ok", "contract": contract, "last_runs": last_runs}


@router.post("/run")
def run(
    job_name: str = Query("reco_chain"),
    trade_date: Optional[str] = Query(None, description="YYYY-MM-DD; default resolves from intraday data"),
    index_code: str = Query(settings.DEFAULT_INDEX_CODE),
    horizon: str = Query(settings.DEFAULT_HORIZON),
    steps: str = Query("baselines,regime,anomalies,recommendations,scorecards,watchlists,quality,retention"),
) -> Dict[str, Any]:
    step_list = [s.strip() for s in steps.split(",") if s.strip()]
    result = run_job(job_name=job_name, trade_date=trade_date, index_code=index_code, horizon=horizon, steps=step_list)
    return result
