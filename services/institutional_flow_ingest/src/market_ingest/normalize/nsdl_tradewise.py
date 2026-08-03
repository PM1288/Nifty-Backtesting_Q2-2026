from __future__ import annotations

import csv
import io
import zipfile
from collections import defaultdict
from datetime import date

import pandas as pd


def _extract_trade_text(content: bytes) -> str:
    with zipfile.ZipFile(io.BytesIO(content)) as archive:
        member = next((name for name in archive.namelist() if name.lower().endswith((".csv", ".txt", ".dat"))), None)
        if member is None:
            raise ValueError("No CSV/TXT/DAT file found in NSDL tradewise zip")
        with archive.open(member) as handle:
            return handle.read().decode("utf-8", errors="ignore")


def normalize_nsdl_tradewise(content: bytes, market_date=None, registry=None, **_: object) -> pd.DataFrame:
    if registry is None:
        raise ValueError("registry is required for NSDL tradewise normalization")
    isin_map = registry.fetch_isin_sector_map()
    text = _extract_trade_text(content)
    sector_stats: dict[str, dict[str, float]] = defaultdict(lambda: {"buy_cr": 0.0, "sell_cr": 0.0, "tx_count": 0.0})
    unmapped_by_sector: dict[str, set[str]] = defaultdict(set)
    reader = csv.reader(io.StringIO(text))
    for row in reader:
        if len(row) < 16:
            continue
        isin = row[7].strip().strip('"')
        tx_type = row[9].strip().upper().strip('"')
        instrument_type = row[15].strip().upper().strip('"')
        try:
            value = float(row[14].replace(",", "").strip().strip('"'))
        except ValueError:
            continue
        if instrument_type != "EQ" or tx_type not in {"BUY", "SELL"} or value == 0:
            continue
        sector = isin_map.get(isin, "Unmapped")
        if sector == "Unmapped":
            unmapped_by_sector[sector].add(isin)
        value_cr = value / 10000000.0
        if tx_type == "BUY":
            sector_stats[sector]["buy_cr"] += value_cr
        else:
            sector_stats[sector]["sell_cr"] += value_cr
        sector_stats[sector]["tx_count"] += 1
    records = []
    period_start = market_date if isinstance(market_date, date) else pd.Timestamp.utcnow().date().replace(day=1)
    for sector, stats in sector_stats.items():
        records.append(
            {
                "period_start": period_start.replace(day=1),
                "sector": sector,
                "buy_cr": round(stats["buy_cr"], 2),
                "sell_cr": round(stats["sell_cr"], 2),
                "net_cr": round(stats["buy_cr"] - stats["sell_cr"], 2),
                "tx_count": int(stats["tx_count"]),
                "unmapped_isin_count": len(unmapped_by_sector.get(sector, set())),
            }
        )
    return pd.DataFrame.from_records(records)
