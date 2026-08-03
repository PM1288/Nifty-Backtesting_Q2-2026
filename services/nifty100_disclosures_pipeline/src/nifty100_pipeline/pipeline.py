from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import pandas as pd

from .config import Settings
from .db_schema import dataset_to_table_map
from .logging_utils import configure_logging
from .nse_fetchers import (
    fetch_nifty100_universe,
    fetch_nse_corporate_actions,
    fetch_nse_event_calendar,
    fetch_nse_financial_results,
)
from .postgres_loader import load_combined_csvs_to_postgres
from .writer import (
    dataset_raw_dir,
    manifest_row,
    write_combined_csv,
    write_error_log,
    write_latest_run_metadata,
    write_manifest,
    write_symbol_csv,
)
from .yf_fetchers import fetch_yf_financial_statements_for_symbol

EXPECTED_NIFTY100_SYMBOL_COUNT = 100

EMPTY_COLUMNS = {
    "nse_financial_results": [
        "run_id",
        "fetched_at",
        "symbol",
        "company_name",
        "scrip_code",
        "financial_statement_period",
        "reporting_quarter",
        "period_start_date",
        "period_end_date",
        "board_meeting_date",
        "audited_status",
        "report_nature",
        "presentation_currency",
        "metric_name",
        "metric_value",
        "metric_value_num",
        "source",
    ],
    "yf_financial_statements": [
        "run_id",
        "fetched_at",
        "symbol",
        "statement_name",
        "period_type",
        "period_end",
        "metric_name",
        "metric_value",
        "metric_value_num",
        "source",
    ],
    "nse_corporate_actions": [
        "run_id",
        "fetched_at",
        "symbol",
        "company_name",
        "series",
        "purpose",
        "face_value",
        "ex_date",
        "record_date",
        "book_closure_start_date",
        "book_closure_end_date",
        "source",
        "raw_json",
    ],
    "nse_event_calendar": [
        "run_id",
        "fetched_at",
        "symbol",
        "company_name",
        "purpose",
        "details",
        "event_date",
        "attachment",
        "broadcast_datetime",
        "source",
        "raw_json",
    ],
}


@dataclass
class PipelineResult:
    run_id: str
    run_root: Path
    combined_dir: Path
    manifest_path: Path
    error_log_path: Path
    latest_run_metadata_path: Path
    dataset_row_counts: dict[str, int] = field(default_factory=dict)
    load_results: list[dict[str, Any]] = field(default_factory=list)
    effective_symbols: list[str] = field(default_factory=list)


class Nifty100DisclosuresPipeline:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.settings.ensure_runtime_dirs()
        self.logger = configure_logging(
            settings.log_level,
            log_file=self.settings.logs_dir / "pipeline.log",
        )
        self.manifest_rows: list[dict[str, Any]] = []
        self.error_rows: list[dict[str, Any]] = []
        self.dataset_row_counts: dict[str, int] = {}
        self.dataset_table_map = dataset_to_table_map(settings.postgres_schema, settings.audit_schema)

    def _empty_df(self, dataset_name: str) -> pd.DataFrame:
        return pd.DataFrame(columns=EMPTY_COLUMNS[dataset_name])

    def _record_dataset(self, dataset_name: str, df: pd.DataFrame) -> Path:
        combined_path = write_combined_csv(df, self.settings, dataset_name)
        self.manifest_rows.append(
            manifest_row(
                self.settings,
                dataset_name=dataset_name,
                table_name=self.dataset_table_map.get(dataset_name, dataset_name),
                row_count=len(df),
                status="SUCCESS" if len(df) > 0 else "EMPTY",
                combined_file=combined_path,
                raw_dir=dataset_raw_dir(self.settings, dataset_name),
            )
        )
        self.dataset_row_counts[dataset_name] = len(df)
        return combined_path

    def _write_grouped_raw(self, dataset_name: str, df: pd.DataFrame) -> None:
        if df.empty or "symbol" not in df.columns:
            return
        for symbol, group_df in df.groupby("symbol", sort=True):
            write_symbol_csv(group_df.reset_index(drop=True), self.settings, dataset_name, str(symbol))

    def run(self, load_postgres: bool = False) -> PipelineResult:
        self.logger.info("Starting Nifty 100 disclosures pipeline run: %s", self.settings.run_id)

        universe_df, universe_errors = fetch_nifty100_universe(self.settings, self.logger)
        self.error_rows.extend(universe_errors)
        if universe_df.empty:
            raise RuntimeError("Universe fetch returned zero rows; cannot continue.")

        effective_symbols = self.settings.effective_symbols(universe_df["symbol"].tolist())
        universe_df = universe_df[universe_df["symbol"].isin(effective_symbols)].reset_index(drop=True)
        if not self.settings.symbols and len(effective_symbols) != EXPECTED_NIFTY100_SYMBOL_COUNT:
            raise RuntimeError(
                "Expected a full Nifty 100 universe with "
                f"{EXPECTED_NIFTY100_SYMBOL_COUNT} symbols, got {len(effective_symbols)}. "
                "Set SYMBOLS explicitly for subset runs or fix the upstream universe fetch first."
            )
        self.logger.info("Universe ready with %d symbols", len(universe_df))

        yf_statement_frames: list[pd.DataFrame] = []
        total_symbols = len(universe_df)
        for index, universe_row in enumerate(universe_df.to_dict(orient="records"), start=1):
            symbol = universe_row["symbol"]
            self.logger.info("[%d/%d] Fetching yfinance financial statements for %s", index, total_symbols, symbol)

            yf_statement_df, yf_errors = fetch_yf_financial_statements_for_symbol(
                universe_row,
                self.settings,
                self.logger,
            )
            self.error_rows.extend(yf_errors)
            if not yf_statement_df.empty:
                yf_statement_frames.append(yf_statement_df)
                write_symbol_csv(yf_statement_df, self.settings, "yf_financial_statements", symbol)

        yf_financials_df = (
            pd.concat(yf_statement_frames, ignore_index=True)
            if yf_statement_frames
            else self._empty_df("yf_financial_statements")
        )
        if not yf_financials_df.empty:
            yf_financials_df = yf_financials_df.drop_duplicates(
                subset=["symbol", "statement_name", "period_type", "period_end", "metric_name"]
            ).reset_index(drop=True)
        self._record_dataset("yf_financial_statements", yf_financials_df)

        nse_financial_results_df, nse_fin_errors = fetch_nse_financial_results(effective_symbols, self.settings, self.logger)
        self.error_rows.extend(nse_fin_errors)
        if nse_financial_results_df.empty:
            nse_financial_results_df = self._empty_df("nse_financial_results")
        else:
            self._write_grouped_raw("nse_financial_results", nse_financial_results_df)
        self._record_dataset("nse_financial_results", nse_financial_results_df)

        nse_corporate_actions_df, ca_errors = fetch_nse_corporate_actions(effective_symbols, self.settings, self.logger)
        self.error_rows.extend(ca_errors)
        if nse_corporate_actions_df.empty:
            nse_corporate_actions_df = self._empty_df("nse_corporate_actions")
        else:
            self._write_grouped_raw("nse_corporate_actions", nse_corporate_actions_df)
        self._record_dataset("nse_corporate_actions", nse_corporate_actions_df)

        nse_event_calendar_df, event_errors = fetch_nse_event_calendar(effective_symbols, self.settings, self.logger)
        self.error_rows.extend(event_errors)
        if nse_event_calendar_df.empty:
            nse_event_calendar_df = self._empty_df("nse_event_calendar")
        else:
            self._write_grouped_raw("nse_event_calendar", nse_event_calendar_df)
        self._record_dataset("nse_event_calendar", nse_event_calendar_df)

        manifest_path = write_manifest(self.manifest_rows, self.settings)
        error_log_path = write_error_log(self.error_rows, self.settings)

        latest_summary = {
            "run_id": self.settings.run_id,
            "run_root": str(self.settings.run_root),
            "combined_dir": str(self.settings.combined_dir),
            "manifest_path": str(manifest_path),
            "error_log_path": str(error_log_path),
            "dataset_row_counts": self.dataset_row_counts,
            "postgres_schema": self.settings.postgres_schema,
            "audit_schema": self.settings.audit_schema,
            "effective_symbols": effective_symbols,
            "effective_symbol_count": len(effective_symbols),
        }

        load_results: list[dict[str, Any]] = []
        if load_postgres:
            self.logger.info("Loading combined CSVs to Postgres")
            load_results = load_combined_csvs_to_postgres(
                self.settings,
                combined_dir=self.settings.combined_dir,
                manifest_path=manifest_path,
                logger=self.logger,
            )
            latest_summary["load_results"] = load_results

        latest_run_metadata_path = write_latest_run_metadata(latest_summary, self.settings)

        self.logger.info("Pipeline run complete: %s", self.settings.run_id)
        self.logger.info("Combined CSV dir: %s", self.settings.combined_dir)
        return PipelineResult(
            run_id=self.settings.run_id,
            run_root=self.settings.run_root,
            combined_dir=self.settings.combined_dir,
            manifest_path=manifest_path,
            error_log_path=error_log_path,
            latest_run_metadata_path=latest_run_metadata_path,
            dataset_row_counts=self.dataset_row_counts,
            load_results=load_results,
            effective_symbols=effective_symbols,
        )


def run_pipeline(settings: Settings, load_postgres: bool = False) -> PipelineResult:
    return Nifty100DisclosuresPipeline(settings).run(load_postgres=load_postgres)
