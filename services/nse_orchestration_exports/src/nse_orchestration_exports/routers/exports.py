from __future__ import annotations

import mimetypes
from datetime import date
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse, JSONResponse, Response

from ..db import fetch_all, fetch_one
from ..pipeline import (
    build_section_payload,
    build_summary_payload,
    build_watchlist_history_payload,
    build_watchlist_payload,
)
from ..utils import csv_bytes, dumps_json, flatten_summary_to_csv_rows

router = APIRouter(prefix="/api/v1/exports", tags=["exports"])


def _json_or_csv(payload: dict, format: str, csv_rows: list[dict]) -> Response:
    if format == "json":
        return JSONResponse(payload)
    if format == "csv":
        return Response(content=csv_bytes(csv_rows), media_type="text/csv")
    raise HTTPException(status_code=400, detail="format must be json or csv")


@router.get("/dashboard/summary")
def export_dashboard_summary(trade_date: date | None = Query(default=None), format: str = Query(default="json")) -> Response:
    payload = build_summary_payload(trade_date)
    return _json_or_csv(payload, format, flatten_summary_to_csv_rows(payload))


@router.get("/dashboard/sections/{section_slug}")
def export_dashboard_section(section_slug: str, trade_date: date | None = Query(default=None), format: str = Query(default="json")) -> Response:
    payload = build_section_payload(section_slug, trade_date)
    return _json_or_csv(payload, format, payload.get("rows", []))


@router.get("/watchlists/{slug}")
def export_watchlist(slug: str, trade_date: date | None = Query(default=None), format: str = Query(default="json")) -> Response:
    payload = build_watchlist_payload(slug, trade_date)
    return _json_or_csv(payload, format, payload.get("rows", []))


@router.get("/watchlists/{slug}/history")
def export_watchlist_history(slug: str, days: int = Query(default=90, ge=1, le=1000), format: str = Query(default="json")) -> Response:
    payload = build_watchlist_history_payload(slug, days)
    return _json_or_csv(payload, format, payload.get("rows", []))


@router.get("/manifest")
def export_manifest(limit: int = Query(default=100, ge=1, le=1000)) -> dict:
    items = fetch_all(
        """
        select export_id, export_scope, export_key, trade_date, export_format, storage_path,
               content_type, row_count, byte_size, checksum_sha256, created_at, expires_at, meta_json
        from nse_ops.export_manifest
        order by created_at desc
        limit %(limit)s
        """,
        {"limit": limit},
    )
    return {"items": items}


@router.get("/download/{export_id}")
def download_export(export_id: str) -> FileResponse:
    row = fetch_one(
        """
        select storage_path, content_type
        from nse_ops.export_manifest
        where export_id = %(export_id)s
        """,
        {"export_id": export_id},
    )
    if not row:
        raise HTTPException(status_code=404, detail="Export not found")
    path = Path(row["storage_path"])
    if not path.exists():
        raise HTTPException(status_code=404, detail="Export file missing on disk")
    media_type = row["content_type"] or mimetypes.guess_type(str(path))[0] or "application/octet-stream"
    return FileResponse(path, media_type=media_type, filename=path.name)
