from __future__ import annotations

import json
import math
import re
import time
from dataclasses import asdict, is_dataclass
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable, Iterable, Iterator, Sequence, TypeVar

import pandas as pd
from dateutil import parser as date_parser

T = TypeVar("T")


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def utc_timestamp_slug() -> str:
    return now_utc().strftime("%Y%m%dT%H%M%SZ")


def ensure_dir(path: Path | str) -> Path:
    path_obj = Path(path)
    path_obj.mkdir(parents=True, exist_ok=True)
    return path_obj


def slugify(value: str) -> str:
    value = value.strip()
    value = re.sub(r"[^A-Za-z0-9._-]+", "_", value)
    value = re.sub(r"_+", "_", value)
    return value.strip("_") or "unknown"


def normalize_column_name(value: str) -> str:
    value = value.strip().lower()
    value = value.replace("%", " pct ")
    value = value.replace("&", " and ")
    value = re.sub(r"[^a-z0-9]+", "_", value)
    value = re.sub(r"_+", "_", value)
    return value.strip("_")


def normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    out.columns = [normalize_column_name(str(col)) for col in out.columns]
    return out


def pick_first(mapping: dict[str, Any], keys: Sequence[str], default: Any = None) -> Any:
    for key in keys:
        if key in mapping:
            value = mapping[key]
            if value is not None and value != "":
                return value
    return default


_DATE_FORMATS = (
    "%Y-%m-%d",
    "%d-%m-%Y",
    "%d-%b-%Y",
    "%d-%b-%y",
    "%d/%m/%Y",
    "%d/%m/%y",
    "%Y/%m/%d",
    "%d %b %Y",
    "%d %B %Y",
    "%d-%m-%Y %H:%M:%S",
    "%d-%b-%Y %H:%M:%S",
    "%Y-%m-%d %H:%M:%S",
)


def parse_date_value(value: Any) -> date | None:
    if value is None:
        return None
    try:
        if pd.isna(value):  # type: ignore[arg-type]
            return None
    except TypeError:
        pass
    if isinstance(value, pd.Timestamp):
        return value.date()
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, (int, float)):
        try:
            if math.isnan(value):
                return None
        except TypeError:
            pass
        return None
    value_str = str(value).strip()
    if not value_str:
        return None
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(value_str, fmt).date()
        except ValueError:
            continue
    try:
        parsed = date_parser.parse(value_str, dayfirst=True, fuzzy=True)
        return parsed.date()
    except (ValueError, TypeError, OverflowError):
        return None


def parse_datetime_value(value: Any) -> datetime | None:
    if value is None:
        return None
    try:
        if pd.isna(value):  # type: ignore[arg-type]
            return None
    except TypeError:
        pass
    if isinstance(value, pd.Timestamp):
        dt_val = value.to_pydatetime()
        return dt_val if dt_val.tzinfo else dt_val.replace(tzinfo=timezone.utc)
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    value_str = str(value).strip()
    if not value_str:
        return None
    for fmt in _DATE_FORMATS:
        try:
            dt_val = datetime.strptime(value_str, fmt)
            return dt_val.replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    try:
        parsed = date_parser.parse(value_str, dayfirst=True, fuzzy=True)
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    except (ValueError, TypeError, OverflowError):
        return None


def coerce_numeric(value: Any) -> float | None:
    if value is None:
        return None
    try:
        if pd.isna(value):  # type: ignore[arg-type]
            return None
    except TypeError:
        pass
    if isinstance(value, bool):
        return float(value)
    if isinstance(value, (int, float)):
        try:
            if math.isnan(value):
                return None
        except TypeError:
            pass
        return float(value)
    value_str = str(value).strip().replace(",", "")
    if value_str in {"", "-", "None", "nan", "NaN", "N/A", "NA"}:
        return None
    try:
        return float(value_str)
    except ValueError:
        return None


def safe_json_dumps(value: Any) -> str:
    def default(obj: Any) -> Any:
        if is_dataclass(obj):
            return asdict(obj)
        if isinstance(obj, (datetime, date)):
            return obj.isoformat()
        if isinstance(obj, pd.Timestamp):
            return obj.isoformat()
        if isinstance(obj, Path):
            return str(obj)
        try:
            if pd.isna(obj):  # type: ignore[arg-type]
                return None
        except TypeError:
            pass
        return str(obj)

    return json.dumps(value, default=default, ensure_ascii=False)


def retry_call(
    func: Callable[..., T],
    *args: Any,
    attempts: int = 3,
    sleep_seconds: float = 1.0,
    retry_on: tuple[type[BaseException], ...] = (Exception,),
    **kwargs: Any,
) -> T:
    last_error: BaseException | None = None
    for attempt in range(1, attempts + 1):
        try:
            return func(*args, **kwargs)
        except retry_on as exc:  # type: ignore[misc]
            last_error = exc
            if attempt >= attempts:
                break
            time.sleep(sleep_seconds * attempt)
    if last_error is None:
        raise RuntimeError("retry_call() exhausted without capturing an exception")
    raise last_error


def unique_preserve_order(values: Iterable[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for value in values:
        if value not in seen:
            seen.add(value)
            out.append(value)
    return out


def date_chunks(start_date: date, end_date: date, chunk_days: int = 365) -> Iterator[tuple[date, date]]:
    current = start_date
    while current <= end_date:
        chunk_end = min(current + timedelta(days=chunk_days - 1), end_date)
        yield current, chunk_end
        current = chunk_end + timedelta(days=1)


def csv_relative_path(path: Path, project_root: Path) -> str:
    try:
        return str(path.resolve().relative_to(project_root.resolve()))
    except ValueError:
        return str(path)
