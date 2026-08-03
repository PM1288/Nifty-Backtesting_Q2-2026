from __future__ import annotations

from datetime import date

from fastapi import APIRouter, HTTPException, Query

from ..pipeline import (
    build_section_payload,
    build_stock_payload,
    build_summary_payload,
    get_watchlist_detail_payload,
    get_watchlists_payload,
)

router = APIRouter(prefix="/api/v1/intraday", tags=["intraday"])


@router.get("/summary")
def get_summary(
    trade_date: date | None = Query(default=None),
    index_code: str | None = Query(default=None),
) -> dict:
    try:
        return build_summary_payload(trade_date=trade_date, index_code=index_code)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/sections/{section_slug}")
def get_section(
    section_slug: str,
    trade_date: date | None = Query(default=None),
    index_code: str | None = Query(default=None),
) -> dict:
    try:
        return build_section_payload(section_slug=section_slug, trade_date=trade_date, index_code=index_code)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/state")
def get_state(
    trade_date: date | None = Query(default=None),
    index_code: str | None = Query(default=None),
) -> dict:
    try:
        payload = build_summary_payload(trade_date=trade_date, index_code=index_code)
        return {
            "trade_date": payload["trade_date"],
            "index_code": payload["index_code"],
            "as_of": payload["as_of"],
            "state": payload["state"],
            "breadth": payload["breadth"],
            "summary_table": payload["summary_table"],
            "footer_disclaimer": payload["footer_disclaimer"],
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/breadth/timeline")
def get_breadth_timeline(
    trade_date: date | None = Query(default=None),
    index_code: str | None = Query(default=None),
) -> dict:
    try:
        payload = build_section_payload("breadth-participation", trade_date=trade_date, index_code=index_code)
        return {
            "trade_date": payload["trade_date"],
            "index_code": payload["index_code"],
            "as_of": payload["as_of"],
            "charts": payload["charts"],
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/leadership")
def get_leadership(
    trade_date: date | None = Query(default=None),
    index_code: str | None = Query(default=None),
) -> dict:
    try:
        payload = build_summary_payload(trade_date=trade_date, index_code=index_code)
        return {
            "trade_date": payload["trade_date"],
            "index_code": payload["index_code"],
            "as_of": payload["as_of"],
            "leaders": payload["leaders"],
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/stocks/{symbol}")
def get_stock(symbol: str, trade_date: date | None = Query(default=None)) -> dict:
    try:
        return build_stock_payload(symbol=symbol, trade_date=trade_date)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/watchlists")
def get_watchlists(trade_date: date | None = Query(default=None)) -> dict:
    try:
        return get_watchlists_payload(trade_date=trade_date)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/watchlists/{slug}")
def get_watchlist(slug: str, trade_date: date | None = Query(default=None)) -> dict:
    try:
        return get_watchlist_detail_payload(slug=slug, trade_date=trade_date)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/ticker-tape")
def get_ticker_tape(
    trade_date: date | None = Query(default=None),
    index_code: str | None = Query(default=None),
) -> dict:
    try:
        payload = build_summary_payload(trade_date=trade_date, index_code=index_code)
        return {
            "trade_date": payload["trade_date"],
            "index_code": payload["index_code"],
            "as_of": payload["as_of"],
            "accent_token": payload["accent_token"],
            "ticker_tape": payload["ticker_tape"],
            "footer_disclaimer": payload["footer_disclaimer"],
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
