from __future__ import annotations

import io
import logging
import time
import xml.etree.ElementTree as ET
from collections.abc import Iterable
from datetime import date
from typing import Any

import pandas as pd
import requests

from .config import Settings
from .transforms import (
    melt_nse_financial_results,
    normalize_universe,
    standardize_nse_corporate_actions,
    standardize_nse_event_calendar,
)
from .utils import date_chunks, normalize_columns, now_utc, retry_call
from .writer import error_row

NIFTY100_INDEX_CATEGORY = "BroadMarketIndices"
NIFTY100_INDEX_NAME = "Nifty 100"
NIFTY100_ARCHIVE_CSV_URL = "https://nsearchives.nseindia.com/content/indices/ind_nifty100list.csv"
NSE_ARCHIVE_HEADERS = {
    "User-Agent": "Mozilla/5.0",
    "Referer": "https://www.nseindia.com/",
    "Accept": "text/csv,application/csv,text/plain,*/*",
}


def _fmt_nse_date(value: date) -> str:
    return value.strftime("%d-%m-%Y")


def fetch_nifty100_universe(settings: Settings, logger: logging.Logger) -> tuple[pd.DataFrame, list[dict[str, Any]]]:
    errors: list[dict[str, Any]] = []
    fetched_at = now_utc()
    source = "nselib_indices"
    try:
        from nselib import indices  # lazy import
        raw_df = retry_call(
            indices.constituent_stock_list,
            index_category=NIFTY100_INDEX_CATEGORY,
            index_name=NIFTY100_INDEX_NAME,
            attempts=settings.request_retries,
            sleep_seconds=settings.request_sleep_seconds,
        )
    except Exception as exc:
        logger.warning("nselib constituent fetch failed, falling back to official archived CSV: %s", exc)
        source = "nse_official_archive_csv"
        try:
            response = retry_call(
                requests.get,
                NIFTY100_ARCHIVE_CSV_URL,
                headers=NSE_ARCHIVE_HEADERS,
                timeout=30,
                attempts=settings.request_retries,
                sleep_seconds=settings.request_sleep_seconds,
            )
            response.raise_for_status()
            raw_df = pd.read_csv(io.BytesIO(response.content))
        except Exception as fallback_exc:
            errors.append(
                error_row(
                    settings,
                    dataset_name="_universe",
                    symbol=None,
                    message=f"Failed to fetch Nifty 100 constituents via nselib and official CSV: {fallback_exc}",
                )
            )
            raise
    normalized = normalize_universe(
        raw_df,
        index_category=NIFTY100_INDEX_CATEGORY,
        index_name=NIFTY100_INDEX_NAME,
        fetched_at=fetched_at,
        run_id=settings.run_id,
        source=source,
    )
    return normalized, errors


def _parse_xbrl_url(xbrl_url: str, headers: dict[str, str], ns: dict[str, str], keys_to_extract: list[str]) -> dict[str, Any]:
    response = requests.get(xbrl_url, headers=headers, timeout=60)
    response.raise_for_status()
    root = ET.fromstring(response.content)
    extracted: dict[str, Any] = {}
    for key in keys_to_extract:
        elem = root.find(f".//in-bse-fin:{key}", ns)
        extracted[key] = elem.text if elem is not None else None
    return extracted


def fetch_nse_financial_results(
    symbols: Iterable[str],
    settings: Settings,
    logger: logging.Logger,
) -> tuple[pd.DataFrame, list[dict[str, Any]]]:
    from nselib.capital_market.get_func import get_financial_results_master  # lazy import

    target_symbols = {symbol.upper() for symbol in symbols}
    fetched_at = now_utc()
    parsed_rows: list[dict[str, Any]] = []
    errors: list[dict[str, Any]] = []
    source = "nse_financial_results_xbrl"

    for fin_period in ["Quarterly", "Annual"]:
        for chunk_start, chunk_end in date_chunks(settings.nse_fin_start_date, settings.nse_fin_end_date, chunk_days=365):
            logger.info("Fetching NSE financial results master | period=%s | chunk=%s to %s", fin_period, chunk_start, chunk_end)
            try:
                master_df, headers, ns, keys_to_extract = retry_call(
                    get_financial_results_master,
                    from_date=_fmt_nse_date(chunk_start),
                    to_date=_fmt_nse_date(chunk_end),
                    fin_period=fin_period,
                    fo_sec=False,
                    attempts=settings.request_retries,
                    sleep_seconds=settings.request_sleep_seconds,
                )
            except Exception as exc:
                errors.append(
                    error_row(
                        settings,
                        dataset_name="nse_financial_results",
                        symbol=None,
                        message=f"Failed to fetch financial results master for {fin_period} {chunk_start} to {chunk_end}: {exc}",
                    )
                )
                continue

            if master_df is None or master_df.empty:
                continue

            master_df = normalize_columns(master_df)
            if "symbol" not in master_df.columns:
                errors.append(
                    error_row(
                        settings,
                        dataset_name="nse_financial_results",
                        symbol=None,
                        message="Financial results master payload did not include a symbol column",
                        context={"columns": list(master_df.columns)},
                    )
                )
                continue

            master_df["symbol"] = master_df["symbol"].astype(str).str.upper()
            master_df["financial_statement_period"] = fin_period
            subset_cols = [col for col in ["symbol", "xbrl", "broadcastdate", "periodended"] if col in master_df.columns]
            filtered_master = master_df[master_df["symbol"].isin(target_symbols)].copy()
            if subset_cols:
                filtered_master = filtered_master.drop_duplicates(subset=subset_cols)

            for row in filtered_master.to_dict(orient="records"):
                symbol = str(row.get("symbol", "")).upper()
                xbrl_url = row.get("xbrl")
                if not xbrl_url:
                    errors.append(
                        error_row(
                            settings,
                            dataset_name="nse_financial_results",
                            symbol=symbol,
                            message="Skipped financial result row because xbrl URL was missing",
                            context={"row": row},
                        )
                    )
                    continue
                try:
                    xbrl_values = retry_call(
                        _parse_xbrl_url,
                        xbrl_url,
                        headers,
                        ns,
                        keys_to_extract,
                        attempts=settings.request_retries,
                        sleep_seconds=settings.request_sleep_seconds,
                        retry_on=(requests.RequestException, ET.ParseError, RuntimeError),
                    )
                    combined = dict(row)
                    combined.update(xbrl_values)
                    parsed_rows.append(combined)
                except Exception as exc:
                    errors.append(
                        error_row(
                            settings,
                            dataset_name="nse_financial_results",
                            symbol=symbol,
                            message=f"Failed to parse XBRL for {symbol}: {exc}",
                            context={"xbrl": xbrl_url},
                        )
                    )
                time.sleep(settings.request_sleep_seconds)

    wide_df = pd.DataFrame(parsed_rows)
    melted = melt_nse_financial_results(wide_df, fetched_at=fetched_at, run_id=settings.run_id, source=source)
    return melted, errors


def fetch_nse_corporate_actions(
    symbols: Iterable[str],
    settings: Settings,
    logger: logging.Logger,
) -> tuple[pd.DataFrame, list[dict[str, Any]]]:
    from nselib import capital_market  # lazy import

    target_symbols = {symbol.upper() for symbol in symbols}
    fetched_at = now_utc()
    errors: list[dict[str, Any]] = []
    collected: list[pd.DataFrame] = []
    for chunk_start, chunk_end in date_chunks(settings.corp_actions_start_date, settings.corp_actions_end_date, chunk_days=365):
        logger.info("Fetching NSE corporate actions | chunk=%s to %s", chunk_start, chunk_end)
        try:
            raw_df = retry_call(
                capital_market.corporate_actions_for_equity,
                from_date=_fmt_nse_date(chunk_start),
                to_date=_fmt_nse_date(chunk_end),
                fno_only=False,
                attempts=settings.request_retries,
                sleep_seconds=settings.request_sleep_seconds,
            )
        except Exception as exc:
            errors.append(
                error_row(
                    settings,
                    dataset_name="nse_corporate_actions",
                    symbol=None,
                    message=f"Failed to fetch corporate actions for {chunk_start} to {chunk_end}: {exc}",
                )
            )
            continue
        if raw_df is None or raw_df.empty:
            continue
        normalized = normalize_columns(raw_df)
        if "symbol" in normalized.columns:
            normalized["symbol"] = normalized["symbol"].astype(str).str.upper()
            normalized = normalized[normalized["symbol"].isin(target_symbols)].copy()
        collected.append(normalized)
    combined = pd.concat(collected, ignore_index=True) if collected else pd.DataFrame()
    standardized = standardize_nse_corporate_actions(combined, fetched_at=fetched_at, run_id=settings.run_id, source="nse_corporate_actions_api")
    return standardized, errors


def fetch_nse_event_calendar(
    symbols: Iterable[str],
    settings: Settings,
    logger: logging.Logger,
) -> tuple[pd.DataFrame, list[dict[str, Any]]]:
    from nselib import capital_market  # lazy import

    target_symbols = {symbol.upper() for symbol in symbols}
    fetched_at = now_utc()
    errors: list[dict[str, Any]] = []
    collected: list[pd.DataFrame] = []
    for chunk_start, chunk_end in date_chunks(settings.event_start_date, settings.event_end_date, chunk_days=365):
        logger.info("Fetching NSE event calendar | chunk=%s to %s", chunk_start, chunk_end)
        try:
            raw_df = retry_call(
                capital_market.event_calendar_for_equity,
                from_date=_fmt_nse_date(chunk_start),
                to_date=_fmt_nse_date(chunk_end),
                fno_only=False,
                attempts=settings.request_retries,
                sleep_seconds=settings.request_sleep_seconds,
            )
        except Exception as exc:
            errors.append(
                error_row(
                    settings,
                    dataset_name="nse_event_calendar",
                    symbol=None,
                    message=f"Failed to fetch event calendar for {chunk_start} to {chunk_end}: {exc}",
                )
            )
            continue
        if raw_df is None or raw_df.empty:
            continue
        normalized = normalize_columns(raw_df)
        if "symbol" in normalized.columns:
            normalized["symbol"] = normalized["symbol"].astype(str).str.upper()
            normalized = normalized[normalized["symbol"].isin(target_symbols)].copy()
        collected.append(normalized)
    combined = pd.concat(collected, ignore_index=True) if collected else pd.DataFrame()
    standardized = standardize_nse_event_calendar(combined, fetched_at=fetched_at, run_id=settings.run_id, source="nse_event_calendar_api")
    return standardized, errors
