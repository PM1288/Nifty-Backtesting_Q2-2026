from __future__ import annotations

from io import BytesIO

import pandas as pd


def _get_number(value: object) -> float:
    return float(pd.to_numeric(str(value).replace(",", "").strip(), errors="coerce") or 0)


def normalize_nse_participant_oi(content: bytes, market_date=None, **_: object) -> pd.DataFrame:
    frame = pd.read_csv(BytesIO(content))
    if frame.empty:
        return pd.DataFrame()
    records: list[dict[str, object]] = []
    for _, row in frame.iterrows():
        client = str(row.iloc[0]).strip()
        upper_client = client.upper()
        if "FII" not in upper_client and "DII" not in upper_client:
            continue
        participant = "FII/FPI" if "FII" in upper_client else "DII"
        records.extend(
            [
                {
                    "market_date": market_date,
                    "client_type": participant,
                    "instrument_type": "future_index",
                    "open_interest_long": _get_number(row.iloc[1] if len(row) > 1 else 0),
                    "open_interest_short": _get_number(row.iloc[2] if len(row) > 2 else 0),
                },
                {
                    "market_date": market_date,
                    "client_type": participant,
                    "instrument_type": "future_stock",
                    "open_interest_long": _get_number(row.iloc[3] if len(row) > 3 else 0),
                    "open_interest_short": _get_number(row.iloc[4] if len(row) > 4 else 0),
                },
                {
                    "market_date": market_date,
                    "client_type": participant,
                    "instrument_type": "option_index",
                    "call_long": _get_number(row.iloc[5] if len(row) > 5 else 0),
                    "call_short": _get_number(row.iloc[6] if len(row) > 6 else 0),
                    "put_long": _get_number(row.iloc[7] if len(row) > 7 else 0),
                    "put_short": _get_number(row.iloc[8] if len(row) > 8 else 0),
                },
            ]
        )
    normalized = pd.DataFrame.from_records(records)
    numeric_columns = (
        "buy_contracts",
        "sell_contracts",
        "open_interest_long",
        "open_interest_short",
        "call_long",
        "call_short",
        "put_long",
        "put_short",
    )
    for column in numeric_columns:
        if column not in normalized.columns:
            normalized[column] = pd.Series(dtype="float64")
        normalized[column] = pd.to_numeric(normalized[column], errors="coerce")
    return normalized
