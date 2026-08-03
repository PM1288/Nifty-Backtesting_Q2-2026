from __future__ import annotations

from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from .config import Settings
from .logging_utils import configure_logging
from .orchestrator import get_run_detail, list_runs, load_run, read_latest_metadata, run_backfill, run_latest_pull
from .scheduler import AutoPullScheduler


class PullLatestRequest(BaseModel):
    as_of_date: str | None = None
    max_lookback_days: int = Field(default=10, ge=1, le=60)
    save_parsed: bool = True


class BackfillRequest(BaseModel):
    start_date: str
    end_date: str
    save_parsed: bool = True
    continue_on_error: bool = True


class LoadRequest(BaseModel):
    kind: str | None = None
    run_id: str | None = None
    truncate_tables_on_load: bool | None = None


settings = Settings.from_env()
configure_logging(settings.log_level)
scheduler = AutoPullScheduler(settings)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    if settings.auto_pull_enabled:
        await scheduler.start()
    try:
        yield
    finally:
        if settings.auto_pull_enabled:
            await scheduler.stop()


app = FastAPI(title="NSE FII Reports Service", version="0.1.0", lifespan=lifespan)


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "scheduler_enabled": settings.auto_pull_enabled,
        "scheduler_running": scheduler.running,
    }


@app.get("/latest-run")
def latest_run() -> dict[str, Any]:
    payload = read_latest_metadata(settings)
    if payload["latest_run"] is None and payload["latest_daily"] is None and payload["latest_backfill"] is None:
        raise HTTPException(status_code=404, detail="No latest run metadata found")
    return payload


@app.get("/runs")
def runs(limit: int = 20) -> dict[str, Any]:
    try:
        return list_runs(settings, limit=limit)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/runs/{kind}/{run_id}")
def run_detail(kind: str, run_id: str) -> dict[str, Any]:
    try:
        return get_run_detail(settings, kind=kind, run_id=run_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/pull-latest")
def pull_latest(request: PullLatestRequest) -> dict[str, Any]:
    try:
        return run_latest_pull(
            settings,
            as_of_date=request.as_of_date,
            max_lookback_days=request.max_lookback_days,
            save_parsed=request.save_parsed,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/backfill")
def backfill(request: BackfillRequest) -> dict[str, Any]:
    try:
        return run_backfill(
            settings,
            start_date=request.start_date,
            end_date=request.end_date,
            save_parsed=request.save_parsed,
            continue_on_error=request.continue_on_error,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/load")
def load(request: LoadRequest) -> dict[str, Any]:
    try:
        return load_run(
            settings,
            kind=request.kind,
            run_id=request.run_id,
            truncate_tables_on_load=request.truncate_tables_on_load,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
