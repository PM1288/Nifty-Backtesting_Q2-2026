from __future__ import annotations

import argparse
import json
import logging
import sys
import uuid
from dataclasses import asdict, dataclass
from datetime import UTC, date, datetime
from pathlib import Path

import pandas as pd

from .calendar import TradingCalendar
from .config import DatasetSpec, Settings, load_dataset_catalog, load_settings
from .logging_config import configure_logging
from .normalize.bse_bhavcopy import normalize_bse_bhavcopy
from .normalize.bse_index_history import normalize_bse_index_history
from .normalize.nse_bhavcopy import normalize_nse_bhavcopy
from .normalize.nse_bulk_block import normalize_nse_bulk_block
from .normalize.nse_derivatives_participants import normalize_nse_derivatives_participants
from .normalize.nse_fii_dii import normalize_nse_fii_dii
from .normalize.nse_fii_dii_api import normalize_nse_fii_dii_api
from .normalize.nse_participant_oi import normalize_nse_participant_oi
from .normalize.nse_shareholding import normalize_nse_shareholding
from .normalize.nsdl_daily import normalize_nsdl_daily
from .normalize.nsdl_fortnightly import normalize_nsdl_fortnightly
from .normalize.nsdl_history import normalize_nsdl_monthly_history, normalize_nsdl_yearly_history
from .normalize.nsdl_tradewise import normalize_nsdl_tradewise
from .normalize.reference_isin_map import normalize_reference_isin_map
from .qa.completeness import verify_dataset_completeness, write_completion_marker
from .qa.validators import validate_normalized_frame
from .registry import Registry, RegistryPaths
from .sources.bse.discovery import BseDiscoverySource
from .sources.nse.bhavcopy import NseBhavcopySource
from .sources.nse.bulk_block import NseBulkBlockSource
from .sources.nse.cash_api import NseCashApiSource
from .sources.nse.derivatives_participants import NseDerivativesParticipantsSource
from .sources.nse.fii_dii import NseFiiDiiSource
from .sources.nse.isin_sector_map import NseIsinSectorMapSource
from .sources.nse.participant_oi import NseParticipantOiSource
from .sources.nse.security_archives import NseSecurityArchivesSource
from .sources.nse.shareholding import NseShareholdingSource
from .sources.nsdl.daily import NsdlDailySource
from .sources.nsdl.fortnightly import NsdlFortnightlyHistorySource, NsdlFortnightlyLatestSource
from .sources.nsdl.history import NsdlMonthlyHistorySource, NsdlYearlyHistorySource
from .sources.nsdl.tradewise import NsdlTradewiseMonthlySource
from .storage import LocalStorage
from .utils.dates import (
    enumerate_fortnight_dates,
    enumerate_month_starts,
    enumerate_year_starts,
    parse_market_date,
    today_utc,
    years_ago,
)
from .utils.http import HttpClient

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class PipelineContext:
    settings: Settings
    registry: Registry
    storage: LocalStorage
    calendar: TradingCalendar
    client: HttpClient
    run_id: str
    catalog: dict[str, DatasetSpec]


def _registry(settings: Settings) -> Registry:
    return Registry(
        RegistryPaths(
            database_url=settings.database.url,
            schema_name=settings.database.schema_name,
            schema_sql_path=settings.root_dir / "configs" / "warehouse_schema.sql",
            analytics_sql_path=settings.root_dir / "src" / "market_ingest" / "analytics" / "views.sql",
        )
    )


def _source_adapters(client: HttpClient, registry: Registry):
    return {
        "nse_cash_api": NseCashApiSource(client),
        "nse_fii_dii": NseFiiDiiSource(client),
        "nse_bhavcopy": NseBhavcopySource(),
        "nse_bulk_block": NseBulkBlockSource(client),
        "nse_security_archives": NseSecurityArchivesSource(),
        "nse_derivatives_participants": NseDerivativesParticipantsSource(client),
        "nse_participant_oi": NseParticipantOiSource(),
        "nse_isin_sector_map": NseIsinSectorMapSource(),
        "nse_shareholding": NseShareholdingSource(client),
        "nsdl_daily": NsdlDailySource(),
        "nsdl_monthly_history": NsdlMonthlyHistorySource(),
        "nsdl_yearly_history": NsdlYearlyHistorySource(),
        "nsdl_fortnightly_latest": NsdlFortnightlyLatestSource(),
        "nsdl_fortnightly_history": NsdlFortnightlyHistorySource(),
        "nsdl_tradewise_monthly": NsdlTradewiseMonthlySource(),
        "bse_discovery": BseDiscoverySource(client, registry),
    }


def _normalizer(spec: DatasetSpec):
    return {
        "nse_fii_dii_api": lambda payload, **kwargs: normalize_nse_fii_dii_api(payload, spec.exchange_scope or "unknown", **kwargs),
        "nse_fii_dii": lambda payload: normalize_nse_fii_dii(payload, spec.exchange_scope or "unknown"),
        "nse_bhavcopy": normalize_nse_bhavcopy,
        "nse_bulk_block": normalize_nse_bulk_block,
        "nse_derivatives_participants": normalize_nse_derivatives_participants,
        "nse_participant_oi": normalize_nse_participant_oi,
        "nse_shareholding": normalize_nse_shareholding,
        "nsdl_daily": normalize_nsdl_daily,
        "nsdl_monthly_history": normalize_nsdl_monthly_history,
        "nsdl_yearly_history": normalize_nsdl_yearly_history,
        "nsdl_fortnightly": normalize_nsdl_fortnightly,
        "nsdl_tradewise": normalize_nsdl_tradewise,
        "reference_isin_map": normalize_reference_isin_map,
        "bse_bhavcopy": normalize_bse_bhavcopy,
        "bse_index_history": normalize_bse_index_history,
    }[spec.normalizer]


def _required_columns(spec: DatasetSpec) -> list[str]:
    if spec.normalizer in {"nse_fii_dii", "nse_fii_dii_api"}:
        return ["participant_type", "buy_value", "sell_value", "net_value"]
    if spec.normalizer == "nse_bhavcopy":
        return ["symbol", "close"]
    if spec.normalizer in {"nse_derivatives_participants", "nse_participant_oi"}:
        return ["client_type"]
    if spec.normalizer == "nsdl_daily":
        return ["market_date", "total_net"]
    if spec.normalizer == "nsdl_fortnightly":
        return ["market_date", "sector", "total_net_inr"]
    return []


def _resolved_frame_market_date(frame: pd.DataFrame) -> date | None:
    if "market_date" not in frame.columns or frame.empty:
        return None
    values = [value for value in frame["market_date"].dropna().unique().tolist() if isinstance(value, date)]
    if len(values) == 1:
        return values[0]
    return None


def _allows_html(spec: DatasetSpec) -> bool:
    return spec.normalizer in {
        "nsdl_daily",
        "nsdl_monthly_history",
        "nsdl_yearly_history",
        "nsdl_fortnightly",
        "nse_shareholding",
    }


def _expected_partitions(spec: DatasetSpec, calendar: TradingCalendar, start_date: date, end_date: date) -> list[date | None]:
    if spec.frequency == "daily":
        return calendar.iter_expected_dates(start_date, end_date, spec.frequency)
    if not spec.backfill_partitioned:
        return [None]
    if spec.period_kind == "monthly":
        return enumerate_month_starts(start_date, end_date)
    if spec.period_kind == "yearly":
        return enumerate_year_starts(start_date, end_date)
    if spec.period_kind == "fortnightly":
        return enumerate_fortnight_dates(start_date, end_date)
    return [None]


def build_context(root_dir: Path | None = None) -> PipelineContext:
    settings = load_settings(root_dir=root_dir)
    configure_logging(settings.paths.logs_root, settings.log_level)
    registry = _registry(settings)
    registry.initialize()
    storage = LocalStorage(settings.paths.raw_root, settings.paths.staging_root, settings.paths.curated_root)
    calendar = TradingCalendar.from_strings(settings.holiday_overrides)
    client = HttpClient(
        user_agent=settings.network.user_agent,
        timeout_seconds=settings.network.timeout_seconds,
        max_retries=settings.network.max_retries,
        polite_pause_seconds=settings.network.polite_pause_seconds,
    )
    catalog = load_dataset_catalog(settings)
    return PipelineContext(settings, registry, storage, calendar, client, uuid.uuid4().hex, catalog)


def discover_sources(ctx: PipelineContext, datasets: list[DatasetSpec], market_date: date | None) -> dict[str, list[dict]]:
    adapters = _source_adapters(ctx.client, ctx.registry)
    report: dict[str, list[dict]] = {}
    for spec in datasets:
        adapter = adapters[spec.adapter]
        try:
            discovered = adapter.discover(spec, market_date)
            notes = spec.notes if discovered else "No public endpoint discovered from configured anchor"
            error_class = None
            error_message = None
        except Exception as exc:  # noqa: BLE001
            discovered = []
            notes = f"Discovery failed: {exc}"
            error_class = exc.__class__.__name__
            error_message = str(exc)
        ctx.registry.write_capability(
            {
                "dataset_name": spec.dataset_name,
                "source_system": spec.source_system,
                "public_endpoint_verified": bool(discovered),
                "requires_browser_fallback": False,
                "is_paid_only": False,
                "notes": notes,
                "last_verified_at": datetime.now(UTC),
            }
        )
        if error_message:
            _record_event(
                ctx,
                spec,
                market_date,
                None,
                "failed",
                discovered_at=datetime.now(UTC),
                error_class=error_class,
                error_message=error_message,
            )
        report[spec.dataset_name] = [asdict(item) for item in discovered]
    return report


def _record_event(ctx: PipelineContext, spec: DatasetSpec, market_date: date | None, source_url: str | None, status: str, **kwargs) -> None:
    payload = {
        "dataset_name": spec.dataset_name,
        "market_date": market_date,
        "source_system": spec.source_system,
        "source_url": source_url,
        "local_raw_path": kwargs.get("local_raw_path"),
        "checksum_sha256": kwargs.get("checksum_sha256"),
        "content_length": kwargs.get("content_length"),
        "http_status": kwargs.get("http_status"),
        "discovered_at": kwargs.get("discovered_at"),
        "downloaded_at": kwargs.get("downloaded_at"),
        "normalized_at": kwargs.get("normalized_at"),
        "row_count_raw": kwargs.get("row_count_raw"),
        "row_count_normalized": kwargs.get("row_count_normalized"),
        "status": status,
        "error_class": kwargs.get("error_class"),
        "error_message": kwargs.get("error_message"),
        "retry_count": kwargs.get("retry_count", 0),
        "run_id": ctx.run_id,
    }
    ctx.registry.write_registry_event(payload)


def process_dataset_date(ctx: PipelineContext, spec: DatasetSpec, market_date: date | None, force: bool = False, dry_run: bool = False) -> dict:
    adapters = _source_adapters(ctx.client, ctx.registry)
    try:
        discovered = adapters[spec.adapter].discover(spec, market_date)
    except Exception as exc:  # noqa: BLE001
        ctx.registry.write_capability(
            {
                "dataset_name": spec.dataset_name,
                "source_system": spec.source_system,
                "public_endpoint_verified": False,
                "requires_browser_fallback": False,
                "is_paid_only": False,
                "notes": f"Discovery failed: {exc}",
                "last_verified_at": datetime.now(UTC),
            }
        )
        _record_event(
            ctx,
            spec,
            market_date,
            None,
            "failed",
            discovered_at=datetime.now(UTC),
            error_class=exc.__class__.__name__,
            error_message=str(exc),
        )
        return {
            "dataset_name": spec.dataset_name,
            "market_date": str(market_date) if market_date else None,
            "status": "failed",
            "error": str(exc),
        }
    if not discovered:
        ctx.registry.write_capability(
            {
                "dataset_name": spec.dataset_name,
                "source_system": spec.source_system,
                "public_endpoint_verified": False,
                "requires_browser_fallback": False,
                "is_paid_only": False,
                "notes": f"No public source discovered for {spec.dataset_name}",
                "last_verified_at": datetime.now(UTC),
            }
        )
        _record_event(ctx, spec, market_date, None, "unavailable", discovered_at=datetime.now(UTC), error_message="No public source discovered")
        return {"dataset_name": spec.dataset_name, "market_date": str(market_date) if market_date else None, "status": "unavailable"}
    normalizer = _normalizer(spec)
    failures: list[dict] = []
    for item in discovered:
        source_market_date = item.market_date or market_date
        _record_event(ctx, spec, source_market_date, item.source_url, "discovered", discovered_at=datetime.now(UTC))
        if dry_run:
            return {
                "dataset_name": spec.dataset_name,
                "market_date": str(source_market_date) if source_market_date else None,
                "status": "discovered",
                "source_url": item.source_url,
                "discovered_candidates": [source.source_url for source in discovered],
            }
        try:
            download = ctx.client.download(item.source_url, allow_html=_allows_html(spec))
            stored = ctx.storage.store_raw_file(spec.dataset_name, source_market_date, item.file_name, download.content)
            if stored.already_present and not force and ctx.registry.partition_is_loaded(spec.dataset_name, source_market_date):
                if not ctx.settings.runtime.retain_raw_files:
                    ctx.storage.delete_file(stored.path)
                _record_event(
                    ctx,
                    spec,
                    source_market_date,
                    item.source_url,
                    "skipped",
                    local_raw_path=str(stored.path),
                    checksum_sha256=stored.checksum_sha256,
                    content_length=stored.content_length,
                    http_status=download.status_code,
                    downloaded_at=datetime.now(UTC),
                )
                return {"dataset_name": spec.dataset_name, "market_date": str(source_market_date) if source_market_date else None, "status": "skipped"}
            payload = download.content if not stored.already_present else stored.path.read_bytes()
            frame = normalizer(payload, market_date=source_market_date, spec=spec, registry=ctx.registry)
            if source_market_date is not None and "market_date" not in frame.columns:
                frame["market_date"] = source_market_date
            resolved_market_date = _resolved_frame_market_date(frame) or source_market_date
            ctx.registry.record_raw_version(spec.dataset_name, resolved_market_date, item.file_name, stored.checksum_sha256, str(stored.path))
            issues = validate_normalized_frame(frame, resolved_market_date, _required_columns(spec))
            hard_errors = [issue for issue in issues if issue.severity == "error"]
            if hard_errors:
                raise RuntimeError("; ".join(issue.message for issue in hard_errors))
            curated = None
            if ctx.settings.runtime.retain_curated_files:
                curated = ctx.storage.write_curated_partition(spec.dataset_name, frame, resolved_market_date)
            ctx.registry.store_normalized_frame(spec.dataset_name, frame)
            if not ctx.settings.runtime.retain_raw_files:
                ctx.storage.delete_file(stored.path)
            if curated is not None and not ctx.settings.runtime.retain_curated_files:
                ctx.storage.delete_file(curated)
            _record_event(
                ctx,
                spec,
                resolved_market_date,
                item.source_url,
                "normalized",
                local_raw_path=str(stored.path),
                checksum_sha256=stored.checksum_sha256,
                content_length=stored.content_length,
                http_status=download.status_code,
                downloaded_at=datetime.now(UTC),
                normalized_at=datetime.now(UTC),
                row_count_raw=len(frame),
                row_count_normalized=len(frame),
            )
            logger.info(
                "dataset_normalized",
                extra={
                    "run_id": ctx.run_id,
                    "dataset_name": spec.dataset_name,
                    "market_date": resolved_market_date.isoformat() if resolved_market_date else None,
                    "step": "normalize_complete",
                    "source_url": item.source_url,
                    "status": "normalized",
                    "rows": len(frame),
                    "file_path": str(curated) if curated is not None else None,
                    "checksum": stored.checksum_sha256,
                },
            )
            return {
                "dataset_name": spec.dataset_name,
                "market_date": str(resolved_market_date) if resolved_market_date else None,
                "status": "normalized",
                "rows": len(frame),
                "curated_path": str(curated) if curated is not None else None,
                "raw_retained": ctx.settings.runtime.retain_raw_files,
                "curated_retained": ctx.settings.runtime.retain_curated_files,
            }
        except Exception as exc:  # noqa: BLE001
            _record_event(
                ctx,
                spec,
                source_market_date,
                item.source_url,
                "failed",
                error_class=exc.__class__.__name__,
                error_message=str(exc),
                downloaded_at=datetime.now(UTC),
            )
            failures.append({"source_url": item.source_url, "error": str(exc), "error_class": exc.__class__.__name__})
            if "stored" in locals() and stored.path.exists() and not ctx.settings.runtime.retain_raw_files:
                ctx.storage.delete_file(stored.path)
    return {
        "dataset_name": spec.dataset_name,
        "market_date": str(market_date) if market_date else None,
        "status": "failed",
        "failures": failures,
    }


def _selected_specs(ctx: PipelineContext, datasets: list[str] | None) -> list[DatasetSpec]:
    if not datasets:
        return [spec for spec in ctx.catalog.values() if spec.enabled]
    return [ctx.catalog[name] for name in datasets]


def run_bootstrap(ctx: PipelineContext, datasets: list[str] | None, from_date: date | None, to_date: date | None, force: bool, dry_run: bool) -> dict:
    if ctx.registry.completion_is_valid(ctx.settings.paths.completion_marker) and not force and not dry_run:
        return {"run_id": ctx.run_id, "status": "noop", "message": "bootstrap completeness marker already valid"}
    selected = _selected_specs(ctx, datasets)
    end_date = to_date or ctx.calendar.previous_trading_day(today_utc())
    start_date = from_date or years_ago(end_date, ctx.settings.runtime.default_lookback_years)
    plan: list[dict] = []
    results: list[dict] = []
    for spec in selected:
        expected = _expected_partitions(spec, ctx.calendar, start_date, end_date)
        if spec.frequency == "daily" or spec.backfill_partitioned:
            existing = ctx.registry.normalized_dates(spec.dataset_name, start_date, end_date)
            missing = [item for item in expected if item is None or item not in existing]
        else:
            missing = [] if ctx.registry.has_normalized_content(spec.dataset_name) else expected
        for market_date in missing:
            plan.append({"dataset_name": spec.dataset_name, "market_date": market_date.isoformat() if market_date else None})
            results.append(process_dataset_date(ctx, spec, market_date, force=force, dry_run=dry_run))
        verify_dataset_completeness(ctx.registry, ctx.calendar, spec, start_date, end_date)
    summary = {
        "run_id": ctx.run_id,
        "mode": "bootstrap",
        "status": "completed",
        "plan_count": len(plan),
        "result_count": len(results),
        "plan": plan,
        "results": results,
    }
    if not dry_run:
        write_completion_marker(
            ctx.settings.paths.completion_marker,
            {"run_id": ctx.run_id, "completed_at": datetime.now(UTC).isoformat(), "from_date": start_date.isoformat(), "to_date": end_date.isoformat()},
        )
    return summary


def run_daily(ctx: PipelineContext, datasets: list[str] | None, late_arrival_window: int, force: bool, dry_run: bool) -> dict:
    selected = _selected_specs(ctx, datasets)
    anchor = ctx.calendar.previous_trading_day(today_utc())
    repair_dates = []
    cursor = anchor
    for _ in range(max(1, late_arrival_window)):
        repair_dates.append(cursor)
        cursor = ctx.calendar.previous_trading_day(cursor)
    results = []
    for spec in selected:
        if spec.frequency != "daily":
            continue
        target_dates = repair_dates
        if spec.adapter in {"nsdl_daily", "nsdl_fortnightly_latest"}:
            target_dates = repair_dates[:1]
        for market_date in target_dates:
            results.append(process_dataset_date(ctx, spec, market_date, force=force, dry_run=dry_run))
    return {"run_id": ctx.run_id, "mode": "daily", "anchor_date": anchor.isoformat(), "results": results}


def run_verify(ctx: PipelineContext, datasets: list[str] | None, from_date: date | None, to_date: date | None) -> dict:
    selected = _selected_specs(ctx, datasets)
    end_date = to_date or ctx.calendar.previous_trading_day(today_utc())
    start_date = from_date or years_ago(end_date, ctx.settings.runtime.default_lookback_years)
    results = {}
    for spec in selected:
        results[spec.dataset_name] = [asdict(item) for item in verify_dataset_completeness(ctx.registry, ctx.calendar, spec, start_date, end_date)]
    return {"run_id": ctx.run_id, "mode": "verify", "results": results}


def run_discovery(ctx: PipelineContext, datasets: list[str] | None, market_date: date | None) -> dict:
    selected = _selected_specs(ctx, datasets)
    report = discover_sources(ctx, selected, market_date)
    return {"run_id": ctx.run_id, "mode": "discover", "results": report}


def _write_report(ctx: PipelineContext, payload: dict, suffix: str) -> Path:
    ctx.settings.paths.run_reports_root.mkdir(parents=True, exist_ok=True)
    target = ctx.settings.paths.run_reports_root / f"{datetime.now(UTC):%Y%m%dT%H%M%SZ}_{suffix}.json"
    target.write_text(json.dumps(payload, indent=2, default=str), encoding="utf-8")
    return target


def _write_named_report(ctx: PipelineContext, payload: dict, file_name: str) -> Path:
    ctx.settings.paths.run_reports_root.mkdir(parents=True, exist_ok=True)
    target = ctx.settings.paths.run_reports_root / file_name
    target.write_text(json.dumps(payload, indent=2, default=str), encoding="utf-8")
    return target


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=["bootstrap", "daily", "verify", "discover"])
    parser.add_argument("--datasets", nargs="*")
    parser.add_argument("--from-date")
    parser.add_argument("--to-date")
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--late-arrival-window", type=int)
    parser.add_argument("--config")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_arg_parser()
    args = parser.parse_args(argv)
    root_dir = Path(__file__).resolve().parents[2]
    ctx = build_context(root_dir=root_dir)
    if args.config:
        logger.warning("custom config path override is not yet wired; using runtime env/catalog defaults")
    from_date = parse_market_date(args.from_date)
    to_date = parse_market_date(args.to_date)
    if args.mode == "bootstrap":
        payload = run_bootstrap(ctx, args.datasets, from_date, to_date, args.force, args.dry_run)
        _write_named_report(ctx, payload.get("plan", []), "backfill_plan.json")
        _write_named_report(ctx, payload.get("results", []), "backfill_results.json")
        _write_report(ctx, {"backfill_plan": payload.get("plan", []), "backfill_results": payload.get("results", [])}, "backfill")
    elif args.mode == "daily":
        payload = run_daily(ctx, args.datasets, args.late_arrival_window or ctx.settings.runtime.late_arrival_window, args.force, args.dry_run)
        _write_report(ctx, payload, "daily_summary")
    elif args.mode == "verify":
        payload = run_verify(ctx, args.datasets, from_date, to_date)
        _write_report(ctx, payload, "verify")
    else:
        payload = run_discovery(ctx, args.datasets, to_date or from_date)
        _write_report(ctx, payload, "discovery")
    print(json.dumps(payload, indent=2, default=str))
    ctx.registry.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
