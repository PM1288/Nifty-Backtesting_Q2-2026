#!/usr/bin/env python3
"""Refresh the cash capture universe: Nifty LargeMidcap 250 union NSE stock F&O.

The index constituent file remains the official 250-stock membership file. The
collector symbol file additionally includes every current, non-test NSE stock
F&O underlying in Angel One's instrument master.
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import io
import json
import ssl
import urllib.request
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
SOURCES = (
    "https://nsearchives.nseindia.com/content/indices/ind_nifty100list.csv",
    "https://nsearchives.nseindia.com/content/indices/ind_niftymidcap150list.csv",
)
CONSTITUENTS = ROOT / "docs/source/ind_niftylargemidcap250list.csv"
SYMBOLS = ROOT / "samples/nifty250.sample.csv"
INSTRUMENT_MASTER = ROOT / "state/OpenAPIScripMaster.json"


def download_csv(url: str) -> list[dict[str, str]]:
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(request, timeout=60, context=ssl.create_default_context()) as response:
        text = response.read().decode("utf-8-sig")
    return list(csv.DictReader(io.StringIO(text)))


def parse_expiry(value: str) -> dt.date | None:
    try:
        return dt.datetime.strptime(value.strip().upper(), "%d%b%Y").date()
    except (TypeError, ValueError):
        return None


def load_fno_symbols(path: Path, as_of: dt.date) -> set[str]:
    with path.open(encoding="utf-8") as handle:
        instruments = json.load(handle)
    cash_symbols = {
        str(row.get("symbol", "")).upper().removesuffix("-EQ")
        for row in instruments
        if str(row.get("exch_seg", "")).upper() == "NSE"
        and str(row.get("symbol", "")).upper().endswith("-EQ")
    }
    derivative_symbols: set[str] = set()
    for row in instruments:
        if str(row.get("exch_seg", "")).upper() != "NFO":
            continue
        if str(row.get("instrumenttype", "")).upper() not in {"FUTSTK", "OPTSTK"}:
            continue
        expiry = parse_expiry(str(row.get("expiry", "")))
        symbol = str(row.get("name", "")).strip().upper()
        if not symbol or symbol.endswith("NSETEST") or expiry is None or expiry < as_of:
            continue
        if symbol in cash_symbols:
            derivative_symbols.add(symbol)
    return derivative_symbols


def read_constituents(path: Path) -> dict[str, dict[str, str]]:
    with path.open(encoding="utf-8-sig") as handle:
        rows = list(csv.DictReader(handle))
    return {
        row.get("Symbol", "").strip().upper(): row
        for row in rows
        if row.get("Symbol", "").strip()
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--offline", action="store_true", help="reuse the checked-in index constituent file")
    parser.add_argument("--instrument-master", type=Path, default=INSTRUMENT_MASTER)
    parser.add_argument(
        "--as-of",
        type=dt.date.fromisoformat,
        default=dt.datetime.now(ZoneInfo("Asia/Kolkata")).date(),
    )
    args = parser.parse_args()

    by_symbol: dict[str, dict[str, str]] = {}
    if args.offline:
        by_symbol = read_constituents(CONSTITUENTS)
    else:
        for url in SOURCES:
            for row in download_csv(url):
                symbol = row.get("Symbol", "").strip().upper()
                if symbol:
                    by_symbol[symbol] = row
    if len(by_symbol) != 250:
        raise SystemExit(f"expected exactly 250 unique symbols, received {len(by_symbol)}")

    fno_symbols = load_fno_symbols(args.instrument_master, args.as_of)
    capture_symbols = set(by_symbol) | fno_symbols

    fieldnames = ["Company Name", "Industry", "Symbol", "Series", "ISIN Code"]
    CONSTITUENTS.parent.mkdir(parents=True, exist_ok=True)
    with CONSTITUENTS.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, extrasaction="ignore", lineterminator="\n")
        writer.writeheader()
        for symbol in sorted(by_symbol):
            writer.writerow(by_symbol[symbol])

    SYMBOLS.parent.mkdir(parents=True, exist_ok=True)
    with SYMBOLS.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle, lineterminator="\n")
        writer.writerow(["symbol"])
        writer.writerows((symbol,) for symbol in sorted(capture_symbols))
    print(
        f"wrote {len(capture_symbols)} capture symbols "
        f"({len(by_symbol)} LargeMidcap 250, {len(fno_symbols)} NSE F&O, "
        f"{len(fno_symbols - set(by_symbol))} F&O-only additions) to {SYMBOLS}; "
        f"index constituents remain {len(by_symbol)} in {CONSTITUENTS}"
    )


if __name__ == "__main__":
    main()
