from __future__ import annotations

from io import BytesIO

import pandas as pd


def normalize_nse_fii_dii(content: bytes, exchange_scope: str, **_: object) -> pd.DataFrame:
    frame = pd.read_csv(BytesIO(content))
    columns = {column.lower().strip(): column for column in frame.columns}
    rename_map = {}
    for canonical, variants in {
        "participant_type": ["client type", "category", "participant type"],
        "buy_value": ["buy value", "buy", "gross purchase"],
        "sell_value": ["sell value", "sell", "gross sales"],
        "net_value": ["net value", "net", "net purchase / sales"],
    }.items():
        for variant in variants:
            if variant in columns:
                rename_map[columns[variant]] = canonical
                break
    normalized = frame.rename(columns=rename_map)
    for numeric_column in ("buy_value", "sell_value", "net_value"):
        if numeric_column in normalized.columns:
            normalized[numeric_column] = pd.to_numeric(normalized[numeric_column], errors="coerce")
    normalized["exchange_scope"] = exchange_scope
    return normalized
