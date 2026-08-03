from __future__ import annotations

from datetime import date

import pandas as pd

from ..utils.html import extract_table_rows


def _parse_number(value: str) -> float:
    cleaned = value.replace(",", "").strip()
    return float(pd.to_numeric(cleaned, errors="coerce") or 0)


def _parse_history(html: str, parser: str) -> pd.DataFrame:
    rows = extract_table_rows(html)
    records: list[dict[str, object]] = []
    for row in rows:
        label = str(row[0] if row else "").strip()
        if not label:
            continue
        lower = label.lower()
        if any(token in lower for token in ("date", "month", "year", "category", "description", "particular")):
            continue
        values = [_parse_number(item) for item in row[1:]]
        if not any(values):
            continue
        if parser == "monthly":
            parsed = pd.to_datetime(
                [f"01-{label}", f"01 {label}", label],
                format="mixed",
                errors="coerce",
            )
            valid = next((item for item in parsed if not pd.isna(item)), None)
            if valid is None:
                continue
            period_start = valid.date().replace(day=1)
        else:
            if not label.isdigit() or len(label) != 4:
                continue
            period_start = date(int(label), 1, 1)
        records.append(
            {
                "period_start": period_start,
                "equity_gross_purchase": values[0] if len(values) > 0 else 0.0,
                "equity_gross_sales": values[1] if len(values) > 1 else 0.0,
                "equity_net": values[2] if len(values) > 2 else 0.0,
                "debt_gross_purchase": values[3] if len(values) > 3 else 0.0,
                "debt_gross_sales": values[4] if len(values) > 4 else 0.0,
                "debt_net": values[5] if len(values) > 5 else 0.0,
                "hybrid_gross_purchase": values[6] if len(values) > 6 else 0.0,
                "hybrid_gross_sales": values[7] if len(values) > 7 else 0.0,
                "hybrid_net": values[8] if len(values) > 8 else 0.0,
                "total_net": values[9] if len(values) > 9 else 0.0,
            }
        )
    return pd.DataFrame.from_records(records)


def normalize_nsdl_monthly_history(content: bytes, **_: object) -> pd.DataFrame:
    return _parse_history(content.decode("utf-8", errors="ignore"), "monthly")


def normalize_nsdl_yearly_history(content: bytes, **_: object) -> pd.DataFrame:
    return _parse_history(content.decode("utf-8", errors="ignore"), "yearly")
