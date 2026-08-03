from __future__ import annotations

from io import BytesIO

import pandas as pd


def normalize_nse_derivatives_participants(content: bytes, **_: object) -> pd.DataFrame:
    frame = pd.read_csv(BytesIO(content))
    columns = {column.lower().strip(): column for column in frame.columns}
    rename_map = {}
    stable_map = {
        "client_type": ["client type", "category", "participant type"],
        "instrument_type": ["instrument", "instrument type", "segment"],
        "buy_contracts": ["buy contracts", "long", "contracts bought", "future index long", "buy value"],
        "sell_contracts": ["sell contracts", "short", "contracts sold", "future index short", "sell value"],
        "open_interest_long": ["long oi", "open interest long", "future stock long"],
        "open_interest_short": ["short oi", "open interest short", "future stock short"],
        "call_long": ["call long", "option call long", "calls bought"],
        "call_short": ["call short", "option call short", "calls sold"],
        "put_long": ["put long", "option put long", "puts bought"],
        "put_short": ["put short", "option put short", "puts sold"],
    }
    for canonical, variants in stable_map.items():
        for variant in variants:
            if variant in columns:
                rename_map[columns[variant]] = canonical
                break
    normalized = frame.rename(columns=rename_map)
    return normalized
