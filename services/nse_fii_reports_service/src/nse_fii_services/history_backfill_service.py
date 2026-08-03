from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import json
import logging
from pathlib import Path
from typing import Any

import pandas as pd

from .client import DownloadedReport, NSEFIIReportsClient, NSEReportNotFound
from .endpoints import REPORT_SPECS, iter_business_dates, parse_trade_date
from .parsers import parse_fii_stats_excel, parse_participant_csv

LOGGER = logging.getLogger(__name__)


@dataclass(frozen=True)
class BackfillResult:
    start_date: str
    end_date: str
    output_dir: str
    manifest_path: str
    summary_path: str
    missing_path: str


class HistoryBackfillService:
    """Backfill NSE daily participant/FII reports for a date range."""

    def __init__(
        self,
        client: NSEFIIReportsClient | None = None,
        output_root: str | Path = "data/history_backfill",
    ) -> None:
        self.client = client or NSEFIIReportsClient()
        self.output_root = Path(output_root)

    def backfill(
        self,
        *,
        start_date: str | datetime,
        end_date: str | datetime,
        save_parsed: bool = True,
        continue_on_error: bool = True,
    ) -> BackfillResult:
        start_dt = parse_trade_date(start_date).replace(hour=0, minute=0, second=0, microsecond=0)
        end_dt = parse_trade_date(end_date).replace(hour=0, minute=0, second=0, microsecond=0)
        if start_dt > end_dt:
            raise ValueError("start_date must be <= end_date")

        out_dir = self.output_root / f"{start_dt.strftime('%Y-%m-%d')}__{end_dt.strftime('%Y-%m-%d')}"
        out_dir.mkdir(parents=True, exist_ok=True)

        manifest_rows: list[dict[str, Any]] = []
        missing_rows: list[dict[str, Any]] = []

        for trade_dt in iter_business_dates(start_dt, end_dt):
            day_label = trade_dt.strftime("%d-%m-%Y")
            day_dir = out_dir / trade_dt.strftime("%Y-%m-%d")
            raw_dir = day_dir / "raw"
            parsed_dir = day_dir / "parsed"
            raw_dir.mkdir(parents=True, exist_ok=True)
            if save_parsed:
                parsed_dir.mkdir(parents=True, exist_ok=True)

            for report_key in REPORT_SPECS:
                try:
                    report = self.client.fetch_report(report_key, trade_dt)
                except Exception as exc:
                    missing_rows.append(
                        {
                            "trade_date": day_label,
                            "report_key": report_key,
                            "error": str(exc),
                        }
                    )
                    if not continue_on_error:
                        raise
                    continue

                manifest_rows.append(
                    self._save_one_report(
                        report=report,
                        raw_dir=raw_dir,
                        parsed_dir=parsed_dir,
                        save_parsed=save_parsed,
                    )
                )

        manifest_df = pd.DataFrame(manifest_rows)
        missing_df = pd.DataFrame(missing_rows)
        summary = {
            "service": "history_backfill",
            "start_date": start_dt.strftime("%d-%m-%Y"),
            "end_date": end_dt.strftime("%d-%m-%Y"),
            "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
            "reports_expected_per_day": len(REPORT_SPECS),
            "reports_downloaded": int(len(manifest_df)),
            "reports_missing": int(len(missing_df)),
            "dates_touched": int(sum(1 for _ in iter_business_dates(start_dt, end_dt))),
        }

        manifest_path = out_dir / "manifest.csv"
        summary_path = out_dir / "summary.json"
        missing_path = out_dir / "missing.csv"
        manifest_df.to_csv(manifest_path, index=False)
        missing_df.to_csv(missing_path, index=False)
        summary_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")

        return BackfillResult(
            start_date=summary["start_date"],
            end_date=summary["end_date"],
            output_dir=str(out_dir),
            manifest_path=str(manifest_path),
            summary_path=str(summary_path),
            missing_path=str(missing_path),
        )

    @staticmethod
    def _save_one_report(
        *,
        report: DownloadedReport,
        raw_dir: Path,
        parsed_dir: Path,
        save_parsed: bool,
    ) -> dict[str, Any]:
        raw_path = raw_dir / report.filename
        raw_path.write_bytes(report.content)
        row: dict[str, Any] = {
            "trade_date": report.trade_date,
            "report_key": report.report_key,
            "source_url": report.source_url,
            "raw_path": str(raw_path),
            "bytes": len(report.content),
            "parsed": False,
            "parsed_path": None,
            "parse_error": None,
            "row_count": None,
        }
        if not save_parsed:
            return row

        try:
            if report.report_key in {"participant_oi", "participant_volume"}:
                df = parse_participant_csv(report.content)
            else:
                df = parse_fii_stats_excel(report.content)
            parsed_path = parsed_dir / f"{report.filename}.parsed.csv"
            df.to_csv(parsed_path, index=False)
            row.update(
                {
                    "parsed": True,
                    "parsed_path": str(parsed_path),
                    "row_count": int(len(df)),
                }
            )
        except Exception as exc:
            row["parse_error"] = str(exc)
        return row


def _main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description="Backfill NSE daily FII/participant reports for a date range.")
    parser.add_argument("--start-date", required=True, help="DD-MM-YYYY")
    parser.add_argument("--end-date", required=True, help="DD-MM-YYYY")
    parser.add_argument("--output-root", default="data/history_backfill")
    parser.add_argument("--no-parse", action="store_true")
    parser.add_argument("--fail-fast", action="store_true")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    service = HistoryBackfillService(output_root=args.output_root)
    result = service.backfill(
        start_date=args.start_date,
        end_date=args.end_date,
        save_parsed=not args.no_parse,
        continue_on_error=not args.fail_fast,
    )
    print(json.dumps({
        "start_date": result.start_date,
        "end_date": result.end_date,
        "output_dir": result.output_dir,
        "manifest_path": result.manifest_path,
        "summary_path": result.summary_path,
        "missing_path": result.missing_path,
    }, indent=2))


if __name__ == "__main__":
    _main()
