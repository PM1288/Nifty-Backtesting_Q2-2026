from __future__ import annotations

import zipfile
from io import BytesIO

import pandas as pd


def _load_frame(content: bytes) -> pd.DataFrame:
    if zipfile.is_zipfile(BytesIO(content)):
        with zipfile.ZipFile(BytesIO(content)) as archive:
            member = archive.namelist()[0]
            with archive.open(member) as handle:
                return pd.read_csv(handle)
    return pd.read_csv(BytesIO(content))


def normalize_nse_bhavcopy(content: bytes, **_: object) -> pd.DataFrame:
    frame = _load_frame(content)
    columns = {column.lower().strip(): column for column in frame.columns}
    rename_map = {}
    stable_map = {
        "symbol": ["symbol", "tradingsymbol", "tckr_symb"],
        "series": ["series", "scty_srs"],
        "open": ["open", "open_price"],
        "high": ["high", "high_price"],
        "low": ["low", "low_price"],
        "close": ["close", "close_price", "clsprc"],
        "last": ["last", "last_price"],
        "prev_close": ["prevclose", "prev_close", "prvs_clsg_prc"],
        "volume": ["tottrdqty", "total_traded_quantity", "ttl_trf_qnty"],
        "delivery_qty": ["delivery quantity", "deliv_qty", "deliveryqty"],
        "delivery_pct": ["%dlyqttoqty", "delivery_pct", "per_del_qty_to_traded_qty"],
        "turnover": ["tottrdval", "total_traded_value", "ttl_trf_val"],
        "trades": ["totaltrades", "ttl_nb_trades"],
        "isin": ["isin", "isin_number"],
    }
    for canonical, variants in stable_map.items():
        for variant in variants:
            if variant in columns:
                rename_map[columns[variant]] = canonical
                break
    normalized = frame.rename(columns=rename_map)
    for numeric_column in (
        "open",
        "high",
        "low",
        "close",
        "last",
        "prev_close",
        "volume",
        "delivery_qty",
        "delivery_pct",
        "turnover",
        "trades",
    ):
        if numeric_column in normalized.columns:
            normalized[numeric_column] = pd.to_numeric(normalized[numeric_column], errors="coerce")
    return normalized
