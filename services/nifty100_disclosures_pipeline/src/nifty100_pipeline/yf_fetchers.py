from __future__ import annotations

import logging
import time
from typing import Any

import pandas as pd

from .config import Settings
from .transforms import melt_yf_financial_statement
from .utils import now_utc, retry_call
from .writer import error_row

STATEMENT_ACCESSORS: list[tuple[str, str]] = [
    ("income_stmt", "annual"),
    ("quarterly_income_stmt", "quarterly"),
    ("balance_sheet", "annual"),
    ("quarterly_balance_sheet", "quarterly"),
    ("cashflow", "annual"),
    ("quarterly_cashflow", "quarterly"),
]

STATEMENT_NAME_MAP = {
    "income_stmt": "income_statement",
    "quarterly_income_stmt": "income_statement",
    "balance_sheet": "balance_sheet",
    "quarterly_balance_sheet": "balance_sheet",
    "cashflow": "cashflow",
    "quarterly_cashflow": "cashflow",
}


def fetch_yf_financial_statements_for_symbol(
    universe_row: dict[str, Any],
    settings: Settings,
    logger: logging.Logger,
) -> tuple[pd.DataFrame, list[dict[str, Any]]]:
    import yfinance as yf  # lazy import

    errors: list[dict[str, Any]] = []
    symbol = str(universe_row["symbol"]).upper()
    yahoo_symbol = universe_row.get("yahoo_symbol", f"{symbol}.NS")
    fetched_at = now_utc()
    ticker = yf.Ticker(yahoo_symbol)

    statement_frames: list[pd.DataFrame] = []
    for accessor_name, period_type in STATEMENT_ACCESSORS:
        try:
            raw_df = retry_call(
                lambda name=accessor_name: getattr(ticker, name),
                attempts=settings.request_retries,
                sleep_seconds=settings.request_sleep_seconds,
            )
            melted = melt_yf_financial_statement(
                raw_df,
                symbol=symbol,
                statement_name=STATEMENT_NAME_MAP[accessor_name],
                period_type=period_type,
                fetched_at=fetched_at,
                run_id=settings.run_id,
                source="yfinance_financials",
            )
            if not melted.empty:
                statement_frames.append(melted)
        except Exception as exc:
            logger.warning("yfinance %s failed for %s: %s", accessor_name, yahoo_symbol, exc)
            errors.append(
                error_row(
                    settings,
                    dataset_name="yf_financial_statements",
                    symbol=symbol,
                    message=f"Failed to fetch {accessor_name} for {yahoo_symbol}: {exc}",
                )
            )
        time.sleep(settings.request_sleep_seconds)

    statement_df = pd.concat(statement_frames, ignore_index=True) if statement_frames else pd.DataFrame()
    if not statement_df.empty:
        statement_df = statement_df.drop_duplicates(
            subset=["symbol", "statement_name", "period_type", "period_end", "metric_name"]
        ).reset_index(drop=True)
    return statement_df, errors
