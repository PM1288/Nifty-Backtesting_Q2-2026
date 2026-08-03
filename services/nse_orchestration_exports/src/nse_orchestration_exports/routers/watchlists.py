from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from ..pipeline import build_watchlist_history_payload, build_watchlist_payload, build_watchlists_payload

router = APIRouter(prefix="/api/v1/watchlists", tags=["watchlists"])


@router.get("")
def get_watchlists() -> dict:
    try:
        return {"items": build_watchlists_payload()}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/{slug}")
def get_watchlist(slug: str) -> dict:
    try:
        return build_watchlist_payload(slug)
    except Exception as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/{slug}/history")
def get_watchlist_history(slug: str, days: int = Query(default=90, ge=1, le=1000)) -> dict:
    try:
        return build_watchlist_history_payload(slug, days)
    except Exception as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
