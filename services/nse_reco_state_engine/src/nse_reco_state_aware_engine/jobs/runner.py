from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from sqlalchemy.engine import Connection

from nse_reco_state_aware_engine.db.sql import exec_text, fetch_one

logger = logging.getLogger(__name__)


class ContractMismatch(RuntimeError):
    pass


@dataclass
class RunContext:
    run_id: int
    job_name: str
    trade_date: str | None
    meta: Dict[str, Any]


def start_run(conn: Connection, job_name: str, trade_date: str | None, meta: Dict[str, Any] | None = None) -> RunContext:
    meta = meta or {}
    res = exec_text(
        conn,
        """
        INSERT INTO nse_reco_ops.job_run(job_name, trade_date, status, meta)
        VALUES(:job, :d, 'RUNNING', CAST(:meta AS jsonb))
        RETURNING id;
        """,
        {"job": job_name, "d": trade_date, "meta": json.dumps(meta, default=str)},
    )
    run_id = int(res.scalar_one())
    return RunContext(run_id=run_id, job_name=job_name, trade_date=trade_date, meta=meta)


def end_run(conn: Connection, run_id: int, status: str, error_code: str | None = None, error_detail: str | None = None) -> None:
    exec_text(
        conn,
        """
        UPDATE nse_reco_ops.job_run
        SET status=:s, ended_at=now(), error_code=:ec, error_detail=:ed
        WHERE id=:id
        """,
        {"s": status, "id": run_id, "ec": error_code, "ed": error_detail},
    )


def start_step(conn: Connection, run_id: int, step_name: str, meta: Dict[str, Any] | None = None) -> int:
    meta = meta or {}
    res = exec_text(
        conn,
        """
        INSERT INTO nse_reco_ops.job_step_run(run_id, step_name, status, meta)
        VALUES(:rid, :step, 'RUNNING', CAST(:meta AS jsonb))
        RETURNING id;
        """,
        {"rid": run_id, "step": step_name, "meta": json.dumps(meta, default=str)},
    )
    return int(res.scalar_one())


def end_step(
    conn: Connection,
    step_id: int,
    status: str,
    rows_written: int | None = None,
    error_code: str | None = None,
    error_detail: str | None = None,
    meta: Dict[str, Any] | None = None,
) -> None:
    meta = meta or {}
    exec_text(
        conn,
        """
        UPDATE nse_reco_ops.job_step_run
        SET status=:s, ended_at=now(), rows_written=:rw, error_code=:ec, error_detail=:ed, meta=meta||CAST(:meta AS jsonb)
        WHERE id=:id
        """,
        {"s": status, "rw": rows_written, "ec": error_code, "ed": error_detail, "meta": json.dumps(meta, default=str), "id": step_id},
    )


def contract_check_or_raise(conn: Connection) -> None:
    row = fetch_one(conn, "SELECT ok, message, missing FROM nse_reco_ops.contract_check()")
    if not row or row.get("ok") is not True:
        raise ContractMismatch(str(row.get("missing") if row else "contract_check returned no rows"))


def resolve_latest_trade_date(conn: Connection, index_code: str) -> str:
    row = fetch_one(
        conn,
        """
        SELECT max(trade_date) AS trade_date
        FROM integration.v_market_minute_feature
        WHERE index_code=:idx
        """,
        {"idx": index_code},
    )
    if not row or not row.get("trade_date"):
        raise RuntimeError("Unable to resolve latest trade_date from integration.v_market_minute_feature")
    return str(row["trade_date"])
