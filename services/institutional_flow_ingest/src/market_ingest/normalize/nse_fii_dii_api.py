from __future__ import annotations

import json

import pandas as pd

from ..utils.dates import parse_nse_date


def normalize_nse_fii_dii_api(content: bytes, exchange_scope: str, **_: object) -> pd.DataFrame:
    payload = json.loads(content.decode("utf-8"))
    if not isinstance(payload, list):
        raise ValueError("NSE cash API payload must be a list")
    records: list[dict[str, object]] = []
    for row in payload:
        category = str(row.get("category", "")).upper()
        if "FII" not in category and "FPI" not in category and "DII" not in category:
            continue
        participant_type = "FII/FPI" if ("FII" in category or "FPI" in category) else "DII"
        market_date = parse_nse_date(str(row.get("date", "")))
        records.append(
            {
                "market_date": market_date,
                "participant_type": participant_type,
                "buy_value": pd.to_numeric(row.get("buyValue"), errors="coerce"),
                "sell_value": pd.to_numeric(row.get("sellValue"), errors="coerce"),
                "net_value": pd.to_numeric(row.get("netValue"), errors="coerce"),
                "exchange_scope": exchange_scope,
            }
        )
    return pd.DataFrame.from_records(records)
