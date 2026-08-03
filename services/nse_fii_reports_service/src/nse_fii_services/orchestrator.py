from __future__ import annotations

import csv
from datetime import datetime, timezone
import json
from pathlib import Path
from typing import Any

from .client import NSEFIIReportsClient
from .config import Settings
from .history_backfill_service import HistoryBackfillService
from .live_service import LatestDailyService
from .postgres_loader import load_run_to_postgres


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def _write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def _read_json(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def _read_csv_rows(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        return []
    with path.open("r", encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def _safe_run_segment(value: str) -> str:
    if not value or "/" in value or "\\" in value or ".." in value:
        raise ValueError("Invalid run identifier.")
    return value


def _list_run_dirs(root: Path, limit: int) -> list[Path]:
    if not root.exists():
        return []
    paths = [path for path in root.iterdir() if path.is_dir()]
    return sorted(paths, key=lambda path: path.name, reverse=True)[:limit]


def _build_daily_run_summary(path: Path) -> dict[str, Any]:
    manifest_path = path / "manifest.json"
    manifest = _read_json(manifest_path) or {}
    reports = manifest.get("reports", {}) if isinstance(manifest, dict) else {}
    report_names = sorted(reports.keys()) if isinstance(reports, dict) else []
    return {
        "kind": "daily",
        "run_id": path.name,
        "output_dir": str(path),
        "manifest_path": str(manifest_path),
        "generated_at": manifest.get("generated_at"),
        "trade_date": manifest.get("trade_date") or path.name,
        "report_count": len(report_names),
        "report_names": report_names,
    }


def _build_backfill_run_summary(path: Path) -> dict[str, Any]:
    summary_path = path / "summary.json"
    summary = _read_json(summary_path) or {}
    manifest_path = path / "manifest.csv"
    missing_path = path / "missing.csv"
    return {
        "kind": "backfill",
        "run_id": path.name,
        "output_dir": str(path),
        "manifest_path": str(manifest_path),
        "summary_path": str(summary_path),
        "missing_path": str(missing_path),
        "generated_at": summary.get("generated_at"),
        "start_date": summary.get("start_date"),
        "end_date": summary.get("end_date"),
        "dates_touched": summary.get("dates_touched"),
        "reports_downloaded": summary.get("reports_downloaded"),
        "reports_missing": summary.get("reports_missing"),
    }


def create_client(settings: Settings) -> NSEFIIReportsClient:
    return NSEFIIReportsClient(
        timeout=settings.request_timeout_seconds,
        enable_reports_api_fallback=settings.enable_reports_api_fallback,
    )


def run_latest_pull(
    settings: Settings,
    *,
    as_of_date: str | None = None,
    max_lookback_days: int | None = None,
    save_parsed: bool = True,
) -> dict[str, Any]:
    service = LatestDailyService(
        client=create_client(settings),
        output_root=settings.latest_daily_root,
    )
    result = service.pull_latest(
        as_of_date=as_of_date,
        max_lookback_days=max_lookback_days or settings.auto_pull_max_lookback_days,
        save_parsed=save_parsed,
    )
    payload = {
        "operation": "pull-latest",
        "generated_at": _utc_now(),
        "trade_date": result.trade_date,
        "output_dir": result.output_dir,
        "manifest_path": result.manifest_path,
        "reports_found": list(result.reports_found),
    }
    _write_json(settings.latest_daily_metadata_path, payload)
    _write_json(settings.latest_run_metadata_path, payload)
    return payload


def run_backfill(
    settings: Settings,
    *,
    start_date: str,
    end_date: str,
    save_parsed: bool = True,
    continue_on_error: bool = True,
) -> dict[str, Any]:
    service = HistoryBackfillService(
        client=create_client(settings),
        output_root=settings.history_backfill_root,
    )
    result = service.backfill(
        start_date=start_date,
        end_date=end_date,
        save_parsed=save_parsed,
        continue_on_error=continue_on_error,
    )
    payload = {
        "operation": "backfill",
        "generated_at": _utc_now(),
        "start_date": result.start_date,
        "end_date": result.end_date,
        "output_dir": result.output_dir,
        "manifest_path": result.manifest_path,
        "summary_path": result.summary_path,
        "missing_path": result.missing_path,
    }
    _write_json(settings.latest_backfill_metadata_path, payload)
    _write_json(settings.latest_run_metadata_path, payload)
    return payload


def read_latest_metadata(settings: Settings) -> dict[str, Any]:
    latest_run = _read_json(settings.latest_run_metadata_path)
    latest_daily = _read_json(settings.latest_daily_metadata_path)
    latest_backfill = _read_json(settings.latest_backfill_metadata_path)
    return {
        "output_dir": str(settings.output_dir),
        "latest_run_path": str(settings.latest_run_metadata_path),
        "latest_daily_path": str(settings.latest_daily_metadata_path),
        "latest_backfill_path": str(settings.latest_backfill_metadata_path),
        "latest_run": latest_run,
        "latest_daily": latest_daily,
        "latest_backfill": latest_backfill,
    }


def list_runs(settings: Settings, *, limit: int = 20) -> dict[str, Any]:
    safe_limit = max(1, min(limit, 100))
    daily_runs = [_build_daily_run_summary(path) for path in _list_run_dirs(settings.latest_daily_root, safe_limit)]
    backfill_runs = [_build_backfill_run_summary(path) for path in _list_run_dirs(settings.history_backfill_root, safe_limit)]
    return {
        "output_dir": str(settings.output_dir),
        "daily_runs": daily_runs,
        "backfill_runs": backfill_runs,
    }


def get_run_detail(settings: Settings, *, kind: str, run_id: str) -> dict[str, Any]:
    resolved_kind = kind.strip().lower()
    safe_run_id = _safe_run_segment(run_id.strip())

    if resolved_kind == "daily":
        run_dir = settings.latest_daily_root / safe_run_id
        if not run_dir.exists():
            raise FileNotFoundError(f"Daily run '{safe_run_id}' was not found.")
        manifest_path = run_dir / "manifest.json"
        manifest = _read_json(manifest_path)
        if manifest is None:
            raise FileNotFoundError(f"Manifest for daily run '{safe_run_id}' was not found.")
        reports = manifest.get("reports", {}) if isinstance(manifest, dict) else {}
        report_rows = []
        if isinstance(reports, dict):
            for report_key, report_meta in reports.items():
                if not isinstance(report_meta, dict):
                    continue
                report_rows.append(
                    {
                        "report_key": report_key,
                        "source_url": report_meta.get("source_url"),
                        "raw_path": report_meta.get("raw_path"),
                        "parsed_path": report_meta.get("parsed_path"),
                        "bytes": report_meta.get("bytes"),
                        "parsed": report_meta.get("parsed"),
                        "row_count": report_meta.get("row_count"),
                    }
                )
        return {
            "kind": "daily",
            "run": _build_daily_run_summary(run_dir),
            "manifest": manifest,
            "report_rows": report_rows,
        }

    if resolved_kind == "backfill":
        run_dir = settings.history_backfill_root / safe_run_id
        if not run_dir.exists():
            raise FileNotFoundError(f"Backfill run '{safe_run_id}' was not found.")
        summary_path = run_dir / "summary.json"
        summary = _read_json(summary_path)
        if summary is None:
            raise FileNotFoundError(f"Summary for backfill run '{safe_run_id}' was not found.")
        manifest_rows = _read_csv_rows(run_dir / "manifest.csv")
        missing_rows = _read_csv_rows(run_dir / "missing.csv")
        return {
            "kind": "backfill",
            "run": _build_backfill_run_summary(run_dir),
            "summary": summary,
            "manifest_rows": manifest_rows,
            "missing_rows": missing_rows,
        }

    raise ValueError("Run kind must be 'daily' or 'backfill'.")


def load_run(
    settings: Settings,
    *,
    kind: str | None = None,
    run_id: str | None = None,
    truncate_tables_on_load: bool | None = None,
) -> dict[str, Any]:
    return load_run_to_postgres(
        settings,
        kind=kind,
        run_id=run_id,
        truncate_tables_on_load=truncate_tables_on_load,
    )
