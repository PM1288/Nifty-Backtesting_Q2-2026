from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import json
import logging
from pathlib import Path
from typing import Any

from .client import DownloadedReport, NSEFIIReportsClient, NSEReportNotFound
from .endpoints import parse_trade_date
from .parsers import parse_fii_stats_excel, parse_participant_csv

LOGGER = logging.getLogger(__name__)


@dataclass(frozen=True)
class LivePullResult:
    trade_date: str
    output_dir: str
    manifest_path: str
    reports_found: tuple[str, ...]


class LatestDailyService:
    """Fetch the latest *available daily* NSE F&O participant/FII reports.

    This is called "live" for operational convenience, but the underlying NSE
    files are daily post-close reports rather than streaming intraday data.
    """

    def __init__(
        self,
        client: NSEFIIReportsClient | None = None,
        output_root: str | Path = "data/latest_daily",
    ) -> None:
        self.client = client or NSEFIIReportsClient()
        self.output_root = Path(output_root)

    def pull_latest(
        self,
        *,
        as_of_date: str | datetime | None = None,
        max_lookback_days: int = 10,
        save_parsed: bool = True,
    ) -> LivePullResult:
        start_date = parse_trade_date(as_of_date) if as_of_date else datetime.today()
        start_date = start_date.replace(hour=0, minute=0, second=0, microsecond=0)

        last_error: Exception | None = None
        for offset in range(max_lookback_days + 1):
            trade_date = start_date - timedelta(days=offset)
            if trade_date.weekday() >= 5:
                continue
            try:
                reports = self.client.fetch_all_reports(trade_date)
            except NSEReportNotFound as exc:
                last_error = exc
                LOGGER.info("No full report set for %s", trade_date.strftime("%d-%m-%Y"))
                continue

            out_dir = self.output_root / trade_date.strftime("%Y-%m-%d")
            manifest = self._persist_reports(
                reports=reports,
                out_dir=out_dir,
                save_parsed=save_parsed,
                service_name="latest_daily",
            )
            return LivePullResult(
                trade_date=trade_date.strftime("%d-%m-%Y"),
                output_dir=str(out_dir),
                manifest_path=str(out_dir / "manifest.json"),
                reports_found=tuple(sorted(reports.keys())),
            )

        message = (
            f"Could not find a complete latest report set within {max_lookback_days} days"
        )
        if last_error:
            raise NSEReportNotFound(f"{message}. Last error: {last_error}") from last_error
        raise NSEReportNotFound(message)

    def _persist_reports(
        self,
        *,
        reports: dict[str, DownloadedReport],
        out_dir: Path,
        save_parsed: bool,
        service_name: str,
    ) -> dict[str, Any]:
        raw_dir = out_dir / "raw"
        parsed_dir = out_dir / "parsed"
        raw_dir.mkdir(parents=True, exist_ok=True)
        if save_parsed:
            parsed_dir.mkdir(parents=True, exist_ok=True)

        manifest: dict[str, Any] = {
            "service": service_name,
            "trade_date": next(iter(reports.values())).trade_date if reports else None,
            "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
            "reports": {},
        }

        for report_key, report in reports.items():
            raw_path = raw_dir / report.filename
            raw_path.write_bytes(report.content)
            report_entry: dict[str, Any] = {
                "source_url": report.source_url,
                "raw_path": str(raw_path),
                "bytes": len(report.content),
            }
            if save_parsed:
                parsed_info = self._try_parse(report, parsed_dir)
                report_entry.update(parsed_info)
            manifest["reports"][report_key] = report_entry

        manifest_path = out_dir / "manifest.json"
        manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
        return manifest

    @staticmethod
    def _try_parse(report: DownloadedReport, parsed_dir: Path) -> dict[str, Any]:
        try:
            if report.report_key in {"participant_oi", "participant_volume"}:
                df = parse_participant_csv(report.content)
            elif report.report_key == "fii_stats":
                df = parse_fii_stats_excel(report.content)
            else:
                return {"parsed": False, "parse_error": "unsupported report key"}
        except Exception as exc:  # keep raw files even when parsing fails
            return {"parsed": False, "parse_error": str(exc)}

        parsed_path = parsed_dir / f"{report.filename}.parsed.csv"
        df.to_csv(parsed_path, index=False)
        return {
            "parsed": True,
            "parsed_path": str(parsed_path),
            "row_count": int(len(df)),
            "columns": list(df.columns),
        }


def _main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description="Fetch the latest available NSE daily FII/participant reports.")
    parser.add_argument("--as-of-date", help="Anchor date in DD-MM-YYYY format. Defaults to today.")
    parser.add_argument("--max-lookback-days", type=int, default=10)
    parser.add_argument("--output-root", default="data/latest_daily")
    parser.add_argument("--no-parse", action="store_true")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    service = LatestDailyService(output_root=args.output_root)
    result = service.pull_latest(
        as_of_date=args.as_of_date,
        max_lookback_days=args.max_lookback_days,
        save_parsed=not args.no_parse,
    )
    print(json.dumps({
        "trade_date": result.trade_date,
        "output_dir": result.output_dir,
        "manifest_path": result.manifest_path,
        "reports_found": list(result.reports_found),
    }, indent=2))


if __name__ == "__main__":
    _main()
