from __future__ import annotations

import csv
import io
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import JSONResponse, StreamingResponse

from nse_reco_state_aware_engine.core.config import settings
from nse_reco_state_aware_engine.db.conn import db_conn
from nse_reco_state_aware_engine.db.sql import fetch_all, fetch_one

router = APIRouter()


@router.get("/summary")
def summary(
    trade_date: Optional[str] = Query(None),
    index_code: str = Query(settings.DEFAULT_INDEX_CODE),
    horizon: str = Query(settings.DEFAULT_HORIZON),
) -> Dict[str, Any]:
    with db_conn() as conn:
        if trade_date is None:
            row = fetch_one(
                conn,
                "SELECT max(trade_date) AS trade_date FROM nse_reco.v_reco_summary WHERE index_code=:idx AND horizon=:h",
                {"idx": index_code, "h": horizon},
            )
            trade_date = str(row["trade_date"]) if row and row.get("trade_date") else None
        if not trade_date:
            raise HTTPException(status_code=404, detail="no_trade_date")
        summ = fetch_one(
            conn,
            "SELECT * FROM nse_reco.v_reco_summary WHERE trade_date=:d AND index_code=:idx AND horizon=:h",
            {"d": trade_date, "idx": index_code, "h": horizon},
        )
        regime = fetch_one(
            conn,
            "SELECT * FROM nse_reco.market_regime_snapshot WHERE trade_date=:d AND index_code=:idx",
            {"d": trade_date, "idx": index_code},
        )
        top = fetch_all(
            conn,
            """
            SELECT symbol, final_score, action, signal_family, direction, accent_token, arrow
            FROM nse_reco.recommendation_snapshot
            WHERE trade_date=:d AND index_code=:idx AND horizon=:h
            ORDER BY final_score DESC
            LIMIT 20
            """,
            {"d": trade_date, "idx": index_code, "h": horizon},
        )
    return {"trade_date": trade_date, "index_code": index_code, "horizon": horizon, "summary": summ, "regime": regime, "top": top}


@router.get("/recommendations")
def recommendations(
    trade_date: Optional[str] = Query(None),
    index_code: str = Query(settings.DEFAULT_INDEX_CODE),
    horizon: str = Query(settings.DEFAULT_HORIZON),
    action: Optional[str] = Query(None),
    limit: int = Query(200, ge=1, le=2000),
    format: str = Query("json", pattern="^(json|csv)$"),
) -> Any:
    with db_conn() as conn:
        if trade_date is None:
            row = fetch_one(
                conn,
                "SELECT max(trade_date) AS trade_date FROM nse_reco.recommendation_snapshot WHERE index_code=:idx AND horizon=:h",
                {"idx": index_code, "h": horizon},
            )
            trade_date = str(row["trade_date"]) if row and row.get("trade_date") else None
        if not trade_date:
            raise HTTPException(status_code=404, detail="no_trade_date")

        params = {"d": trade_date, "idx": index_code, "h": horizon, "lim": limit}
        where = "WHERE trade_date=:d AND index_code=:idx AND horizon=:h"
        if action:
            where += " AND action=:a"
            params["a"] = action

        rows = fetch_all(
            conn,
            f"""
            SELECT trade_date, index_code, horizon, symbol, asof_ts, final_score, action,
                   signal_family, signal_quality, direction, accent_token, arrow, explanation
            FROM nse_reco.recommendation_snapshot
            {where}
            ORDER BY final_score DESC
            LIMIT :lim
            """,
            params,
        )

    if format == "json":
        return {"trade_date": trade_date, "index_code": index_code, "horizon": horizon, "rows": rows}

    # CSV
    def gen() -> Any:
        output = io.StringIO()
        if rows:
            writer = csv.DictWriter(output, fieldnames=list(rows[0].keys()))
            writer.writeheader()
            for r in rows:
                # keep JSONB as compact string
                if "explanation" in r and isinstance(r["explanation"], (dict, list)):
                    r["explanation"] = str(r["explanation"])
                writer.writerow(r)
        yield output.getvalue()

    return StreamingResponse(gen(), media_type="text/csv")


@router.get("/anomalies")
def anomalies(
    trade_date: Optional[str] = Query(None),
    index_code: str = Query(settings.DEFAULT_INDEX_CODE),
    scope: str = Query("single_stock", pattern="^(single_stock|cross_section|market)$"),
    limit: int = Query(200, ge=1, le=2000),
) -> Dict[str, Any]:
    with db_conn() as conn:
        if trade_date is None:
            row = fetch_one(
                conn,
                """
                SELECT max(a.trade_date) AS trade_date
                FROM nse_reco.anomaly_event a
                JOIN nse_reco.market_regime_snapshot r
                  ON r.trade_date = a.trade_date
                 AND r.index_code = :idx
                WHERE a.scope = :s
                """,
                {"s": scope, "idx": index_code},
            )
            trade_date = str(row["trade_date"]) if row and row.get("trade_date") else None
        if not trade_date:
            raise HTTPException(status_code=404, detail="no_trade_date")
        rows = fetch_all(
            conn,
            """
            SELECT trade_date, ts, scope, key, severity, score, reason, details
            FROM nse_reco.anomaly_event
            WHERE trade_date=:d AND scope=:s
            ORDER BY created_at DESC
            LIMIT :lim
            """,
            {"d": trade_date, "s": scope, "lim": limit},
        )
    return {"trade_date": trade_date, "scope": scope, "rows": rows}


@router.get("/scorecards")
def scorecards(
    index_code: str = Query(settings.DEFAULT_INDEX_CODE),
    horizon: str = Query(settings.DEFAULT_HORIZON),
    limit: int = Query(400, ge=1, le=5000),
) -> Dict[str, Any]:
    with db_conn() as conn:
        latest_regimes = fetch_all(
            conn,
            """
            SELECT DISTINCT regime
            FROM nse_reco.market_regime_snapshot
            WHERE index_code=:idx
            """,
            {"idx": index_code},
        )
        regime_names = [str(row["regime"]) for row in latest_regimes]
        rows = fetch_all(
            conn,
            """
            SELECT horizon, regime, signal_family, sample_count, win_rate, avg_return_pct, p50_return_pct, updated_at
            FROM nse_reco.bucket_scorecard
            WHERE horizon=:h
              AND (:regimes_is_empty OR regime = ANY(:regimes))
            ORDER BY avg_return_pct DESC
            LIMIT :lim
            """,
            {"h": horizon, "lim": limit, "regimes": regime_names, "regimes_is_empty": len(regime_names) == 0},
        )
    return {"index_code": index_code, "horizon": horizon, "rows": rows}


@router.get("/watchlists")
def watchlists() -> Dict[str, Any]:
    with db_conn() as conn:
        defs = fetch_all(conn, "SELECT slug, name, description FROM nse_reco.watchlist_def ORDER BY slug")
    return {"watchlists": defs}


@router.get("/watchlists/{slug}")
def watchlist(slug: str, trade_date: Optional[str] = Query(None), index_code: str = Query(settings.DEFAULT_INDEX_CODE)) -> Dict[str, Any]:
    with db_conn() as conn:
        if trade_date is None:
            row = fetch_one(
                conn,
                "SELECT max(trade_date) AS trade_date FROM nse_reco.watchlist_snapshot WHERE slug=:s AND index_code=:idx",
                {"s": slug, "idx": index_code},
            )
            trade_date = str(row["trade_date"]) if row and row.get("trade_date") else None
        if not trade_date:
            raise HTTPException(status_code=404, detail="no_trade_date")
        snap = fetch_one(
            conn,
            "SELECT * FROM nse_reco.watchlist_snapshot WHERE trade_date=:d AND index_code=:idx AND slug=:s",
            {"d": trade_date, "idx": index_code, "s": slug},
        )
    return {"trade_date": trade_date, "index_code": index_code, "slug": slug, "snapshot": snap}
