from __future__ import annotations

from datetime import date

from fastapi import APIRouter, HTTPException, Query

from ..pipeline import export_section, export_stock, export_summary, export_watchlist, list_intraday_exports

router = APIRouter(prefix="/api/v1/intraday/exports", tags=["intraday-exports"])


@router.get("/summary")
def get_summary_export(
    trade_date: date | None = Query(default=None),
    index_code: str | None = Query(default=None),
    format: str = Query(default="json"),
) -> dict:
    try:
        return export_summary(trade_date=trade_date, index_code=index_code, export_format=format)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/sections/{section_slug}")
def get_section_export(
    section_slug: str,
    trade_date: date | None = Query(default=None),
    index_code: str | None = Query(default=None),
    format: str = Query(default="json"),
) -> dict:
    try:
        return export_section(section_slug=section_slug, trade_date=trade_date, index_code=index_code, export_format=format)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/watchlists/{slug}")
def get_watchlist_export(
    slug: str,
    trade_date: date | None = Query(default=None),
    format: str = Query(default="json"),
) -> dict:
    try:
        return export_watchlist(slug=slug, trade_date=trade_date, export_format=format)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/stocks/{symbol}")
def get_stock_export(
    symbol: str,
    trade_date: date | None = Query(default=None),
    format: str = Query(default="json"),
) -> dict:
    try:
        return export_stock(symbol=symbol, trade_date=trade_date, export_format=format)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/manifest")
def get_manifest(limit: int = Query(default=50, ge=1, le=500)) -> dict:
    try:
        return {"items": list_intraday_exports(limit=limit)}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
