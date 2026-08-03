from __future__ import annotations

from io import BytesIO

import pandas as pd

DEFAULT_ISIN_SECTOR_MAP = {
    "INE009A01021": ("Financial Services", "Financial Services"),
    "INE467B01029": ("Information Technology", "Information Technology"),
    "INE002A01018": ("Oil, Gas & Consumable Fuels", "Oil, Gas & Consumable Fuels"),
}


def normalize_reference_isin_map(content: bytes, market_date=None, **_: object) -> pd.DataFrame:
    frame = pd.read_csv(BytesIO(content))
    frame.columns = [str(column).strip() for column in frame.columns]
    rename_map = {
        "ISIN Code": "isin",
        "Industry": "industry_name",
        "Company Name": "company_name",
    }
    normalized = frame.rename(columns=rename_map)
    if "isin" not in normalized.columns:
        raise ValueError("Nifty500 CSV missing ISIN Code column")
    if "industry_name" not in normalized.columns:
        raise ValueError("Nifty500 CSV missing Industry column")
    normalized = normalized[["isin", "industry_name"]].copy()
    normalized["sector_name"] = normalized["industry_name"]
    for isin, values in DEFAULT_ISIN_SECTOR_MAP.items():
        if isin not in set(normalized["isin"]):
            normalized.loc[len(normalized)] = [isin, values[1], values[0]]
    normalized["as_on_date"] = market_date or pd.Timestamp.utcnow().date()
    return normalized[["as_on_date", "isin", "sector_name", "industry_name"]]
