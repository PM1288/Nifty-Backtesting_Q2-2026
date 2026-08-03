from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from nse_reco_state_aware_engine.core.config import settings
from nse_reco_state_aware_engine.db.conn import db_conn
from nse_reco_state_aware_engine.jobs.runner import (
    ContractMismatch,
    contract_check_or_raise,
    end_run,
    end_step,
    resolve_latest_trade_date,
    start_run,
    start_step,
)
from nse_reco_state_aware_engine.jobs.tasks import run_chain

logger = logging.getLogger(__name__)


def run_job(
    *,
    job_name: str,
    trade_date: Optional[str],
    index_code: str,
    horizon: str,
    steps: List[str],
) -> Dict[str, Any]:
    thresholds = settings.load_thresholds()

    with db_conn() as conn:
        # fail fast on schema/contract issues
        contract_check_or_raise(conn)

        # resolve trade_date if not provided
        if trade_date is None:
            trade_date = resolve_latest_trade_date(conn, index_code=index_code)

        ctx = start_run(conn, job_name, trade_date, meta={"index_code": index_code, "horizon": horizon, "steps": steps})
        conn.commit()
        results: Dict[str, Any] = {"run_id": ctx.run_id, "job_name": job_name, "trade_date": trade_date, "index_code": index_code, "horizon": horizon}

        try:
            # step wrapper: record each top-level step
            for step in steps:
                step_id = start_step(conn, ctx.run_id, step)
                conn.commit()
                try:
                    out = run_chain(conn, trade_date=trade_date, index_code=index_code, horizon=horizon, thresholds=thresholds, steps=[step])
                    end_step(conn, step_id, "SUCCESS", meta={"result": out})
                    conn.commit()
                except ContractMismatch as e:
                    conn.rollback()
                    end_step(conn, step_id, "FAILED", error_code="CONTRACT_MISMATCH", error_detail=str(e)[:2000])
                    conn.commit()
                    raise
                except Exception as e:
                    conn.rollback()
                    end_step(conn, step_id, "FAILED", error_code="STEP_FAILED", error_detail=str(e)[:2000])
                    conn.commit()
                    raise
            end_run(conn, ctx.run_id, "SUCCESS")
            conn.commit()
            return {**results, "status": "SUCCESS"}
        except ContractMismatch as e:
            conn.rollback()
            end_run(conn, ctx.run_id, "FAILED", error_code="CONTRACT_MISMATCH", error_detail=str(e)[:2000])
            conn.commit()
            return {**results, "status": "FAILED", "error_code": "CONTRACT_MISMATCH", "error_detail": str(e)}
        except Exception as e:
            conn.rollback()
            end_run(conn, ctx.run_id, "FAILED", error_code="FAILED", error_detail=str(e)[:2000])
            conn.commit()
            return {**results, "status": "FAILED", "error_code": "FAILED", "error_detail": str(e)}
