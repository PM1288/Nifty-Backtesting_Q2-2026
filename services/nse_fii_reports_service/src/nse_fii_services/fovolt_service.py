from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from decimal import Decimal
import hashlib
import json
from pathlib import Path
from typing import Any

from .client import DownloadedReport, NSEFIIReportsClient, NSEReportNotFound
from .endpoints import parse_trade_date
from .parsers import FOVOLT_RULE_VERSION, FOVOLT_THRESHOLD, rank_fovolt_rows, parse_fovolt_csv

PARSER_VERSION = "FOVOLT_SEMANTIC_HEADERS_V1"
SCHEMA_IDENTIFIER = "NSE_FOVOLT_16_COLUMNS_V1"
NUMERIC_FIELDS = (
    "underlying_close", "underlying_previous_close", "underlying_log_return",
    "underlying_vol_previous", "underlying_vol_current", "underlying_vol_annual",
    "futures_close", "futures_previous_close", "futures_log_return",
    "futures_vol_previous", "futures_vol_current", "futures_vol_annual",
    "applicable_vol_daily", "applicable_vol_annual",
)


@dataclass(frozen=True)
class FovoltPullResult:
    report: DownloadedReport
    rows: list[dict[str, object]]
    revision_id: str
    raw_path: Path
    manifest_path: Path


class FovoltDailyService:
    """Independent FOVOLT pull; absence never changes the core report date."""

    def __init__(self, client: NSEFIIReportsClient | None = None, output_root: str | Path = "data/fovolt_daily") -> None:
        self.client = client or NSEFIIReportsClient()
        self.output_root = Path(output_root)

    def pull_latest(self, *, as_of_date: str | datetime | None = None, max_lookback_days: int = 10) -> FovoltPullResult:
        start = parse_trade_date(as_of_date) if as_of_date else datetime.today()
        last_error: Exception | None = None
        for offset in range(max_lookback_days + 1):
            candidate = start - timedelta(days=offset)
            if candidate.weekday() >= 5:
                continue
            try:
                report = self.client.fetch_report("fovolt", candidate)
                rows = rank_fovolt_rows(parse_fovolt_csv(report.content, expected_date=candidate.date()))
                return self._persist(report, rows)
            except NSEReportNotFound as exc:
                last_error = exc
        raise NSEReportNotFound(f"No valid FOVOLT report within {max_lookback_days} days. Last error: {last_error}")

    def _persist(self, report: DownloadedReport, rows: list[dict[str, object]]) -> FovoltPullResult:
        digest = hashlib.sha256(report.content).hexdigest()
        revision_id = f"fovolt:{rows[0]['report_date']}:{digest}"
        target = self.output_root / str(rows[0]["report_date"]) / digest
        raw_dir = target / "raw"
        raw_dir.mkdir(parents=True, exist_ok=True)
        raw_path = raw_dir / report.filename
        if not raw_path.exists():
            raw_path.write_bytes(report.content)
        manifest = {
            "dataset": "fovolt", "report_date": str(rows[0]["report_date"]),
            "revision_id": revision_id, "content_sha256": digest,
            "source_url": report.source_url, "source_filename": report.filename,
            "source_basis": "NSE_ARCHIVE_OBSERVED_DOWNLOAD",
            "first_seen_at": datetime.now(timezone.utc).isoformat(),
            "parser_version": PARSER_VERSION, "schema_identifier": SCHEMA_IDENTIFIER,
            "row_count": len(rows),
            "computable_count": sum(row["delta_futures_vol_raw"] is not None for row in rows),
            "matched_count": sum(row["rule_match"] is True for row in rows),
            "raw_path": str(raw_path),
        }
        manifest_path = target / "manifest.json"
        if not manifest_path.exists():
            manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
        return FovoltPullResult(report, rows, revision_id, raw_path, manifest_path)


def load_fovolt_result(conn: Any, result: FovoltPullResult, *, source_basis: str = "NSE_ARCHIVE_OBSERVED_DOWNLOAD") -> dict[str, object]:
    """Atomically publish one immutable revision and its deterministic screen."""
    report_date = result.rows[0]["report_date"]
    digest = hashlib.sha256(result.report.content).hexdigest()
    frozen_at = datetime.now(timezone.utc)
    run_id = f"{result.revision_id}:{FOVOLT_RULE_VERSION}"
    with conn.cursor() as cur:
        cur.execute("SELECT to_regclass('market_data.nse_fovolt_report_row')")
        if cur.fetchone()[0] is None:
            raise RuntimeError("FOVOLT tables are missing; apply db/sql/058_futures_volatility_screener.sql")
        cur.execute(
            """INSERT INTO audit.nse_fovolt_report_revision
               (revision_id,report_date,content_sha256,source_filename,source_url,source_basis,
                first_seen_at,parser_version,schema_identifier,raw_archive_reference,row_count,validation_summary)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb)
               ON CONFLICT (revision_id) DO NOTHING""",
            (result.revision_id, report_date, digest, result.report.filename, result.report.source_url,
             source_basis, frozen_at, PARSER_VERSION, SCHEMA_IDENTIFIER, str(result.raw_path), len(result.rows),
             json.dumps({"computable": sum(row["delta_futures_vol_raw"] is not None for row in result.rows),
                         "matched": sum(row["rule_match"] is True for row in result.rows)})),
        )
        value_sql = ",".join(["%s"] * (4 + len(NUMERIC_FIELDS) + 2))
        for row in result.rows:
            cur.execute(
                f"""INSERT INTO market_data.nse_fovolt_report_row
                    (revision_id,source_csv_line,report_date,symbol,{','.join(NUMERIC_FIELDS)},raw_fields,mapping_state)
                    VALUES ({value_sql}) ON CONFLICT (revision_id,source_csv_line) DO NOTHING""",
                (result.revision_id, row["source_csv_line"], report_date, row["symbol"],
                 *(row[field] for field in NUMERIC_FIELDS), json.dumps(row["raw_fields"]),
                 "REQUIRES_DATE_EFFECTIVE_MASTER"),
            )
        cur.execute(
            "SELECT min(trade_date) FROM public.trading_calendar WHERE is_trading_day AND trade_date>%s",
            (report_date,),
        )
        analysis_session = cur.fetchone()[0]
        cur.execute(
            """INSERT INTO market_data.nse_fovolt_screen_run
               (run_id,revision_id,report_date,analysis_session,rule_version,threshold_raw,timing_mode,
                cohort_frozen_at,source_row_count,computable_count,matched_count,status)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'PUBLISHED') ON CONFLICT (run_id) DO NOTHING""",
            (run_id, result.revision_id, report_date, analysis_session, FOVOLT_RULE_VERSION, FOVOLT_THRESHOLD,
             "OBSERVED_DOWNLOAD_TIME", frozen_at, len(result.rows),
             sum(row["delta_futures_vol_raw"] is not None for row in result.rows),
             sum(row["rule_match"] is True for row in result.rows)),
        )
        match_rank = 0
        for row in result.rows:
            if row["rule_match"] is True:
                match_rank += 1
            cur.execute(
                """INSERT INTO market_data.nse_fovolt_screen_row
                   (run_id,revision_id,source_csv_line,symbol,previous_futures_daily_vol,current_futures_daily_vol,
                    delta_raw,delta_basis_points,qualifies,rank_in_valid_report,match_rank,screen_state,mapping_state)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'REQUIRES_DATE_EFFECTIVE_MASTER')
                   ON CONFLICT (run_id,source_csv_line) DO NOTHING""",
                (run_id, result.revision_id, row["source_csv_line"], row["symbol"], row["futures_vol_previous"],
                 row["futures_vol_current"], row["delta_futures_vol_raw"], row["delta_futures_vol_bp"],
                 row["rule_match"], row["rank_in_valid_report"], match_rank if row["rule_match"] is True else None,
                 row["screen_state"]),
            )
    conn.commit()
    return {"revision_id": result.revision_id, "run_id": run_id, "report_date": str(report_date),
            "analysis_session": str(analysis_session) if analysis_session else None,
            "row_count": len(result.rows), "matched_count": match_rank}
