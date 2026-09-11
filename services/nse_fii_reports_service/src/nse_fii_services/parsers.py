from __future__ import annotations

from io import BytesIO, StringIO
import csv
import re
from typing import Iterable
from decimal import Decimal, InvalidOperation
from datetime import date, datetime

import pandas as pd

PARTICIPANT_ROWS = {"Client", "DII", "FII", "Pro", "TOTAL"}

FOVOLT_SCHEMA = (
    ("report_date", "Date"), ("symbol", "Symbol"),
    ("underlying_close", "Underlying Close Price (A)"),
    ("underlying_previous_close", "Underlying Previous Day Close Price (B)"),
    ("underlying_log_return", "Underlying Log Returns (C) = LN(A/B)"),
    ("underlying_vol_previous", "Previous Day Underlying Volatility (D)"),
    ("underlying_vol_current", "Current Day Underlying Daily Volatility (E) = Sqrt (0.995*D*D + 0.005* C*C)"),
    ("underlying_vol_annual", "Underlying Annualised Volatility (F) = E*sqrt(365)"),
    ("futures_close", "Futures Close Price (G)"),
    ("futures_previous_close", "Futures Previous Day Close Price (H)"),
    ("futures_log_return", "Futures Log Returns (I) = LN(G/H)"),
    ("futures_vol_previous", "Previous Day Futures Volatility (J)"),
    ("futures_vol_current", "Current Day Futures Daily Volatility (K) = Sqrt (0.995*J*J + 0.005* I*I)"),
    ("futures_vol_annual", "Futures Annualised Volatility (L) = K*sqrt(365)"),
    ("applicable_vol_daily", "Applicable Daily Volatility (M) = Max (E or K)"),
    ("applicable_vol_annual", "Applicable Annualised Volatility (N) = Max (F or L)"),
)
FOVOLT_THRESHOLD = Decimal("0.0001")
FOVOLT_RULE_VERSION = "FOVOLT_FUT_DAILY_DELTA_GT_0001_V1"


def _normal_header(value: str) -> str:
    return re.sub(r"\s+", "", value.lstrip("\ufeff")).casefold()


def _fovolt_date(value: str) -> date:
    for pattern in ("%d-%b-%y", "%d-%b-%Y", "%Y-%m-%d", "%d-%m-%Y"):
        try:
            return datetime.strptime(value.strip(), pattern).date()
        except ValueError:
            continue
    raise ValueError(f"Unsupported FOVOLT report date: {value!r}")


def _decimal(value: str) -> Decimal | None:
    text = value.strip()
    if text.casefold() in {"", "-", "--", "na", "n/a", "null"}:
        return None
    try:
        parsed = Decimal(text)
    except InvalidOperation as exc:
        raise ValueError(f"Invalid FOVOLT decimal: {value!r}") from exc
    if not parsed.is_finite():
        raise ValueError(f"Non-finite FOVOLT decimal: {value!r}")
    return parsed


def parse_fovolt_csv(raw: bytes, expected_date: date | None = None) -> list[dict[str, object]]:
    """Parse the physical FOVOLT columns and preserve every original cell."""
    text = _decode_text(raw)
    if text.lstrip().lower().startswith(("<", "{", "[")):
        raise ValueError("Expected FOVOLT CSV, not HTML or JSON")
    reader = csv.reader(StringIO(text))
    try:
        headers = next(reader)
    except StopIteration as exc:
        raise ValueError("Empty FOVOLT report") from exc
    normalised = [_normal_header(value) for value in headers]
    if len(set(normalised)) != len(normalised):
        raise ValueError("Duplicate normalised FOVOLT header")
    indexes: dict[str, int] = {}
    for key, heading in FOVOLT_SCHEMA:
        normal = _normal_header(heading)
        if normal not in normalised:
            raise ValueError(f"Missing required FOVOLT header: {heading}")
        indexes[key] = normalised.index(normal)
    rows: list[dict[str, object]] = []
    seen: set[tuple[date, str]] = set()
    for cells in reader:
        if not cells or not any(cell.strip() for cell in cells):
            continue
        if len(cells) != len(headers):
            raise ValueError(f"FOVOLT column count mismatch at CSV line {reader.line_num}")
        report_date = _fovolt_date(cells[indexes["report_date"]])
        if expected_date and report_date != expected_date:
            raise ValueError("Requested FOVOLT date does not match report content")
        symbol = cells[indexes["symbol"]].strip()
        identity = (report_date, symbol)
        if not symbol or symbol != symbol.upper():
            raise ValueError(f"Missing or unexpected FOVOLT symbol at CSV line {reader.line_num}")
        if identity in seen:
            raise ValueError(f"Duplicate FOVOLT date/symbol: {report_date}/{symbol}")
        seen.add(identity)
        row: dict[str, object] = {
            "report_date": report_date,
            "symbol": symbol,
            "source_csv_line": reader.line_num,
            "raw_fields": dict(zip(headers, cells)),
        }
        for key, _heading in FOVOLT_SCHEMA[2:]:
            row[key] = _decimal(cells[indexes[key]])
        previous = row["futures_vol_previous"]
        current = row["futures_vol_current"]
        computable = isinstance(previous, Decimal) and isinstance(current, Decimal) and previous >= 0 and current >= 0
        delta = current - previous if computable else None
        row.update({
            "delta_futures_vol_raw": delta,
            "delta_futures_vol_bp": delta * Decimal(10_000) if delta is not None else None,
            "rule_match": delta > FOVOLT_THRESHOLD if delta is not None else None,
            "screen_state": "MATCH" if delta is not None and delta > FOVOLT_THRESHOLD else "NOT_MATCH" if delta is not None else "INVALID_INPUT",
        })
        rows.append(row)
    if not rows:
        raise ValueError("No FOVOLT records")
    if len({row["report_date"] for row in rows}) != 1:
        raise ValueError("Mixed FOVOLT report dates")
    return rows


def rank_fovolt_rows(rows: list[dict[str, object]]) -> list[dict[str, object]]:
    ranked = sorted(rows, key=lambda row: (
        row["delta_futures_vol_raw"] is None,
        -(row["delta_futures_vol_raw"] or Decimal(0)),
        str(row["symbol"]),
    ))
    valid_rank = 0
    for row in ranked:
        if row["delta_futures_vol_raw"] is not None:
            valid_rank += 1
            row["rank_in_valid_report"] = valid_rank
        else:
            row["rank_in_valid_report"] = None
    return ranked


def _decode_text(raw: bytes) -> str:
    for encoding in ("utf-8-sig", "utf-8", "latin-1"):
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="replace")


def _clean_columns(df: pd.DataFrame) -> pd.DataFrame:
    df.columns = [str(col).replace("\t", "").strip() for col in df.columns]
    return df


def _strip_empty_rows(df: pd.DataFrame) -> pd.DataFrame:
    return df.dropna(how="all").reset_index(drop=True)


def parse_participant_csv(raw: bytes) -> pd.DataFrame:
    """Parse participant OI or participant volume CSV bytes.

    The official files usually contain one heading line above the actual CSV header.
    This parser locates the 'Client Type' row rather than assuming a fixed row number.
    """
    text = _decode_text(raw)
    lines = [line for line in text.splitlines() if line.strip()]
    header_index = None
    for idx, line in enumerate(lines):
        if next(csv.reader([line]))[0].strip() == "Client Type":
            header_index = idx
            break
    if header_index is None:
        raise ValueError("Could not locate CSV header row starting with 'Client Type'.")

    csv_text = "\n".join(lines[header_index:])
    df = pd.read_csv(StringIO(csv_text), on_bad_lines="error")
    df = _clean_columns(df)
    df = _strip_empty_rows(df)

    first_col = df.columns[0]
    df[first_col] = df[first_col].astype(str).str.strip()
    df = df[df[first_col].isin(PARTICIPANT_ROWS)].reset_index(drop=True)
    return df


def parse_fii_stats_excel(raw: bytes) -> pd.DataFrame:
    """Parse the FII derivatives statistics XLS bytes.

    The official file is served as .xls on NSE archive URLs. Pandas typically needs
    xlrd installed for .xls support.
    """
    if not raw.startswith(bytes.fromhex("d0cf11e0a1b11ae1")):
        raise ValueError("Expected an OLE/BIFF XLS report, not HTML or an error response")
    try:
        df = pd.read_excel(BytesIO(raw), header=None, engine="xlrd")
    except ImportError as exc:
        raise ImportError(
            "Parsing NSE .xls files requires xlrd. Install it with: pip install xlrd"
        ) from exc

    df = _strip_empty_rows(df)
    # Keep the first 7 columns used by the workbook / official table.
    df = df.iloc[:, :7].copy()
    df.columns = [
        "fii_derivatives",
        "buy_contracts",
        "buy_value_in_Cr",
        "sell_contracts",
        "sell_value_in_Cr",
        "open_contracts",
        "open_contracts_value_in_Cr",
    ]
    df["fii_derivatives"] = df["fii_derivatives"].astype(str).str.strip()
    df = df[df["fii_derivatives"].str.len() > 0]
    # Trim footnote rows if present.
    valid_prefixes = (
        "INDEX FUTURES",
        "INDEX OPTIONS",
        "STOCK FUTURES",
        "STOCK OPTIONS",
        "Total",
        "FINNIFTY FUTURES",
        "BANKNIFTY FUTURES",
        "MIDCPNIFTY FUTURES",
        "NIFTY FUTURES",
        "NIFTYFPI FUTURES",
        "NIFTYNXT50 FUTURES",
        "BANKNIFTY OPTIONS",
        "FINNIFTY OPTIONS",
        "MIDCPNIFTY OPTIONS",
        "NIFTY OPTIONS",
        "NIFTYFPI OPTIONS",
        "NIFTYNXT50 OPTIONS",
    )
    mask = df["fii_derivatives"].str.startswith(valid_prefixes, na=False)
    df = df[mask].reset_index(drop=True)
    if df.empty:
        raise ValueError("No recognized FII product rows in report")
    return df
