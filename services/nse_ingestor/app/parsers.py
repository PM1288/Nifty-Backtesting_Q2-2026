from __future__ import annotations

import csv
import io
import json
import re
import zipfile
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any

import pandas as pd

from .utils import (
    fmt_ctx,
    gunzip_bytes,
    is_zip_bytes,
    normalize_row_dict,
    parse_epoch_date,
    parse_flexible_date,
    read_csv_bytes,
    read_excel_bytes,
    strip_columns,
    to_int,
    to_numeric,
    unzip_single_member,
)


@dataclass
class ParsedLoad:
    table: str
    rows: list[dict]
    conflict_cols: list[str]
    update_cols: list[str] | None = None


def _df_rows(df: pd.DataFrame) -> list[dict]:
    if df.empty:
        return []
    return [normalize_row_dict(rec) for rec in df.to_dict(orient="records")]


def _clean_text(value: Any) -> str | None:
    if pd.isna(value):
        return None
    cleaned = str(value).strip()
    return cleaned or None


def parse_sec_bhavdata_full(data: bytes, file_name: str, source_date: date) -> list[ParsedLoad]:
    # Some archive dates serve an XLSX payload from a .csv URL. Prefer CSV, then
    # fall back to Excel when the bytes are actually a zip-based workbook.
    try:
        df = strip_columns(read_csv_bytes(data, skipinitialspace=True))
    except Exception:
        if not is_zip_bytes(data):
            raise
        df = strip_columns(read_excel_bytes(data))
    df["trade_date"] = df["DATE1"].map(parse_flexible_date)
    rows = []
    for _, r in df.iterrows():
        rows.append(
            {
                "trade_date": r["trade_date"],
                "symbol": str(r["SYMBOL"]).strip(),
                "series": str(r["SERIES"]).strip(),
                "prev_close": to_numeric(r.get("PREV_CLOSE")),
                "open_price": to_numeric(r.get("OPEN_PRICE")),
                "high_price": to_numeric(r.get("HIGH_PRICE")),
                "low_price": to_numeric(r.get("LOW_PRICE")),
                "last_price": to_numeric(r.get("LAST_PRICE")),
                "close_price": to_numeric(r.get("CLOSE_PRICE")),
                "avg_price": to_numeric(r.get("AVG_PRICE")),
                "total_traded_qty": to_int(r.get("TTL_TRD_QNTY")),
                "turnover_lacs": to_numeric(r.get("TURNOVER_LACS")),
                "no_of_trades": to_int(r.get("NO_OF_TRADES")),
                "deliverable_qty": to_int(r.get("DELIV_QTY")),
                "deliverable_pct": to_numeric(r.get("DELIV_PER")),
                "fininstrm_id": None,
                "isin": None,
                "source_file": file_name,
            }
        )
    return [ParsedLoad("nse.fact_eod_prices", rows, ["trade_date", "symbol", "series"])]


def parse_bhavcopy_udiff(data: bytes, file_name: str, source_date: date) -> list[ParsedLoad]:
    inner_name, inner_data = unzip_single_member(data)
    df = strip_columns(read_csv_bytes(inner_data))
    rows = []
    for _, r in df.iterrows():
        rows.append(
            {
                "trade_date": parse_flexible_date(r.get("TradDt")),
                "biz_date": parse_flexible_date(r.get("BizDt")),
                "segment": r.get("Sgmt"),
                "source": r.get("Src"),
                "fininstrm_type": r.get("FinInstrmTp"),
                "fininstrm_id": to_int(r.get("FinInstrmId")),
                "isin": None if pd.isna(r.get("ISIN")) else str(r.get("ISIN")).strip(),
                "symbol": None if pd.isna(r.get("TckrSymb")) else str(r.get("TckrSymb")).strip(),
                "series": None if pd.isna(r.get("SctySrs")) else str(r.get("SctySrs")).strip(),
                "security_name": None if pd.isna(r.get("FinInstrmNm")) else str(r.get("FinInstrmNm")).strip(),
                "open_price": to_numeric(r.get("OpnPric")),
                "high_price": to_numeric(r.get("HghPric")),
                "low_price": to_numeric(r.get("LwPric")),
                "close_price": to_numeric(r.get("ClsPric")),
                "last_price": to_numeric(r.get("LastPric")),
                "prev_close": to_numeric(r.get("PrvsClsgPric")),
                "total_trading_volume": to_int(r.get("TtlTradgVol")),
                "total_traded_value": to_numeric(r.get("TtlTrfVal")),
                "total_trades": to_int(r.get("TtlNbOfTxsExctd")),
                "session_id": None if pd.isna(r.get("SsnId")) else str(r.get("SsnId")).strip(),
                "lot_size": to_int(r.get("NewBrdLotQty")),
                "source_file": file_name,
            }
        )
    return [ParsedLoad("nse.fact_bhavcopy_udiff", rows, ["trade_date", "fininstrm_id"])]


def parse_security_master(data: bytes, file_name: str, source_date: date) -> list[ParsedLoad]:
    inner_data = gunzip_bytes(data)
    df = strip_columns(read_csv_bytes(inner_data))
    keep = [
        "FinInstrmId", "TckrSymb", "SctySrs", "FinInstrmNm", "ISIN", "NewBrdLotQty",
        "TickSz", "PricRg", "ListgDt", "RmvlDt", "FinInstrmTp", "InstrmNm", "Sgmt",
        "TradToTradInd", "SttlmTp", "TradgPrtd", "ParVal", "SctyStsNrmlMkt", "ElgbltyNrmlMkt"
    ]
    rows = []
    for _, r in df.iterrows():
        raw = {k: (None if pd.isna(r.get(k)) else r.get(k)) for k in df.columns}
        rows.append(
            {
                "snapshot_date": source_date,
                "fininstrm_id": to_int(r.get("FinInstrmId")),
                "symbol": None if pd.isna(r.get("TckrSymb")) else str(r.get("TckrSymb")).strip(),
                "series": None if pd.isna(r.get("SctySrs")) else str(r.get("SctySrs")).strip(),
                "security_name": None if pd.isna(r.get("FinInstrmNm")) else str(r.get("FinInstrmNm")).strip(),
                "isin": None if pd.isna(r.get("ISIN")) else str(r.get("ISIN")).strip(),
                "lot_size": to_int(r.get("NewBrdLotQty")),
                "tick_size": to_numeric(r.get("TickSz")),
                "price_range": None if pd.isna(r.get("PricRg")) else str(r.get("PricRg")).strip(),
                "listing_date": parse_epoch_date(r.get("ListgDt")),
                "removal_date": parse_epoch_date(r.get("RmvlDt")),
                "instrument_type": None if pd.isna(r.get("FinInstrmTp")) else str(r.get("FinInstrmTp")).strip(),
                "instrm_name": None if pd.isna(r.get("InstrmNm")) else str(r.get("InstrmNm")).strip(),
                "market_segment": None if pd.isna(r.get("Sgmt")) else str(r.get("Sgmt")).strip(),
                "trad_to_trad_ind": None if pd.isna(r.get("TradToTradInd")) else str(r.get("TradToTradInd")).strip(),
                "settlement_type": None if pd.isna(r.get("SttlmTp")) else str(r.get("SttlmTp")).strip(),
                "trading_period": None if pd.isna(r.get("TradgPrtd")) else str(r.get("TradgPrtd")).strip(),
                "face_value": to_numeric(r.get("ParVal")),
                "security_status": None if pd.isna(r.get("SctyStsNrmlMkt")) else str(r.get("SctyStsNrmlMkt")).strip(),
                "normal_market_eligibility": None if pd.isna(r.get("ElgbltyNrmlMkt")) else str(r.get("ElgbltyNrmlMkt")).strip(),
                "raw": raw,
            }
        )
    return [ParsedLoad("nse.dim_security_master_snapshot", rows, ["snapshot_date", "fininstrm_id"])]


def parse_cmvolt(data: bytes, file_name: str, source_date: date) -> list[ParsedLoad]:
    df = strip_columns(read_csv_bytes(data))
    rows = []
    for _, r in df.iterrows():
        rows.append(
            {
                "trade_date": parse_flexible_date(r.get("Date")),
                "symbol": None if pd.isna(r.get("Symbol")) else str(r.get("Symbol")).strip(),
                "underlying_close_price": to_numeric(r.get("Underlying Close Price (A)")),
                "prev_close_price": to_numeric(r.get("Underlying Previous Day Close Price (B)")),
                "log_return": to_numeric(r.get("Underlying Log Returns (C) = LN(A/B)")),
                "prev_day_volatility": to_numeric(r.get("Previous Day Underlying Volatility (D)")),
                "current_day_daily_volatility": to_numeric(r.get("Current Day Underlying Daily Volatility (E) = Sqrt(0.995*D*D + 0.005*C*C)")),
                "annualised_volatility": to_numeric(r.get("Underlying Annualised Volatility (F) = E*Sqrt(365)")),
                "source_file": file_name,
            }
        )
    return [ParsedLoad("nse.fact_daily_volatility", rows, ["trade_date", "symbol"])]


def parse_market_activity(data: bytes, file_name: str, source_date: date) -> list[ParsedLoad]:
    text = data.decode("latin1")
    lines = [line for line in text.splitlines()]
    trade_date = None
    kv_rows = []
    index_rows = []
    in_index = False
    for raw in lines:
        if not raw.strip():
            continue
        parts = [p.strip() for p in raw.split(",")]
        if trade_date is None and len(parts) >= 2 and parse_flexible_date(parts[1]):
            trade_date = parse_flexible_date(parts[1])
            continue
        if parts[0] == "" and len(parts) >= 3 and parts[1].startswith("Traded "):
            kv_rows.append({
                "trade_date": trade_date or source_date,
                "metric_name": parts[1],
                "metric_value_numeric": to_numeric(parts[2]),
                "metric_value_text": parts[2],
                "source_file": file_name,
            })
            continue
        if len(parts) >= 2 and parts[1] == "INDEX":
            in_index = True
            continue
        if in_index and len(parts) >= 7 and parts[1]:
            index_rows.append({
                "trade_date": trade_date or source_date,
                "index_name": parts[1],
                "prev_close": to_numeric(parts[2]),
                "open_price": to_numeric(parts[3]),
                "high_price": to_numeric(parts[4]),
                "low_price": to_numeric(parts[5]),
                "close_price": to_numeric(parts[6]),
                "gain_loss": to_numeric(parts[7]) if len(parts) > 7 else None,
                "source_file": file_name,
            })
    return [
        ParsedLoad("nse.fact_market_activity_kv", kv_rows, ["trade_date", "metric_name"]),
        ParsedLoad("nse.fact_market_activity_index", index_rows, ["trade_date", "index_name"]),
    ]


def parse_shortselling(data: bytes, file_name: str, source_date: date) -> list[ParsedLoad]:
    df = strip_columns(read_csv_bytes(data))
    rows = []
    for _, r in df.iterrows():
        rows.append({
            "trade_date": parse_flexible_date(r.get("Trade Date")),
            "report_date": source_date,
            "symbol": None if pd.isna(r.get("Symbol Name")) else str(r.get("Symbol Name")).strip(),
            "security_name": None if pd.isna(r.get("Security Name")) else str(r.get("Security Name")).strip(),
            "quantity": to_int(r.get("Quantity")),
            "source_file": file_name,
        })
    return [ParsedLoad("nse.fact_short_selling", rows, ["trade_date", "symbol", "quantity", "source_file"])]


def _surveillance_non_default_count(flags: dict[str, Any]) -> int:
    sentinels = {"", None, "100", 100, "NA", "nan"}
    return sum(1 for v in flags.values() if v not in sentinels)


def parse_surveillance(data: bytes, file_name: str, source_date: date, version: str) -> list[ParsedLoad]:
    df = strip_columns(read_csv_bytes(data))
    base_cols = {"ScripCode", "Symbol", "Nse Exclusive", "Status", "Series"}
    rows = []
    for _, r in df.iterrows():
        flags = {}
        for c in df.columns:
            if c in base_cols:
                continue
            val = None if pd.isna(r.get(c)) else r.get(c)
            flags[c] = val
        rows.append({
            "report_date": source_date,
            "symbol": None if pd.isna(r.get("Symbol")) else str(r.get("Symbol")).strip(),
            "series": None if pd.isna(r.get("Series")) else str(r.get("Series")).strip(),
            "status": None if pd.isna(r.get("Status")) else str(r.get("Status")).strip(),
            "nse_exclusive": None if pd.isna(r.get("Nse Exclusive")) else str(r.get("Nse Exclusive")).strip(),
            "scrip_code": None if pd.isna(r.get("ScripCode")) else str(r.get("ScripCode")).strip(),
            "source_version": version,
            "non_default_flag_count": _surveillance_non_default_count(flags),
            "flags": flags,
            "source_file": file_name,
        })
    return [ParsedLoad("nse.fact_surveillance_indicators", rows, ["report_date", "symbol", "series", "source_version"])]


def parse_high_low_52w(data: bytes, file_name: str, source_date: date) -> list[ParsedLoad]:
    text = data.decode("latin1")
    lines = text.splitlines()
    csv_text = "\n".join(lines[2:])  # skip disclaimer + effective date
    df = strip_columns(pd.read_csv(io.StringIO(csv_text)))
    rows = []
    for _, r in df.iterrows():
        rows.append({
            "report_date": source_date,
            "symbol": None if pd.isna(r.get("SYMBOL")) else str(r.get("SYMBOL")).strip().strip('"'),
            "series": None if pd.isna(r.get("SERIES")) else str(r.get("SERIES")).strip().strip('"'),
            "adjusted_52_week_high": to_numeric(r.get("Adjusted_52_Week_High")),
            "high_date": parse_flexible_date(r.get("52_Week_High_Date")),
            "adjusted_52_week_low": to_numeric(r.get("Adjusted_52_Week_Low")),
            "low_date": parse_flexible_date(r.get("52_Week_Low_DT")),
            "source_file": file_name,
        })
    return [ParsedLoad("nse.fact_52_week_high_low", rows, ["report_date", "symbol", "series"])]


def _extract_symbol_from_text_line(line: str) -> tuple[str | None, str | None]:
    m = re.match(r"^(.+?)\s+([A-Z0-9&.\-]+)\s*:\s*(.+)$", line.strip())
    if not m:
        return None, line.strip()
    return m.group(2), m.group(3).strip()


def parse_pr_zip(data: bytes, file_name: str, source_date: date) -> list[ParsedLoad]:
    corp_rows = []
    event_rows = []
    with zipfile.ZipFile(io.BytesIO(data)) as zf:
        for name in zf.namelist():
            if name.lower().startswith("bc") and name.lower().endswith(".csv"):
                df = strip_columns(read_csv_bytes(zf.read(name)))
                for _, r in df.iterrows():
                    ex_date = parse_flexible_date(r.get("EX_DT"))
                    symbol = _clean_text(r.get("SYMBOL"))
                    purpose = _clean_text(r.get("PURPOSE"))
                    series = _clean_text(r.get("SERIES")) or ""
                    if ex_date is None or symbol is None or purpose is None:
                        continue
                    corp_rows.append({
                        "ex_date": ex_date,
                        "report_date": source_date,
                        "symbol": symbol,
                        "series": series,
                        "security_name": _clean_text(r.get("SECURITY")),
                        "record_date": parse_flexible_date(r.get("RECORD_DT")),
                        "bc_start_date": parse_flexible_date(r.get("BC_STRT_DT")),
                        "bc_end_date": parse_flexible_date(r.get("BC_END_DT")),
                        "nd_start_date": parse_flexible_date(r.get("ND_STRT_DT")),
                        "nd_end_date": parse_flexible_date(r.get("ND_END_DT")),
                        "purpose": purpose,
                        "source_file": f"{file_name}:{name}",
                    })
            elif name.lower().startswith("an") and name.lower().endswith(".txt"):
                text = zf.read(name).decode("latin1", errors="ignore")
                for line in text.splitlines()[1:]:
                    if not line.strip():
                        continue
                    symbol, headline = _extract_symbol_from_text_line(line)
                    event_rows.append({
                        "report_date": source_date,
                        "event_type": "announcement",
                        "symbol": symbol,
                        "headline": headline[:1000] if headline else None,
                        "raw_text": line.strip(),
                        "source_file": f"{file_name}:{name}",
                    })
            elif name.lower().startswith("bm") and name.lower().endswith(".txt"):
                text = zf.read(name).decode("latin1", errors="ignore")
                for line in text.splitlines()[1:]:
                    if not line.strip():
                        continue
                    symbol, headline = _extract_symbol_from_text_line(line)
                    event_rows.append({
                        "report_date": source_date,
                        "event_type": "board_meeting",
                        "symbol": symbol,
                        "headline": headline[:1000] if headline else None,
                        "raw_text": line.strip(),
                        "source_file": f"{file_name}:{name}",
                    })
    return [
        ParsedLoad("nse.fact_corporate_actions", corp_rows, ["ex_date", "symbol", "series", "purpose"]),
        ParsedLoad("nse.fact_text_events", event_rows, ["report_date", "event_type", "raw_text"]),
    ]


def parse_margin_trading(data: bytes, file_name: str, source_date: date) -> list[ParsedLoad]:
    _, inner = unzip_single_member(data)
    text = inner.decode("latin1")
    lines = text.splitlines()
    summary_rows = []
    scrip_rows = []
    report_date = source_date
    m = re.search(r"Reporting date\s+(\d{2}-[A-Z]{3}-\d{4})", lines[0], re.IGNORECASE)
    if m:
        report_date = parse_flexible_date(m.group(1)) or source_date
    for line in lines[4:8]:
        parts = [p.strip() for p in line.split(",")]
        if len(parts) >= 3 and parts[1]:
            summary_rows.append({
                "report_date": report_date,
                "metric_name": parts[1],
                "metric_value": to_numeric(parts[2]),
                "source_file": file_name,
            })
    header_idx = None
    for i, line in enumerate(lines):
        if line.startswith("Symbol,Name,Qty Fin by all the members"):
            header_idx = i
            break
    if header_idx is not None:
        df = pd.read_csv(io.StringIO("\n".join(lines[header_idx:])))
        df = strip_columns(df)
        for _, r in df.iterrows():
            symbol = _clean_text(r.get("Symbol"))
            if symbol is None:
                continue
            scrip_rows.append({
                "report_date": report_date,
                "symbol": symbol,
                "security_name": None if pd.isna(r.get("Name")) else str(r.get("Name")).strip(),
                "qty_financed": to_int(r.get("Qty Fin by all the members(No.of Shares)")),
                "amt_financed_lakhs": to_numeric(r.get("Amt Fin by all the members(Rs. In Lakhs)")),
                "source_file": file_name,
            })
    return [
        ParsedLoad("nse.fact_margin_trading_summary", summary_rows, ["report_date", "metric_name"]),
        ParsedLoad("nse.fact_margin_trading_scrip", scrip_rows, ["report_date", "symbol"]),
    ]


def parse_var_margin(data: bytes, file_name: str, source_date: date) -> list[ParsedLoad]:
    seq_match = re.search(r"_(\d)\.DAT$", file_name, re.IGNORECASE)
    source_seq = int(seq_match.group(1)) if seq_match else 0
    text = data.decode("latin1", errors="ignore")
    rows = []
    report_date = source_date
    for line in text.splitlines():
        parts = [p.strip() for p in line.split(",")]
        if not parts:
            continue
        if parts[0] == "10" and len(parts) >= 2:
            report_date = parse_flexible_date(parts[1]) or source_date
        elif parts[0] == "20" and len(parts) >= 10:
            rows.append({
                "report_date": report_date,
                "source_seq": source_seq,
                "symbol": parts[1],
                "series": parts[2],
                "isin": parts[3],
                "security_var_rate": to_numeric(parts[4]),
                "index_var_rate": to_numeric(parts[5]),
                "var_margin_rate": to_numeric(parts[6]),
                "extreme_loss_rate": to_numeric(parts[7]),
                "adhoc_margin_rate": to_numeric(parts[8]),
                "applicable_margin_rate": to_numeric(parts[9]),
                "source_file": file_name,
            })
    return [ParsedLoad("nse.fact_var_margin", rows, ["report_date", "source_seq", "symbol", "series", "isin"])]


def parse_bulk_or_block(data: bytes, file_name: str, source_date: date, table: str) -> list[ParsedLoad]:
    df = strip_columns(read_csv_bytes(data))
    rows = []
    for _, r in df.iterrows():
        row = {
            "trade_date": parse_flexible_date(r.get("Date")),
            "symbol": None if pd.isna(r.get("Symbol")) else str(r.get("Symbol")).strip(),
            "security_name": None if pd.isna(r.get("Security Name")) else str(r.get("Security Name")).strip(),
            "client_name": None if pd.isna(r.get("Client Name")) else str(r.get("Client Name")).strip(),
            "side": None if pd.isna(r.get("Buy/Sell")) else str(r.get("Buy/Sell")).strip(),
            "quantity_traded": to_int(r.get("Quantity Traded")),
            "trade_price": to_numeric(r.get("Trade Price / Wght. Avg. Price")),
            "source_file": file_name,
        }
        if table.endswith("fact_bulk_deals"):
            row["remarks"] = None if pd.isna(r.get("Remarks")) else str(r.get("Remarks")).strip()
        rows.append(row)
    conflict = ["trade_date", "symbol", "client_name", "side", "quantity_traded", "trade_price"]
    return [ParsedLoad(table, rows, conflict)]


PARSER_MAP = {
    "sec_bhavdata_full": parse_sec_bhavdata_full,
    "bhavcopy_udiff": parse_bhavcopy_udiff,
    "security_master": parse_security_master,
    "cmvolt": parse_cmvolt,
    "market_activity": parse_market_activity,
    "shortselling": parse_shortselling,
    "reg_ind": lambda data, file_name, source_date: parse_surveillance(data, file_name, source_date, "REG"),
    "reg1_ind": lambda data, file_name, source_date: parse_surveillance(data, file_name, source_date, "REG1"),
    "high_low_52w": parse_high_low_52w,
    "pr_zip": parse_pr_zip,
    "margin_trading": parse_margin_trading,
    "var_margin": parse_var_margin,
    "bulk": lambda data, file_name, source_date: parse_bulk_or_block(data, file_name, source_date, "nse.fact_bulk_deals"),
    "block": lambda data, file_name, source_date: parse_bulk_or_block(data, file_name, source_date, "nse.fact_block_deals"),
}
