from __future__ import annotations

import logging
import os
import zipfile
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path

from . import db
from .downloader import Downloader
from .parsers import PARSER_MAP, ParsedLoad
from .report_registry import match_report
from .utils import candidate_dates, file_sha256, fmt_ctx, parse_flexible_date

logger = logging.getLogger(__name__)


@dataclass
class ProcessResult:
    report_name: str
    file_name: str
    source_date: date
    rows_loaded: int
    sha256: str
    bytes_count: int


def infer_source_date_from_file_name(file_name: str) -> date | None:
    import re
    m8 = re.search(r"(\d{8})", file_name)
    if m8:
        return parse_flexible_date(m8.group(1))
    m6 = re.search(r"(\d{6})", file_name)
    if m6:
        return parse_flexible_date(m6.group(1))
    return None


class Ingestor:
    def __init__(self, conn, settings, report_catalog: dict) -> None:
        self.conn = conn
        self.settings = settings
        self.report_catalog = report_catalog or {}
        self.downloader = Downloader(
            staging_dir=settings.staging_dir,
            timeout_seconds=settings.request_timeout_seconds,
            user_agent=settings.nse_http_user_agent,
        )

    def process_file(self, run_id: int, report_name: str, parser_name: str, source_date: date, path: Path) -> ProcessResult:
        run_report_id = db.start_run_report(self.conn, run_id, report_name, source_date, path.name)
        try:
            sha = file_sha256(path)
            if db.is_file_loaded(self.conn, report_name, source_date, path.name):
                db.finish_run_report(
                    self.conn,
                    run_report_id,
                    status="skipped",
                    rows_loaded=0,
                    bytes_downloaded=path.stat().st_size,
                    file_sha256=sha,
                    message="Already loaded",
                )
                return ProcessResult(report_name, path.name, source_date, 0, sha, path.stat().st_size)

            parser = PARSER_MAP[parser_name]
            data = path.read_bytes()
            parsed_loads = parser(data, path.name, source_date)
            rows_loaded = 0
            for pl in parsed_loads:
                rows_loaded += db.upsert_rows(self.conn, pl.table, pl.rows, pl.conflict_cols, pl.update_cols)
            db.register_file(
                self.conn,
                report_name=report_name,
                source_date=source_date,
                file_name=path.name,
                file_sha256=sha,
                bytes_count=path.stat().st_size,
                load_status="loaded",
                rows_loaded=rows_loaded,
                metadata={"parser": parser_name},
            )
            db.finish_run_report(
                self.conn,
                run_report_id,
                status="loaded",
                rows_loaded=rows_loaded,
                bytes_downloaded=path.stat().st_size,
                file_sha256=sha,
                metadata={"parser": parser_name},
            )
            if not self.settings.keep_downloads:
                try:
                    path.unlink(missing_ok=True)
                except Exception:
                    logger.warning("Failed to delete staged file %s", path, exc_info=True)
            return ProcessResult(report_name, path.name, source_date, rows_loaded, sha, path.stat().st_size if path.exists() else 0)
        except Exception as exc:
            logger.exception("Failed to process %s", path)
            self.conn.rollback()
            db.finish_run_report(self.conn, run_report_id, status="failed", message=str(exc))
            db.register_file(
                self.conn,
                report_name=report_name,
                source_date=source_date,
                file_name=path.name,
                file_sha256=file_sha256(path),
                bytes_count=path.stat().st_size,
                load_status="failed",
                rows_loaded=0,
                metadata={"parser": parser_name, "error": str(exc)},
            )
            raise

    def sync(self, run_id: int, backfill_days: int) -> dict:
        reports = self.report_catalog.get("reports", {})
        rows_total = 0
        files_total = 0
        errors = 0
        dates = candidate_dates(backfill_days)

        for source_date in dates:
            for report_name, cfg in reports.items():
                if not cfg.get("enabled", True):
                    continue
                result = self.downloader.download_report(report_name, source_date, cfg)
                if result is None:
                    logger.info("No file available for report=%s date=%s", report_name, source_date)
                    continue
                try:
                    pr = self.process_file(run_id, report_name, cfg["parser"], source_date, result.path)
                    rows_total += pr.rows_loaded
                    files_total += 1
                except Exception:
                    errors += 1
        return {"rows_total": rows_total, "files_total": files_total, "errors": errors}

    def load_bundle(self, run_id: int, bundle_path: Path, source_date_override: date | None = None) -> dict:
        rows_total = 0
        files_total = 0
        errors = 0
        with zipfile.ZipFile(bundle_path) as zf:
            inferred_dates = {
                d for n in zf.namelist()
                if not n.endswith("/")
                for d in [infer_source_date_from_file_name(Path(n).name)]
                if d is not None
            }
            bundle_default_date = None
            if source_date_override is not None:
                bundle_default_date = source_date_override
            elif len(inferred_dates) == 1:
                bundle_default_date = next(iter(inferred_dates))

            for member in zf.namelist():
                if member.endswith("/"):
                    continue
                rp = match_report(Path(member).name)
                if rp is None:
                    continue
                source_date = infer_source_date_from_file_name(Path(member).name) or bundle_default_date or infer_source_date_from_file_name(bundle_path.name)
                if source_date is None:
                    logger.warning("Could not infer source date for %s; skipping", member)
                    continue
                target_dir = self.settings.staging_dir / "bundle_extract" / source_date.isoformat()
                target_dir.mkdir(parents=True, exist_ok=True)
                target_path = target_dir / Path(member).name
                target_path.write_bytes(zf.read(member))
                try:
                    pr = self.process_file(run_id, rp.report_name, rp.parser_name, source_date, target_path)
                    rows_total += pr.rows_loaded
                    files_total += 1
                except Exception:
                    errors += 1
        if not self.settings.keep_downloads:
            try:
                bundle_path.unlink(missing_ok=True)
            except Exception:
                logger.warning("Failed to remove bundle %s", bundle_path, exc_info=True)
        return {"rows_total": rows_total, "files_total": files_total, "errors": errors}

    def cleanup_staging(self) -> int:
        cutoff = date.today() - timedelta(days=self.settings.staging_retention_days)
        deleted = 0
        for p in self.settings.staging_dir.rglob("*"):
            if not p.is_file():
                continue
            mtime = date.fromtimestamp(p.stat().st_mtime)
            if mtime < cutoff:
                try:
                    p.unlink(missing_ok=True)
                    deleted += 1
                except Exception:
                    logger.warning("Failed to delete staging file %s", p, exc_info=True)
        return deleted
