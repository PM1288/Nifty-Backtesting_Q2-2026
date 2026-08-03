from __future__ import annotations

import csv
import hashlib
import io
import json
from datetime import date, datetime, timezone
from decimal import Decimal
from pathlib import Path
from typing import Any, Iterable


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def json_default(value: Any):
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    raise TypeError(f"Unsupported type for JSON serialization: {type(value)!r}")


def dumps_json(data: Any) -> str:
    return json.dumps(data, ensure_ascii=False, indent=2, default=json_default)


def sha256_bytes(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def write_bytes(path: str | Path, content: bytes) -> int:
    file_path = Path(path)
    file_path.parent.mkdir(parents=True, exist_ok=True)
    file_path.write_bytes(content)
    return file_path.stat().st_size


def csv_bytes(rows: Iterable[dict]) -> bytes:
    rows = list(rows)
    if not rows:
        return b""
    fieldnames = sorted({k for row in rows for k in row.keys()})
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=fieldnames)
    writer.writeheader()
    for row in rows:
        writer.writerow({k: row.get(k) for k in fieldnames})
    return buf.getvalue().encode("utf-8")


def flatten_dict(prefix: str, payload: dict) -> list[dict]:
    return [{"section": prefix, "key": key, "value": value} for key, value in payload.items()]
