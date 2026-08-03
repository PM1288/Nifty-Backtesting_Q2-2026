from __future__ import annotations

import pandas as pd

from ..utils.html import extract_table_rows
from ..utils.dates import format_fortnight_code

KNOWN_SECTORS = (
    "Automobile and Auto Components",
    "Capital Goods",
    "Chemicals",
    "Construction",
    "Construction Materials",
    "Consumer Durables",
    "Consumer Services",
    "Diversified",
    "Fast Moving Consumer Goods",
    "Financial Services",
    "Forest Materials",
    "Healthcare",
    "Information Technology",
    "Media, Entertainment & Publication",
    "Metals & Mining",
    "Oil, Gas & Consumable Fuels",
    "Power",
    "Realty",
    "Services",
    "Telecommunication",
    "Textiles",
    "Utilities",
    "Sovereign",
    "Others",
)


def _parse_number(value: str) -> float:
    cleaned = value.replace(",", "").strip()
    return float(pd.to_numeric(cleaned, errors="coerce") or 0)


def normalize_nsdl_fortnightly(content: bytes, market_date=None, **_: object) -> pd.DataFrame:
    html = content.decode("utf-8", errors="ignore")
    rows = extract_table_rows(html)
    records: list[dict[str, object]] = []
    date_code = format_fortnight_code(market_date) if market_date is not None else None
    for row in rows:
        if len(row) < 30:
            continue
        sector_cell = str(row[1]).strip()
        sector_name = next((sector for sector in KNOWN_SECTORS if sector.lower()[:12] in sector_cell.lower()), None)
        if not sector_name or sector_cell.lower() == "total":
            continue
        numbers = [_parse_number(item) for item in row]
        records.append(
            {
                "market_date": market_date,
                "date_code": date_code,
                "sector": sector_name,
                "equity_auc_inr": numbers[2] if len(numbers) > 2 else 0.0,
                "debt_auc_inr": sum(numbers[index] for index in (3, 4, 5) if len(numbers) > index),
                "hybrid_auc_inr": numbers[6] if len(numbers) > 6 else 0.0,
                "total_auc_inr": numbers[13] if len(numbers) > 13 else 0.0,
                "equity_net_inr": numbers[26] if len(numbers) > 26 else 0.0,
                "debt_net_inr": sum(numbers[index] for index in (27, 28, 29) if len(numbers) > index),
                "hybrid_net_inr": numbers[30] if len(numbers) > 30 else 0.0,
                "total_net_inr": numbers[37] if len(numbers) > 37 else 0.0,
            }
        )
    return pd.DataFrame.from_records(records)
