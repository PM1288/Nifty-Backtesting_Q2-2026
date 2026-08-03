from __future__ import annotations

from datetime import datetime
import re

import pandas as pd

from ..utils.html import extract_table_rows


def _parse_number(value: str) -> float:
    cleaned = value.replace(",", "").strip()
    return float(pd.to_numeric(cleaned, errors="coerce") or 0)


DATE_RE = re.compile(r"\b\d{2}-[A-Za-z]{3}-\d{4}\b")


def _extract_market_date(label: str):
    match = DATE_RE.search(label)
    if not match:
        return None
    return datetime.strptime(match.group(0), "%d-%b-%Y").date()


def normalize_nsdl_daily(content: bytes, **_: object) -> pd.DataFrame:
    html = content.decode("utf-8", errors="ignore")
    rows = extract_table_rows(html)
    records: list[dict[str, object]] = []
    current: dict[str, object] | None = None
    mode = "equity"
    for row in rows:
        label = str(row[0] if row else "").strip()
        lower = label.lower()
        if lower == "total":
            break
        if "date" in lower and DATE_RE.search(label) is None:
            continue
        market_date = _extract_market_date(label)
        if market_date is not None:
            if current:
                records.append(current)
            current = {
                "market_date": market_date,
                "equity_net": 0.0,
                "debt_net": 0.0,
                "hybrid_net": 0.0,
                "total_net": 0.0,
                "source_kind": "latest",
            }
            mode = "equity"
        if current is None:
            continue
        if "debt-general" in lower or "debt-vrr" in lower or "debt-far" in lower:
            mode = "debt"
        elif "hybrid" in lower:
            mode = "hybrid"
        nums = [_parse_number(item) for item in row[1:]]
        net_value = nums[2] if len(nums) > 2 else 0.0
        if mode == "equity":
            current["equity_net"] = float(current["equity_net"]) + net_value
        elif mode == "debt":
            current["debt_net"] = float(current["debt_net"]) + net_value
        elif mode == "hybrid":
            current["hybrid_net"] = float(current["hybrid_net"]) + net_value
        current["total_net"] = float(current["total_net"]) + net_value
    if current:
        records.append(current)
    return pd.DataFrame.from_records(records)
