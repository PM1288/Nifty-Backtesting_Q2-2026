#!/usr/bin/env python3
"""Refresh the official Nifty LargeMidcap 250 universe (Nifty 100 + Midcap 150)."""
from __future__ import annotations

import csv
import io
import ssl
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCES = (
    "https://nsearchives.nseindia.com/content/indices/ind_nifty100list.csv",
    "https://nsearchives.nseindia.com/content/indices/ind_niftymidcap150list.csv",
)
CONSTITUENTS = ROOT / "docs/source/ind_niftylargemidcap250list.csv"
SYMBOLS = ROOT / "samples/nifty250.sample.csv"


def download_csv(url: str) -> list[dict[str, str]]:
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(request, timeout=60, context=ssl.create_default_context()) as response:
        text = response.read().decode("utf-8-sig")
    return list(csv.DictReader(io.StringIO(text)))


def main() -> None:
    by_symbol: dict[str, dict[str, str]] = {}
    for url in SOURCES:
        for row in download_csv(url):
            symbol = row.get("Symbol", "").strip().upper()
            if symbol:
                by_symbol[symbol] = row
    if len(by_symbol) != 250:
        raise SystemExit(f"expected exactly 250 unique symbols, received {len(by_symbol)}")

    fieldnames = ["Company Name", "Industry", "Symbol", "Series", "ISIN Code"]
    CONSTITUENTS.parent.mkdir(parents=True, exist_ok=True)
    with CONSTITUENTS.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        for symbol in sorted(by_symbol):
            writer.writerow(by_symbol[symbol])

    SYMBOLS.parent.mkdir(parents=True, exist_ok=True)
    with SYMBOLS.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(["symbol"])
        writer.writerows((symbol,) for symbol in sorted(by_symbol))
    print(f"wrote {len(by_symbol)} symbols to {SYMBOLS} and {CONSTITUENTS}")


if __name__ == "__main__":
    main()
