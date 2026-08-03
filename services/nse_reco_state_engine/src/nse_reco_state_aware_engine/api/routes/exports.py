from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse

from nse_reco_state_aware_engine.core.config import settings
from nse_reco_state_aware_engine.db.conn import db_conn
from nse_reco_state_aware_engine.db.sql import exec_text, fetch_all, fetch_one

router = APIRouter()


@router.get("/manifest")
def manifest(limit: int = Query(50, ge=1, le=500)) -> Dict[str, Any]:
    with db_conn() as conn:
        rows = fetch_all(
            conn,
            """
            SELECT id, created_at, trade_date, kind, format, path, params
            FROM nse_exports.export_manifest
            ORDER BY created_at DESC
            LIMIT :lim
            """,
            {"lim": limit},
        )
    return {"exports": rows}


@router.post("/generate")
def generate(
    kind: str = Query("recommendations", pattern="^(recommendations|watchlist|summary)$"),
    format: str = Query("csv", pattern="^(csv|json)$"),
    trade_date: Optional[str] = Query(None),
    index_code: str = Query(settings.DEFAULT_INDEX_CODE),
    horizon: str = Query(settings.DEFAULT_HORIZON),
    slug: Optional[str] = Query(None),
) -> Dict[str, Any]:
    export_dir = Path(settings.EXPORT_DIR)
    export_dir.mkdir(parents=True, exist_ok=True)

    with db_conn() as conn:
        if trade_date is None:
            row = fetch_one(
                conn,
                """
                SELECT max(trade_date) AS trade_date
                FROM nse_reco.recommendation_snapshot
                WHERE index_code=:idx AND horizon=:h
                """,
                {"idx": index_code, "h": horizon},
            )
            trade_date = str(row["trade_date"]) if row and row.get("trade_date") else None
        if not trade_date:
            raise HTTPException(status_code=404, detail="no_trade_date")

        if kind == "summary":
            data = fetch_one(
                conn,
                "SELECT * FROM nse_reco.v_reco_summary WHERE trade_date=:d AND index_code=:idx AND horizon=:h",
                {"d": trade_date, "idx": index_code, "h": horizon},
            )
        elif kind == "watchlist":
            if not slug:
                raise HTTPException(status_code=400, detail="slug_required")
            data = fetch_one(
                conn,
                "SELECT * FROM nse_reco.watchlist_snapshot WHERE trade_date=:d AND index_code=:idx AND slug=:s",
                {"d": trade_date, "idx": index_code, "s": slug},
            )
        else:
            data = fetch_all(
                conn,
                """
                SELECT trade_date, index_code, horizon, symbol, asof_ts, final_score, action,
                       signal_family, signal_quality, direction, accent_token, arrow, explanation
                FROM nse_reco.recommendation_snapshot
                WHERE trade_date=:d AND index_code=:idx AND horizon=:h
                ORDER BY final_score DESC
                LIMIT :lim
                """,
                {"d": trade_date, "idx": index_code, "h": horizon, "lim": settings.MAX_EXPORT_ROWS},
            )

        fname = f"{kind}_{index_code.replace(' ','_')}_{trade_date}_{horizon}.{format}"
        path = export_dir / fname

        if format == "json":
            path.write_text(json.dumps(data, default=str), encoding="utf-8")
        else:
            # csv
            import csv, io
            output = io.StringIO()
            if isinstance(data, list) and data:
                writer = csv.DictWriter(output, fieldnames=list(data[0].keys()))
                writer.writeheader()
                for r in data:
                    if isinstance(r.get("explanation"), (dict, list)):
                        r["explanation"] = json.dumps(r["explanation"], default=str)
                    writer.writerow(r)
            elif isinstance(data, dict) and data:
                writer = csv.writer(output)
                for k, v in data.items():
                    writer.writerow([k, v])
            path.write_text(output.getvalue(), encoding="utf-8")

        exec_text(
            conn,
            """
            INSERT INTO nse_exports.export_manifest(trade_date, kind, format, path, params)
            VALUES(:d, :k, :f, :p, CAST(:params AS jsonb))
            """,
            {"d": trade_date, "k": kind, "f": format, "p": str(path), "params": json.dumps({"index_code": index_code, "horizon": horizon, "slug": slug}, default=str)},
        )
        conn.commit()

    return {"trade_date": trade_date, "path": str(path), "filename": fname}


@router.get("/download")
def download(export_id: int = Query(...)) -> FileResponse:
    with db_conn() as conn:
        row = fetch_one(conn, "SELECT path FROM nse_exports.export_manifest WHERE id=:id", {"id": export_id})
    if not row:
        raise HTTPException(status_code=404, detail="not_found")
    path = row["path"]
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="file_missing")
    return FileResponse(path)
