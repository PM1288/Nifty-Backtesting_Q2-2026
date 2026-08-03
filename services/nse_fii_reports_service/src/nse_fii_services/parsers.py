from __future__ import annotations

from io import BytesIO, StringIO
import re
from typing import Iterable

import pandas as pd

PARTICIPANT_ROWS = {"Client", "DII", "FII", "Pro", "TOTAL"}


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
        if line.startswith("Client Type"):
            header_index = idx
            break
    if header_index is None:
        raise ValueError("Could not locate CSV header row starting with 'Client Type'.")

    csv_text = "\n".join(lines[header_index:])
    df = pd.read_csv(StringIO(csv_text), on_bad_lines="skip")
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
    try:
        df = pd.read_excel(BytesIO(raw), skiprows=3, engine="xlrd")
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
    )
    mask = df["fii_derivatives"].str.startswith(valid_prefixes, na=False)
    if mask.any():
        df = df[mask].reset_index(drop=True)
    return df
