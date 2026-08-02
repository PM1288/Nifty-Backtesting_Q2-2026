from __future__ import annotations

import csv
import math
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import date, datetime, time
from pathlib import Path
from typing import Iterable
from zoneinfo import ZoneInfo

from nifty_stratlab.calendar.service import TradingCalendar
from nifty_stratlab.util.hashing import sha256_file


_COLUMN_ALIASES = {
    "timestamp": ("date", "datetime", "timestamp", "ts", "time", "minute_ts"),
    "open": ("open", "open_px", "open_price", "o"),
    "high": ("high", "high_px", "high_price", "h"),
    "low": ("low", "low_px", "low_price", "l"),
    "close": ("close", "close_px", "close_price", "c", "last"),
    "volume": ("volume", "vol", "qty", "total_traded_qty", "v"),
    "symbol": ("symbol", "tradingsymbol", "ticker", "security"),
}


@dataclass
class CsvProfile:
    path: str
    sha256: str
    bytes: int
    rows: int = 0
    first_timestamp: str | None = None
    last_timestamp: str | None = None
    duplicate_timestamps: int = 0
    conflicting_duplicates: int = 0
    invalid_timestamp_rows: int = 0
    invalid_numeric_rows: int = 0
    invalid_ohlc_rows: int = 0
    negative_volume_rows: int = 0
    outside_session_rows: int = 0
    out_of_order_rows: int = 0
    missing_minutes_estimate: int = 0
    interval_minutes: int = 1
    session_row_counts: dict[str, int] = field(default_factory=dict)
    inferred_columns: dict[str, str] = field(default_factory=dict)
    timestamp_formats: dict[str, int] = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)

    @property
    def status(self) -> str:
        hard_failures = (
            self.rows == 0
            or self.invalid_timestamp_rows > 0
            or self.invalid_ohlc_rows > 0
            or self.conflicting_duplicates > 0
        )
        if hard_failures:
            return "FAIL"
        if any(
            (
                self.duplicate_timestamps,
                self.outside_session_rows,
                self.out_of_order_rows,
                self.missing_minutes_estimate,
                self.negative_volume_rows,
            )
        ):
            return "WARN"
        return "PASS"

    def as_dict(self) -> dict[str, object]:
        payload = dict(self.__dict__)
        payload["status"] = self.status
        return payload


def _normalise_header(value: str) -> str:
    return value.strip().lower().replace(" ", "_").replace("-", "_")


def infer_columns(fieldnames: Iterable[str] | None) -> dict[str, str]:
    normalised = {_normalise_header(name): name for name in (fieldnames or [])}
    found: dict[str, str] = {}
    for canonical, aliases in _COLUMN_ALIASES.items():
        for alias in aliases:
            if alias in normalised:
                found[canonical] = normalised[alias]
                break
    required = {"timestamp", "open", "high", "low", "close"}
    missing = sorted(required - found.keys())
    if missing:
        raise ValueError(f"CSV is missing required columns: {', '.join(missing)}")
    return found


_TIMESTAMP_FORMATS = (
    "%Y-%m-%d %H:%M:%S%z",
    "%Y-%m-%dT%H:%M:%S%z",
    "%Y-%m-%d %H:%M:%S",
    "%Y-%m-%dT%H:%M:%S",
    "%Y-%m-%d %H:%M",
    "%Y-%m-%dT%H:%M",
    "%d-%m-%Y %H:%M:%S",
    "%d/%m/%Y %H:%M:%S",
    "%Y-%m-%d",
)


def parse_timestamp(raw: str, default_timezone: str) -> tuple[datetime, str]:
    value = raw.strip()
    if value.endswith("Z"):
        value = value[:-1] + "+0000"
    # Python's fromisoformat handles offsets with a colon and fractional seconds.
    try:
        parsed = datetime.fromisoformat(value)
        fmt = "isoformat"
    except ValueError:
        parsed = None
        fmt = ""
        for candidate in _TIMESTAMP_FORMATS:
            try:
                parsed = datetime.strptime(value, candidate)
                fmt = candidate
                break
            except ValueError:
                continue
        if parsed is None:
            raise ValueError(f"unrecognised timestamp: {raw!r}")
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=ZoneInfo(default_timezone))
    return parsed, fmt


def _as_float(raw: str | None) -> float:
    if raw is None or not str(raw).strip():
        return math.nan
    return float(str(raw).replace(",", "").strip())


def profile_csv(
    path: str | Path,
    *,
    default_timezone: str = "Asia/Kolkata",
    trading_calendar: TradingCalendar | None = None,
    segment: str = "NSE_CM",
    delimiter: str | None = None,
    duplicate_memory_limit: int = 5_000_000,
    interval_minutes: int = 1,
) -> CsvProfile:
    if interval_minutes <= 0:
        raise ValueError("interval_minutes must be positive")
    csv_path = Path(path).expanduser().resolve()
    profile = CsvProfile(
        path=str(csv_path), sha256=sha256_file(csv_path), bytes=csv_path.stat().st_size,
        interval_minutes=interval_minutes,
    )
    day_minutes: dict[date, set[tuple[int, int]]] = defaultdict(set)
    day_rows: Counter[date] = Counter()
    seen: dict[tuple[str, str], tuple[float, float, float, float, float]] = {}
    last_timestamp: datetime | None = None

    with csv_path.open("r", encoding="utf-8-sig", newline="") as stream:
        sample = stream.read(8192)
        stream.seek(0)
        actual_delimiter = delimiter or csv.Sniffer().sniff(sample, delimiters=",;\t|").delimiter
        reader = csv.DictReader(stream, delimiter=actual_delimiter)
        columns = infer_columns(reader.fieldnames)
        profile.inferred_columns = columns

        for row in reader:
            profile.rows += 1
            try:
                timestamp, fmt = parse_timestamp(str(row[columns["timestamp"]]), default_timezone)
                profile.timestamp_formats[fmt] = profile.timestamp_formats.get(fmt, 0) + 1
            except (KeyError, ValueError, TypeError):
                profile.invalid_timestamp_rows += 1
                continue

            try:
                open_price = _as_float(row.get(columns["open"]))
                high_price = _as_float(row.get(columns["high"]))
                low_price = _as_float(row.get(columns["low"]))
                close_price = _as_float(row.get(columns["close"]))
                volume = _as_float(row.get(columns["volume"])) if "volume" in columns else 0.0
                if any(math.isnan(value) for value in (open_price, high_price, low_price, close_price)):
                    raise ValueError("missing OHLC")
            except (ValueError, TypeError):
                profile.invalid_numeric_rows += 1
                continue

            if min(open_price, high_price, low_price, close_price) <= 0 or high_price < max(open_price, close_price, low_price) or low_price > min(open_price, close_price, high_price):
                profile.invalid_ohlc_rows += 1
            if not math.isnan(volume) and volume < 0:
                profile.negative_volume_rows += 1

            if last_timestamp and timestamp < last_timestamp:
                profile.out_of_order_rows += 1
            last_timestamp = timestamp
            profile.first_timestamp = profile.first_timestamp or timestamp.isoformat()
            profile.last_timestamp = timestamp.isoformat()

            symbol = str(row.get(columns.get("symbol", ""), "")).strip().upper()
            key = (symbol, timestamp.isoformat())
            values = (open_price, high_price, low_price, close_price, volume)
            if len(seen) < duplicate_memory_limit or key in seen:
                previous = seen.get(key)
                if previous is not None:
                    profile.duplicate_timestamps += 1
                    if previous != values:
                        profile.conflicting_duplicates += 1
                else:
                    seen[key] = values

            local = timestamp.astimezone(ZoneInfo(default_timezone))
            day_rows[local.date()] += 1
            day_minutes[local.date()].add((local.hour, local.minute))
            if trading_calendar and trading_calendar.is_trading_day(local.date()):
                bounds = trading_calendar.session_bounds(local.date(), segment)
                if local < bounds.open_at or local >= bounds.close_at:
                    profile.outside_session_rows += 1

    profile.session_row_counts = {day.isoformat(): count for day, count in sorted(day_rows.items())}
    if trading_calendar:
        for day, minutes in day_minutes.items():
            if not trading_calendar.is_trading_day(day):
                continue
            expected = trading_calendar.expected_bar_count(day, segment, interval_minutes)
            profile.missing_minutes_estimate += max(0, expected - len(minutes))

    if profile.rows >= duplicate_memory_limit:
        profile.warnings.append("duplicate detection reached the configured in-memory key limit")
    if len(profile.timestamp_formats) > 1:
        profile.warnings.append("multiple timestamp formats were observed")
    return profile
