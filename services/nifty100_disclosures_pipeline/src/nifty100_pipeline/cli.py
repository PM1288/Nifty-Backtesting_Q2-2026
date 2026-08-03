from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from .config import Settings
from .logging_utils import configure_logging
from .pipeline import run_pipeline
from .postgres_loader import load_combined_csvs_to_postgres
from .utils import parse_date_value, unique_preserve_order


def _apply_common_overrides(settings: Settings, args: argparse.Namespace) -> Settings:
    overrides: dict[str, Any] = {}

    if getattr(args, "symbols", None):
        overrides["symbols"] = unique_preserve_order([item.strip().upper() for item in args.symbols.split(",") if item.strip()])

    date_fields = {
        "nse_fin_start": "nse_fin_start_date",
        "nse_fin_end": "nse_fin_end_date",
        "corp_actions_start": "corp_actions_start_date",
        "corp_actions_end": "corp_actions_end_date",
        "event_start": "event_start_date",
        "event_end": "event_end_date",
    }
    for arg_name, field_name in date_fields.items():
        value = getattr(args, arg_name, None)
        if value:
            parsed = parse_date_value(value)
            if parsed is None:
                raise ValueError(f"Invalid date for --{arg_name.replace('_', '-')}: {value}")
            overrides[field_name] = parsed

    if getattr(args, "output_dir", None):
        overrides["output_dir"] = Path(args.output_dir)
    if getattr(args, "log_level", None):
        overrides["log_level"] = args.log_level
    if getattr(args, "truncate_tables_on_load", None) is not None:
        overrides["truncate_tables_on_load"] = args.truncate_tables_on_load

    return settings.with_overrides(**overrides) if overrides else settings


def _latest_run_metadata_path(settings: Settings) -> Path:
    return settings.latest_run_metadata_path


def _load_latest_run_metadata(settings: Settings) -> dict[str, Any]:
    metadata_path = _latest_run_metadata_path(settings)
    if not metadata_path.exists():
        raise FileNotFoundError(
            f"Could not find latest run metadata at {metadata_path}. Run `extract` or `run-all` first, or pass --run-id."
        )
    return json.loads(metadata_path.read_text(encoding="utf-8"))


def _resolve_run_paths(settings: Settings, run_id: str | None) -> tuple[Path, Path]:
    if run_id:
        run_root = settings.absolute_output_dir / "runs" / run_id
        combined_dir = run_root / "combined"
        manifest_path = run_root / "audit" / "manifest.csv"
        return combined_dir, manifest_path

    latest = _load_latest_run_metadata(settings)
    return Path(latest["combined_dir"]), Path(latest["manifest_path"])


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Nifty 100 disclosures pipeline for nse_financial_results, yf_financial_statements, nse_corporate_actions, and nse_event_calendar"
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    def add_common_extract_args(subparser: argparse.ArgumentParser) -> None:
        subparser.add_argument("--symbols", help="Comma-separated subset of NSE symbols, e.g. RELIANCE,SBIN,INFY")
        subparser.add_argument("--output-dir", help="Override OUTPUT_DIR")
        subparser.add_argument("--log-level", help="Override LOG_LEVEL")
        subparser.add_argument("--nse-fin-start", help="Override NSE_FIN_START_DATE (YYYY-MM-DD)")
        subparser.add_argument("--nse-fin-end", help="Override NSE_FIN_END_DATE (YYYY-MM-DD)")
        subparser.add_argument("--corp-actions-start", help="Override CORP_ACTIONS_START_DATE (YYYY-MM-DD)")
        subparser.add_argument("--corp-actions-end", help="Override CORP_ACTIONS_END_DATE (YYYY-MM-DD)")
        subparser.add_argument("--event-start", help="Override EVENT_START_DATE (YYYY-MM-DD)")
        subparser.add_argument("--event-end", help="Override EVENT_END_DATE (YYYY-MM-DD)")

    extract_parser = subparsers.add_parser("extract", help="Fetch CSV datasets but do not load them to Postgres")
    add_common_extract_args(extract_parser)

    run_all_parser = subparsers.add_parser("run-all", help="Fetch CSV datasets and load them to Postgres")
    add_common_extract_args(run_all_parser)
    run_all_parser.add_argument(
        "--truncate-tables-on-load",
        dest="truncate_tables_on_load",
        action=argparse.BooleanOptionalAction,
        default=None,
        help="When loading into Postgres, truncate destination tables before COPY. Default comes from env.",
    )

    load_parser = subparsers.add_parser("load-postgres", help="Load the latest run, or a specific run, into Postgres")
    load_parser.add_argument("--run-id", help="Specific run ID under data/runs/<run_id>")
    load_parser.add_argument("--output-dir", help="Override OUTPUT_DIR")
    load_parser.add_argument("--log-level", help="Override LOG_LEVEL")
    load_parser.add_argument(
        "--truncate-tables-on-load",
        dest="truncate_tables_on_load",
        action=argparse.BooleanOptionalAction,
        default=None,
        help="When loading into Postgres, truncate destination tables before COPY. Default comes from env.",
    )
    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()

    settings = Settings.from_env()
    settings = _apply_common_overrides(settings, args)
    logger = configure_logging(settings.log_level, log_file=settings.service_logs_dir / "cli.log")

    if args.command == "extract":
        result = run_pipeline(settings, load_postgres=False)
        print(json.dumps({
            "run_id": result.run_id,
            "run_root": str(result.run_root),
            "combined_dir": str(result.combined_dir),
            "manifest_path": str(result.manifest_path),
            "error_log_path": str(result.error_log_path),
            "dataset_row_counts": result.dataset_row_counts,
            "effective_symbols": result.effective_symbols,
        }, indent=2))
        return

    if args.command == "run-all":
        result = run_pipeline(settings, load_postgres=True)
        print(json.dumps({
            "run_id": result.run_id,
            "run_root": str(result.run_root),
            "combined_dir": str(result.combined_dir),
            "manifest_path": str(result.manifest_path),
            "error_log_path": str(result.error_log_path),
            "dataset_row_counts": result.dataset_row_counts,
            "effective_symbols": result.effective_symbols,
            "load_results": result.load_results,
        }, indent=2))
        return

    if args.command == "load-postgres":
        combined_dir, manifest_path = _resolve_run_paths(settings, args.run_id)
        logger.info("Loading combined CSVs from %s", combined_dir)
        load_results = load_combined_csvs_to_postgres(settings, combined_dir=combined_dir, manifest_path=manifest_path, logger=logger)
        print(
            json.dumps(
                {
                    "run_id": args.run_id or _load_latest_run_metadata(settings).get("run_id"),
                    "combined_dir": str(combined_dir),
                    "manifest_path": str(manifest_path),
                    "load_results": load_results,
                },
                indent=2,
            )
        )
        return

    parser.error(f"Unknown command: {args.command}")


if __name__ == "__main__":
    main()
