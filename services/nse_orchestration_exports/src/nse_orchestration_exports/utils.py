from __future__ import annotations

import csv
import hashlib
import io
import json
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from typing import Any, Iterable


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def json_default(value: Any):
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, datetime):
        return value.isoformat()
    raise TypeError(f"Unsupported type for JSON serialization: {type(value)!r}")


def dumps_json(data: Any) -> str:
    return json.dumps(data, ensure_ascii=False, default=json_default, indent=2)


def sha256_bytes(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def write_bytes(path: str | Path, content: bytes) -> int:
    file_path = Path(path)
    file_path.parent.mkdir(parents=True, exist_ok=True)
    file_path.write_bytes(content)
    return file_path.stat().st_size


def flatten_summary_to_csv_rows(summary: dict) -> list[dict]:
    rows: list[dict] = []
    hero = summary.get("hero", {})
    for key, value in hero.items():
        rows.append({"section": "hero", "key": key, "value": value})
    for item in summary.get("top_gainers", []):
        rows.append({"section": "top_gainers", **item})
    for item in summary.get("top_losers", []):
        rows.append({"section": "top_losers", **item})
    for group in summary.get("sector_groups", []):
        sector_name = group.get("sector_name")
        for item in group.get("items", []):
            rows.append({"section": "sector_groups", "sector_name": sector_name, **item})
    for item in summary.get("ticker_tape", []):
        rows.append({"section": "ticker_tape", **item})
    for item in summary.get("summary_cards", []):
        rows.append({"section": "summary_cards", **item})
    return rows


def csv_bytes(rows: Iterable[dict]) -> bytes:
    rows = list(rows)
    if not rows:
        return b""
    fieldnames = sorted({k for row in rows for k in row.keys()})
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=fieldnames)
    writer.writeheader()
    for row in rows:
        writer.writerow({k: row.get(k) for k in fieldnames})
    return buffer.getvalue().encode("utf-8")
