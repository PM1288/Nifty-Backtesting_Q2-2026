from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from .config import Settings
from .logging_utils import configure_logging
from .pipeline import run_pipeline
from .postgres_loader import load_combined_csvs_to_postgres
from .utils import parse_date_value

app = FastAPI(title="Nifty 100 Disclosures Pipeline", version="0.1.0")


class RunRequest(BaseModel):
    symbols: list[str] | None = Field(default=None, description="Optional subset of NSE symbols")
    nse_fin_start_date: str | None = None
    nse_fin_end_date: str | None = None
    corp_actions_start_date: str | None = None
    corp_actions_end_date: str | None = None
    event_start_date: str | None = None
    event_end_date: str | None = None
    load_postgres: bool = False
    truncate_tables_on_load: bool | None = None


class LoadRequest(BaseModel):
    run_id: str | None = None
    truncate_tables_on_load: bool | None = None


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/latest-run")
def latest_run() -> dict[str, Any]:
    settings = Settings.from_env()
    if not settings.latest_run_metadata_path.exists():
        raise HTTPException(status_code=404, detail="No latest run metadata found")
    payload = json.loads(settings.latest_run_metadata_path.read_text(encoding="utf-8"))
    return {"path": str(settings.latest_run_metadata_path), "latest_run": payload}


@app.post("/run")
def run(request: RunRequest) -> dict[str, Any]:
    settings = Settings.from_env()
    overrides: dict[str, Any] = {}
    if request.symbols:
        overrides["symbols"] = [symbol.upper() for symbol in request.symbols]
    for field_name in [
        "nse_fin_start_date",
        "nse_fin_end_date",
        "corp_actions_start_date",
        "corp_actions_end_date",
        "event_start_date",
        "event_end_date",
    ]:
        raw_value = getattr(request, field_name)
        if raw_value:
            parsed = parse_date_value(raw_value)
            if parsed is None:
                raise HTTPException(status_code=400, detail=f"Invalid date for {field_name}: {raw_value}")
            overrides[field_name] = parsed
    if request.truncate_tables_on_load is not None:
        overrides["truncate_tables_on_load"] = request.truncate_tables_on_load
    settings = settings.with_overrides(**overrides) if overrides else settings

    result = run_pipeline(settings, load_postgres=request.load_postgres)
    return {
        "run_id": result.run_id,
        "run_root": str(result.run_root),
        "combined_dir": str(result.combined_dir),
        "manifest_path": str(result.manifest_path),
        "error_log_path": str(result.error_log_path),
        "dataset_row_counts": result.dataset_row_counts,
        "effective_symbols": result.effective_symbols,
        "load_results": result.load_results,
    }


@app.post("/load")
def load(request: LoadRequest) -> dict[str, Any]:
    settings = Settings.from_env()
    if request.truncate_tables_on_load is not None:
        settings = settings.with_overrides(truncate_tables_on_load=request.truncate_tables_on_load)

    run_id = request.run_id
    if request.run_id:
        combined_dir = settings.absolute_output_dir / "runs" / request.run_id / "combined"
        manifest_path = settings.absolute_output_dir / "runs" / request.run_id / "audit" / "manifest.csv"
    else:
        if not settings.latest_run_metadata_path.exists():
            raise HTTPException(status_code=404, detail="No latest run metadata found")
        payload = json.loads(settings.latest_run_metadata_path.read_text(encoding="utf-8"))
        run_id = str(payload.get("run_id", "")).strip() or None
        combined_dir = Path(payload["combined_dir"])
        manifest_path = Path(payload["manifest_path"])

    if not combined_dir.exists():
        raise HTTPException(status_code=404, detail=f"Combined dir not found: {combined_dir}")
    if not manifest_path.exists():
        raise HTTPException(status_code=404, detail=f"Manifest not found: {manifest_path}")

    logger = configure_logging(settings.log_level, log_file=settings.service_logs_dir / "api.log")
    load_results = load_combined_csvs_to_postgres(settings, combined_dir=combined_dir, manifest_path=manifest_path, logger=logger)
    return {
        "run_id": run_id,
        "combined_dir": str(combined_dir),
        "manifest_path": str(manifest_path),
        "load_results": load_results,
    }
