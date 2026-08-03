from __future__ import annotations

from datetime import date

from fastapi import APIRouter, HTTPException, Query

from ..pipeline import build_section_payload, build_summary_payload

router = APIRouter(prefix="/api/v1/dashboard", tags=["dashboard"])


@router.get("/summary")
def get_dashboard_summary(trade_date: date | None = Query(default=None)) -> dict:
    try:
        return build_summary_payload(trade_date)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/sections/{section_slug}")
def get_dashboard_section(section_slug: str, trade_date: date | None = Query(default=None)) -> dict:
    try:
        return build_section_payload(section_slug, trade_date)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/ticker-tape")
def get_ticker_tape(trade_date: date | None = Query(default=None)) -> dict:
    try:
        payload = build_summary_payload(trade_date)
        return {
            "trade_date": payload["trade_date"],
            "generated_at": payload["generated_at"],
            "accent_token": payload["accent_token"],
            "ticker_tape": payload["ticker_tape"],
            "footer_disclaimer": payload["footer_disclaimer"],
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
