from __future__ import annotations

from io import BytesIO

import pandas as pd


def normalize_nse_shareholding(content: bytes, **_: object) -> pd.DataFrame:
    if content[:32].lower().startswith(b"<?xml") or b"<html" in content[:256].lower():
        return pd.DataFrame(
            [
                {
                    "category": "xbrl_or_html",
                    "subcategory": content[:256].decode("utf-8", errors="ignore"),
                }
            ]
        )
    frame = pd.read_csv(BytesIO(content))
    columns = {column.lower().strip(): column for column in frame.columns}
    rename_map = {}
    stable_map = {
        "filing_date": ["filing date", "submission date", "date of filing"],
        "as_on_date": ["as on date", "as on", "report date"],
        "symbol": ["symbol", "security code", "ticker"],
        "company_name": ["company name", "name of the company"],
        "category": ["category"],
        "subcategory": ["subcategory", "sub category"],
        "shares": ["shares", "shareholding"],
        "percent_hold": ["percentage", "percent", "%", "holding %"],
    }
    for canonical, variants in stable_map.items():
        for variant in variants:
            if variant in columns:
                rename_map[columns[variant]] = canonical
                break
    normalized = frame.rename(columns=rename_map)
    return normalized
