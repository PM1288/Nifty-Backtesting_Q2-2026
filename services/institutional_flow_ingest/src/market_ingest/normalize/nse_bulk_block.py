from __future__ import annotations

from io import BytesIO

import pandas as pd


def normalize_nse_bulk_block(content: bytes, **_: object) -> pd.DataFrame:
    frame = pd.read_csv(BytesIO(content))
    columns = {column.lower().strip(): column for column in frame.columns}
    rename_map = {}
    stable_map = {
        "deal_date": ["date", "deal date", "trade date"],
        "symbol": ["symbol", "security name", "security"],
        "buyer_name": ["buyer name", "client name", "buyer"],
        "seller_name": ["seller name", "seller"],
        "quantity": ["quantity", "qty", "deal quantity"],
        "price": ["price", "deal price"],
        "value": ["value", "trade value", "turnover"],
        "deal_kind": ["deal kind", "deal_type", "type"],
    }
    for canonical, variants in stable_map.items():
        for variant in variants:
            if variant in columns:
                rename_map[columns[variant]] = canonical
                break
    normalized = frame.rename(columns=rename_map)
    return normalized
