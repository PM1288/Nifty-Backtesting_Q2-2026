from __future__ import annotations

import csv
import gzip
import hashlib
import io
import json
import re
import zipfile
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Iterable

import pandas as pd


def file_sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def latest_trading_day_ist_agnostic(ref: date | None = None) -> date:
    current = ref or date.today()
    weekday = current.weekday()
    if weekday == 5:
        return current - timedelta(days=1)
    if weekday == 6:
        return current - timedelta(days=2)
    return current - timedelta(days=1)


def yesterday_ist_agnostic() -> date:
    return latest_trading_day_ist_agnostic()


def candidate_dates(backfill_days: int, end_date: date | None = None) -> list[date]:
    end = end_date or yesterday_ist_agnostic()
    start = end - timedelta(days=backfill_days - 1)
    out: list[date] = []
    cur = start
    while cur <= end:
        out.append(cur)
        cur += timedelta(days=1)
    return out


def fmt_ctx(d: date) -> dict[str, str]:
    return {
        "ddmmyyyy": d.strftime("%d%m%Y"),
        "ddmmyy": d.strftime("%d%m%y"),
        "yyyymmdd": d.strftime("%Y%m%d"),
        "iso": d.isoformat(),
    }


def parse_flexible_date(value: object) -> date | None:
    if value is None:
        return None
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    s = str(value).strip().strip('"')
    if not s or s in {"0", "NA", "nan", "NaT", "None"}:
        return None
    for fmt in ("%d-%b-%Y", "%d-%b-%y", "%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%d-%b-%Y", "%d-%b-%Y"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    if re.fullmatch(r"\d{8}", s):
        for fmt in ("%d%m%Y", "%Y%m%d"):
            try:
                return datetime.strptime(s, fmt).date()
            except ValueError:
                continue
    if re.fullmatch(r"\d{6}", s):
        for fmt in ("%d%m%y", "%y%m%d"):
            try:
                return datetime.strptime(s, fmt).date()
            except ValueError:
                continue
    try:
        return pd.to_datetime(s, errors="raise").date()
    except Exception:
        return None


def parse_epoch_date(value: object) -> date | None:
    if value in (None, "", "0", 0):
        return None
    try:
        iv = int(float(value))
        if iv <= 0:
            return None
        return datetime.fromtimestamp(iv, tz=timezone.utc).date()
    except Exception:
        return None


def to_numeric(value: object) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)) and not pd.isna(value):
        return float(value)
    s = str(value).strip().replace(",", "")
    if not s or s in {"NA", "nan", "None", "-"}:
        return None
    try:
        return float(s)
    except ValueError:
        return None


def to_int(value: object) -> int | None:
    num = to_numeric(value)
    if num is None:
        return None
    try:
        return int(num)
    except Exception:
        return None


def read_csv_bytes(data: bytes, **kwargs) -> pd.DataFrame:
    last_error: UnicodeDecodeError | None = None
    for encoding in ("utf-8", "utf-8-sig", "latin1"):
        try:
            return pd.read_csv(io.BytesIO(data), encoding=encoding, **kwargs)
        except UnicodeDecodeError as exc:
            last_error = exc
    if last_error is not None:
        raise last_error
    return pd.read_csv(io.BytesIO(data), **kwargs)


def read_excel_bytes(data: bytes, **kwargs) -> pd.DataFrame:
    return pd.read_excel(io.BytesIO(data), engine="openpyxl", **kwargs)


def is_zip_bytes(data: bytes) -> bool:
    return zipfile.is_zipfile(io.BytesIO(data))


def unzip_single_member(data: bytes) -> tuple[str, bytes]:
    with zipfile.ZipFile(io.BytesIO(data)) as zf:
        names = [n for n in zf.namelist() if not n.endswith("/")]
        if len(names) != 1:
            raise ValueError(f"Expected 1 member in zip, got {len(names)}")
        name = names[0]
        return name, zf.read(name)


def gunzip_bytes(data: bytes) -> bytes:
    return gzip.decompress(data)


def normalize_row_dict(row: dict) -> dict:
    out = {}
    for k, v in row.items():
        if isinstance(v, float) and pd.isna(v):
            out[k] = None
        elif pd.isna(v) if hasattr(pd, "isna") else False:
            out[k] = None
        else:
            out[k] = v
    return out


def strip_columns(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df.columns = [str(c).strip().replace("\ufeff", "") for c in df.columns]
    return df
