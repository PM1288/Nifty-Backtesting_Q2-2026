from __future__ import annotations

import logging
from time import perf_counter
from datetime import date
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query

from nse_reco_state_aware_engine.core.simulator import list_simulation_universe, run_strategy_simulation
from nse_reco_state_aware_engine.db.conn import db_conn

router = APIRouter()
logger = logging.getLogger(__name__)


def _parse_caps(raw: Optional[str]) -> List[float]:
    if not raw:
        return [1_000_000.0, 2_500_000.0, 5_000_000.0]
    caps: List[float] = []
    for item in raw.split(","):
        item = item.strip()
        if not item:
            continue
        try:
            value = float(item)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=f"invalid_capital_caps:{item}") from exc
        if value > 0:
            caps.append(value)
    return caps


@router.get("/universe")
def universe() -> Dict[str, Any]:
    started_at = perf_counter()
    with db_conn() as conn:
        items = list_simulation_universe(conn)
    logger.info("simulator_universe_ok items=%s duration_ms=%.2f", len(items), (perf_counter() - started_at) * 1000.0)
    return {"items": items}


@router.get("")
def simulate(
    symbol: str = Query(..., min_length=1),
    instrument_type: Optional[str] = Query(None, pattern="^(equity|index)$"),
    lot_amount: float = Query(100000.0, gt=0),
    dip_pct: float = Query(1.0, gt=0, le=25),
    target_pct: float = Query(1.25, gt=0, le=50),
    fd_rate_pct: float = Query(7.0, ge=0, le=25),
    lookback_days: int = Query(365, ge=30, le=365),
    capital_caps: Optional[str] = Query(None),
    include_infinite: bool = Query(True),
    end_date: Optional[date] = Query(None),
) -> Dict[str, Any]:
    started_at = perf_counter()
    with db_conn() as conn:
        try:
            payload = run_strategy_simulation(
                conn,
                symbol=symbol,
                instrument_type=instrument_type,  # type: ignore[arg-type]
                lot_amount=lot_amount,
                dip_pct=dip_pct,
                target_pct=target_pct,
                fd_rate_pct=fd_rate_pct,
                lookback_days=lookback_days,
                capital_caps=_parse_caps(capital_caps),
                include_infinite=include_infinite,
                end_date=end_date,
            )
        except ValueError as exc:
            logger.warning(
                "simulator_request_invalid symbol=%s instrument_type=%s lookback_days=%s error=%s duration_ms=%.2f",
                symbol,
                instrument_type,
                lookback_days,
                exc,
                (perf_counter() - started_at) * 1000.0,
            )
            raise HTTPException(status_code=400, detail=str(exc)) from exc
    logger.info(
        "simulator_request_ok symbol=%s instrument_type=%s lookback_days=%s scenarios=%s duration_ms=%.2f",
        payload["symbol"],
        payload["instrument_type"],
        lookback_days,
        len(payload["capital_scenarios"]),
        (perf_counter() - started_at) * 1000.0,
    )
    return payload
