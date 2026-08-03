from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pandas as pd

from .config import Settings
from .utils import csv_relative_path, ensure_dir, now_utc, safe_json_dumps, slugify

ERROR_LOG_COLUMNS = ["run_id", "dataset_name", "symbol", "message", "context_json", "created_at"]
MANIFEST_COLUMNS = [
    "run_id",
    "dataset_name",
    "table_name",
    "row_count",
    "status",
    "combined_file",
    "raw_dir",
    "notes",
    "created_at",
]


def dataset_raw_dir(settings: Settings, dataset_name: str) -> Path:
    return ensure_dir(settings.raw_dir / dataset_name)


def write_symbol_csv(df: pd.DataFrame, settings: Settings, dataset_name: str, symbol: str) -> Path | None:
    if df.empty:
        return None
    path = dataset_raw_dir(settings, dataset_name) / f"{slugify(symbol)}.csv"
    df.to_csv(path, index=False)
    return path


def write_combined_csv(df: pd.DataFrame, settings: Settings, dataset_name: str) -> Path:
    path = ensure_dir(settings.combined_dir) / f"{dataset_name}.csv"
    df.to_csv(path, index=False)
    return path


def write_manifest(manifest_rows: list[dict[str, Any]], settings: Settings) -> Path:
    manifest_path = settings.audit_dir / "manifest.csv"
    manifest_df = pd.DataFrame(manifest_rows, columns=MANIFEST_COLUMNS)
    if not manifest_df.empty:
        manifest_df = manifest_df.sort_values(["dataset_name"], kind="stable")
    manifest_df.to_csv(manifest_path, index=False)
    return manifest_path


def write_error_log(error_rows: list[dict[str, Any]], settings: Settings) -> Path:
    error_path = settings.audit_dir / "error_log.csv"
    error_df = pd.DataFrame(error_rows, columns=ERROR_LOG_COLUMNS)
    error_df.to_csv(error_path, index=False)
    return error_path


def write_latest_run_metadata(summary: dict[str, Any], settings: Settings) -> Path:
    latest_path = settings.latest_run_metadata_path
    latest_path.parent.mkdir(parents=True, exist_ok=True)
    payload = dict(summary)
    payload["written_at"] = now_utc().isoformat()
    with latest_path.open("w", encoding="utf-8") as fp:
        json.dump(payload, fp, ensure_ascii=False, indent=2)
    return latest_path


def manifest_row(
    settings: Settings,
    dataset_name: str,
    table_name: str,
    row_count: int,
    status: str,
    combined_file: Path | None = None,
    raw_dir: Path | None = None,
    notes: str | None = None,
) -> dict[str, Any]:
    return {
        "run_id": settings.run_id,
        "dataset_name": dataset_name,
        "table_name": table_name,
        "row_count": int(row_count),
        "status": status,
        "combined_file": csv_relative_path(combined_file, settings.project_root) if combined_file else "",
        "raw_dir": csv_relative_path(raw_dir, settings.project_root) if raw_dir else "",
        "notes": notes or "",
        "created_at": now_utc().isoformat(),
    }


def error_row(settings: Settings, dataset_name: str, symbol: str | None, message: str, context: dict[str, Any] | None = None) -> dict[str, Any]:
    return {
        "run_id": settings.run_id,
        "dataset_name": dataset_name,
        "symbol": symbol or "",
        "message": message,
        "context_json": safe_json_dumps(context or {}),
        "created_at": now_utc().isoformat(),
    }
