from __future__ import annotations

from datetime import date, datetime
from io import StringIO
from typing import Any

import pandas as pd
import requests


def fetch_tables(url: str, user_agent: str, timeout_seconds: int) -> list[pd.DataFrame]:
    response = requests.get(
        url,
        headers={"User-Agent": user_agent},
        timeout=timeout_seconds,
    )
    response.raise_for_status()
    return pd.read_html(StringIO(response.text))


def _parse_market_date(value: Any) -> date:
    return datetime.strptime(str(value).strip(), "%d-%b-%Y").date()


def _safe_parse_market_date(value: Any) -> date | None:
    try:
        return _parse_market_date(value)
    except ValueError:
        return None


def _normalize_column_name(value: Any) -> str:
    if isinstance(value, tuple):
        parts = [str(item).strip() for item in value if str(item).strip() and not str(item).startswith("Unnamed:")]
        value = " ".join(parts)
    return " ".join(str(value).replace("\n", " ").split()).strip().lower()


def _parse_numeric(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        if pd.isna(value):
            return None
        return float(value)
    text = str(value).strip().replace(",", "")
    if not text or text.lower() in {"nan", "none"}:
        return None
    return float(text)


def _filter_target_date(frame: pd.DataFrame, column_name: str, target_date: date) -> pd.DataFrame:
    parsed_dates = frame[column_name].map(_safe_parse_market_date)
    return frame.loc[parsed_dates == target_date].copy()


def parse_investment_rows(table: pd.DataFrame, target_date: date, source_url: str) -> list[dict[str, Any]]:
    required_columns = {
        "Reporting Date": "reporting_date",
        "Debt/Debt-VRR/Equity/Hybrid": "instrument_category",
        "Investment Route": "investment_route",
        "Gross Purchases(Rs. Crore)": "gross_purchases_rs_crore",
        "Gross Sales (Rs. Crore)": "gross_sales_rs_crore",
        "Net Investment (Rs. Crore)": "net_investment_rs_crore",
        "Net Investment US($) million": "net_investment_usd_million",
        "Conversion  (1 USD TO INR)*": "usd_inr_conversion",
    }
    normalized = table.rename(columns=required_columns)
    filtered = _filter_target_date(normalized, "reporting_date", target_date)
    rows: list[dict[str, Any]] = []
    for record in filtered.to_dict("records"):
        rows.append(
            {
                "market_date": target_date,
                "instrument_category": str(record["instrument_category"]).strip(),
                "investment_route": str(record["investment_route"]).strip(),
                "gross_purchases_rs_crore": _parse_numeric(record["gross_purchases_rs_crore"]),
                "gross_sales_rs_crore": _parse_numeric(record["gross_sales_rs_crore"]),
                "net_investment_rs_crore": _parse_numeric(record["net_investment_rs_crore"]),
                "net_investment_usd_million": _parse_numeric(record["net_investment_usd_million"]),
                "usd_inr_conversion": _parse_numeric(record["usd_inr_conversion"]),
                "source_url": source_url,
            }
        )
    return rows


def parse_derivative_rows(table: pd.DataFrame, target_date: date, source_url: str) -> list[dict[str, Any]]:
    renamed = table.copy()
    renamed.columns = [_normalize_column_name(column) for column in renamed.columns]
    renamed = renamed.rename(
        columns={
            "reporting date reporting date": "reporting_date",
            "derivative products derivative products": "derivative_product",
            "buy no. of contracts": "buy_contracts",
            "buy amount in crore": "buy_amount_crore",
            "sell no. of contracts": "sell_contracts",
            "sell amount in crore": "sell_amount_crore",
            "open interest at the end of the date no. of contracts": "open_interest_contracts",
            "open interest at the end of the date amount in crore": "open_interest_amount_crore",
        }
    )
    filtered = _filter_target_date(renamed, "reporting_date", target_date)
    rows: list[dict[str, Any]] = []
    for record in filtered.to_dict("records"):
        rows.append(
            {
                "market_date": target_date,
                "derivative_product": str(record["derivative_product"]).strip(),
                "buy_contracts": _parse_numeric(record["buy_contracts"]),
                "buy_amount_crore": _parse_numeric(record["buy_amount_crore"]),
                "sell_contracts": _parse_numeric(record["sell_contracts"]),
                "sell_amount_crore": _parse_numeric(record["sell_amount_crore"]),
                "open_interest_contracts": _parse_numeric(record["open_interest_contracts"]),
                "open_interest_amount_crore": _parse_numeric(record["open_interest_amount_crore"]),
                "source_url": source_url,
            }
        )
    return rows


def available_market_dates(table: pd.DataFrame, reporting_date_column: str) -> list[date]:
    values = table[reporting_date_column].dropna().unique().tolist()
    return sorted({parsed for item in values if (parsed := _safe_parse_market_date(item)) is not None})
