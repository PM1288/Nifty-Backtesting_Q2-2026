#!/usr/bin/env python3
"""Export five years of daily F&O-equity and market-context technical data.

PostgreSQL is authoritative for NSE cash equities. Yahoo Finance is used for
indices/sector series and only as a fallback when a current F&O underlying is
absent from the local EOD table. Daily bars cannot provide true session VWAP,
so this export names its two reproducible proxies explicitly.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import time
import warnings
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path
from typing import Iterable

import numpy as np
import pandas as pd
import psycopg
import yfinance as yf

warnings.filterwarnings(
    "ignore",
    message="The 'generic' unit for NumPy timedelta.*",
    category=DeprecationWarning,
    module=r"yfinance\..*",
)


ROOT = Path(__file__).resolve().parents[3]
DEFAULT_START = date.today().replace(year=date.today().year - 5)
DEFAULT_END = date.today()
NIFTY500_URL = "https://archives.nseindia.com/content/indices/ind_nifty500list.csv"
NIFTY50_URL = "https://archives.nseindia.com/content/indices/ind_nifty50list.csv"


@dataclass(frozen=True)
class MarketSeries:
    symbol: str
    yahoo_ticker: str
    instrument_type: str
    sector: str


MARKET_SERIES = (
    MarketSeries("NIFTY50", "^NSEI", "INDEX", "BROAD_MARKET"),
    MarketSeries("INDIA_VIX", "^INDIAVIX", "VOLATILITY_INDEX", "VOLATILITY"),
    MarketSeries("NIFTY_BANK", "^NSEBANK", "SECTOR_INDEX", "Financial Services"),
    MarketSeries("NIFTY_IT", "^CNXIT", "SECTOR_INDEX", "Information Technology"),
    MarketSeries("NIFTY_AUTO", "^CNXAUTO", "SECTOR_INDEX", "Automobile and Auto Components"),
    MarketSeries("NIFTY_FMCG", "^CNXFMCG", "SECTOR_INDEX", "Fast Moving Consumer Goods"),
    MarketSeries("NIFTY_METAL", "^CNXMETAL", "SECTOR_INDEX", "Metals & Mining"),
    MarketSeries("NIFTY_PHARMA", "^CNXPHARMA", "SECTOR_INDEX", "Healthcare"),
    MarketSeries("NIFTY_REALTY", "^CNXREALTY", "SECTOR_INDEX", "Realty"),
    MarketSeries("NIFTY_ENERGY", "^CNXENERGY", "SECTOR_INDEX", "Oil Gas & Consumable Fuels"),
    MarketSeries("NIFTY_MEDIA", "^CNXMEDIA", "SECTOR_INDEX", "Media Entertainment & Publication"),
    MarketSeries("NIFTY_PSU_BANK", "^CNXPSUBANK", "SECTOR_INDEX", "Financial Services"),
)
LINEAGE_FILL_EXCLUSIONS = {"TMPV"}


def safe_filename(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]+", "_", value).strip("_") or "UNKNOWN"


def _safe_div(numerator: pd.Series, denominator: pd.Series) -> pd.Series:
    return numerator.div(denominator.replace(0, np.nan))


def calculate_indicators(frame: pd.DataFrame) -> pd.DataFrame:
    """Calculate point-in-time daily indicators without look-ahead."""
    x = frame.sort_values("trade_date").drop_duplicates("trade_date", keep="last").copy()
    for column in ("open", "high", "low", "close", "adjusted_close", "volume"):
        x[column] = pd.to_numeric(x.get(column), errors="coerce")
    close, high, low, volume = x["close"], x["high"], x["low"], x["volume"].fillna(0)

    x["change"] = close.diff()
    x["change_pct"] = close.pct_change() * 100
    x["return_5d_pct"] = close.pct_change(5) * 100
    x["return_20d_pct"] = close.pct_change(20) * 100
    for period in (20, 50, 100, 200):
        x[f"sma_{period}"] = close.rolling(period, min_periods=period).mean()
    for period in (9, 20, 50, 61, 200):
        x[f"ema_{period}"] = close.ewm(span=period, adjust=False, min_periods=period).mean()

    delta = close.diff()
    gain = delta.clip(lower=0).ewm(alpha=1 / 14, adjust=False, min_periods=14).mean()
    loss = (-delta.clip(upper=0)).ewm(alpha=1 / 14, adjust=False, min_periods=14).mean()
    rs = _safe_div(gain, loss)
    x["rsi_14"] = 100 - (100 / (1 + rs))
    x.loc[(loss == 0) & (gain > 0), "rsi_14"] = 100

    highest_14 = high.rolling(14, min_periods=14).max()
    lowest_14 = low.rolling(14, min_periods=14).min()
    x["willr_14"] = -100 * _safe_div(highest_14 - close, highest_14 - lowest_14)

    ema_12 = close.ewm(span=12, adjust=False, min_periods=12).mean()
    ema_26 = close.ewm(span=26, adjust=False, min_periods=26).mean()
    x["macd_line_12_26"] = ema_12 - ema_26
    x["macd_signal_9"] = x["macd_line_12_26"].ewm(span=9, adjust=False, min_periods=9).mean()
    x["macd_histogram"] = x["macd_line_12_26"] - x["macd_signal_9"]

    x["bb_middle_20"] = close.rolling(20, min_periods=20).mean()
    bb_std = close.rolling(20, min_periods=20).std(ddof=0)
    x["bb_upper_20_2"] = x["bb_middle_20"] + 2 * bb_std
    x["bb_lower_20_2"] = x["bb_middle_20"] - 2 * bb_std
    x["bb_width_pct"] = _safe_div(x["bb_upper_20_2"] - x["bb_lower_20_2"], x["bb_middle_20"]) * 100
    x["bb_percent_b"] = _safe_div(close - x["bb_lower_20_2"], x["bb_upper_20_2"] - x["bb_lower_20_2"])

    previous_close = close.shift(1)
    true_range = pd.concat(
        [(high - low), (high - previous_close).abs(), (low - previous_close).abs()], axis=1
    ).max(axis=1)
    x["atr_14"] = true_range.ewm(alpha=1 / 14, adjust=False, min_periods=14).mean()
    x["atr_14_pct"] = _safe_div(x["atr_14"], close) * 100

    up_move, down_move = high.diff(), -low.diff()
    plus_dm = pd.Series(np.where((up_move > down_move) & (up_move > 0), up_move, 0.0), index=x.index)
    minus_dm = pd.Series(np.where((down_move > up_move) & (down_move > 0), down_move, 0.0), index=x.index)
    smoothed_tr = true_range.ewm(alpha=1 / 14, adjust=False, min_periods=14).mean()
    x["plus_di_14"] = 100 * _safe_div(plus_dm.ewm(alpha=1 / 14, adjust=False, min_periods=14).mean(), smoothed_tr)
    x["minus_di_14"] = 100 * _safe_div(minus_dm.ewm(alpha=1 / 14, adjust=False, min_periods=14).mean(), smoothed_tr)
    dx = 100 * _safe_div((x["plus_di_14"] - x["minus_di_14"]).abs(), x["plus_di_14"] + x["minus_di_14"])
    x["adx_14"] = dx.ewm(alpha=1 / 14, adjust=False, min_periods=14).mean()

    x["stoch_fast_k_14"] = 100 * _safe_div(close - lowest_14, highest_14 - lowest_14)
    x["stoch_slow_d_3"] = x["stoch_fast_k_14"].rolling(3, min_periods=3).mean()
    x["roc_12_pct"] = close.pct_change(12) * 100

    typical = (high + low + close) / 3
    mean_deviation = typical.rolling(20, min_periods=20).apply(
        lambda values: float(np.mean(np.abs(values - np.mean(values)))), raw=True
    )
    x["cci_20"] = _safe_div(typical - typical.rolling(20, min_periods=20).mean(), 0.015 * mean_deviation)
    raw_money_flow = typical * volume
    positive_flow = raw_money_flow.where(typical.diff() > 0, 0.0)
    negative_flow = raw_money_flow.where(typical.diff() < 0, 0.0)
    money_ratio = _safe_div(
        positive_flow.rolling(14, min_periods=14).sum(),
        negative_flow.rolling(14, min_periods=14).sum(),
    )
    x["mfi_14"] = 100 - (100 / (1 + money_ratio))

    x["typical_price"] = typical
    rolling_turnover = raw_money_flow.rolling(20, min_periods=1).sum()
    rolling_volume = volume.rolling(20, min_periods=1).sum()
    x["rolling_vwap_20_proxy"] = _safe_div(rolling_turnover, rolling_volume)
    years = pd.to_datetime(x["trade_date"]).dt.year
    x["anchored_vwap_ytd_proxy"] = _safe_div(
        raw_money_flow.groupby(years).cumsum(), volume.groupby(years).cumsum()
    )
    x["volume_sma_20"] = volume.rolling(20, min_periods=20).mean()
    x["volume_ema_20"] = volume.ewm(span=20, adjust=False, min_periods=20).mean()
    x["volume_ema_60"] = volume.ewm(span=60, adjust=False, min_periods=60).mean()
    x["volume_vs_sma20"] = _safe_div(volume, x["volume_sma_20"])
    x["obv"] = (np.sign(delta).fillna(0) * volume).cumsum()
    return x


def calculate_breadth(equities: pd.DataFrame, nifty50_symbols: set[str]) -> pd.DataFrame:
    work = equities[["trade_date", "symbol", "sector", "change"]].copy()
    work["breadth_state"] = np.select(
        [work["change"] > 0, work["change"] < 0], ["ADVANCE", "DECLINE"], default="UNCHANGED"
    )
    scopes: list[pd.DataFrame] = []
    scope_frames: list[tuple[str, str, pd.DataFrame]] = [("FNO", "ALL_FNO", work)]
    scope_frames.append(("INDEX_MEMBERS", "NIFTY50_CURRENT", work[work["symbol"].isin(nifty50_symbols)]))
    for sector, sector_frame in work.groupby("sector", dropna=False):
        scope_frames.append(("SECTOR", str(sector or "UNCLASSIFIED"), sector_frame))
    for scope_type, scope_name, scoped in scope_frames:
        counts = scoped.groupby(["trade_date", "breadth_state"]).size().unstack(fill_value=0)
        for column in ("ADVANCE", "DECLINE", "UNCHANGED"):
            if column not in counts:
                counts[column] = 0
        counts = counts.reset_index().rename(
            columns={"ADVANCE": "advances", "DECLINE": "declines", "UNCHANGED": "unchanged"}
        )
        counts["scope_type"], counts["scope_name"] = scope_type, scope_name
        counts["total"] = counts[["advances", "declines", "unchanged"]].sum(axis=1)
        counts["advance_decline_ratio"] = _safe_div(counts["advances"], counts["declines"])
        counts["net_advances"] = counts["advances"] - counts["declines"]
        counts["advance_decline_line"] = counts["net_advances"].cumsum()
        scopes.append(counts)
    return pd.concat(scopes, ignore_index=True).sort_values(["scope_type", "scope_name", "trade_date"])


def read_url_csv(url: str) -> pd.DataFrame:
    return pd.read_csv(url)


def fetch_fno_universe(conn: psycopg.Connection, limit: int | None = None) -> pd.DataFrame:
    sql = """
        SELECT DISTINCT name AS symbol
        FROM public.instruments
        WHERE exchange = 'NFO'
          AND instrumenttype IN ('FUTSTK', 'OPTSTK')
          AND name !~ '^[0-9]{3}NSETEST$'
        ORDER BY name
    """
    rows = conn.execute(sql).fetchall()
    result = pd.DataFrame(rows, columns=["symbol"])
    return result.head(limit).copy() if limit else result


def fetch_latest_sector_map(conn: psycopg.Connection) -> dict[str, str]:
    rows = conn.execute(
        """
        SELECT DISTINCT ON (symbol) symbol, sector_name
        FROM nse_intraday.universe_membership
        WHERE sector_name IS NOT NULL AND btrim(sector_name) <> ''
        ORDER BY symbol, effective_from DESC, updated_at DESC
        """
    ).fetchall()
    return {str(symbol): str(sector) for symbol, sector in rows}


def fetch_equities(
    conn: psycopg.Connection, symbols: Iterable[str], start: date, end: date
) -> pd.DataFrame:
    sql = """
        SELECT trade_date, symbol, open_price, high_price, low_price, close_price,
               total_traded_qty, turnover_lacs, no_of_trades, deliverable_qty,
               deliverable_pct, isin
        FROM nse.fact_eod_prices
        WHERE trade_date BETWEEN %s AND %s
          AND series = 'EQ'
          AND symbol = ANY(%s)
        ORDER BY symbol, trade_date
    """
    rows = conn.execute(sql, (start, end, list(symbols))).fetchall()
    columns = [
        "trade_date", "symbol", "open", "high", "low", "close", "volume",
        "turnover_lacs", "number_of_trades", "deliverable_quantity",
        "deliverable_pct", "isin",
    ]
    frame = pd.DataFrame(rows, columns=columns)
    if frame.empty:
        return frame
    frame["adjusted_close"] = frame["close"]
    frame["price_adjustment"] = "UNADJUSTED_NSE_BHAVCOPY"
    frame["source"] = "POSTGRES:nse.fact_eod_prices"
    frame["history_lineage_note"] = "DIRECT_LOCAL_SYMBOL"
    return frame


def fetch_yahoo_series(item: MarketSeries, start: date, end: date, attempts: int = 3) -> pd.DataFrame:
    last_error: Exception | None = None
    for attempt in range(1, attempts + 1):
        try:
            raw = yf.download(
                item.yahoo_ticker,
                start=start.isoformat(),
                end=(end + timedelta(days=1)).isoformat(),
                interval="1d",
                auto_adjust=False,
                repair=True,
                progress=False,
                threads=False,
                timeout=30,
            )
            if raw.empty:
                raise RuntimeError("Yahoo returned no rows")
            if isinstance(raw.columns, pd.MultiIndex):
                raw.columns = raw.columns.get_level_values(0)
            raw = raw.reset_index().rename(
                columns={
                    "Date": "trade_date", "Open": "open", "High": "high", "Low": "low",
                    "Close": "close", "Adj Close": "adjusted_close", "Volume": "volume",
                }
            )
            raw["trade_date"] = pd.to_datetime(raw["trade_date"]).dt.date
            raw["symbol"], raw["yahoo_ticker"] = item.symbol, item.yahoo_ticker
            raw["instrument_type"], raw["sector"] = item.instrument_type, item.sector
            raw["price_adjustment"], raw["source"] = "YAHOO_ADJ_CLOSE_SEPARATE", "YFINANCE"
            raw["history_lineage_note"] = "DIRECT_YAHOO_SERIES"
            for column in ("turnover_lacs", "number_of_trades", "deliverable_quantity", "deliverable_pct", "isin"):
                raw[column] = np.nan
            return raw
        except Exception as exc:  # pragma: no cover - network dependent
            last_error = exc
            time.sleep(attempt * 2)
    raise RuntimeError(f"{item.yahoo_ticker}: {last_error}")


def fetch_missing_equity_yahoo(symbol: str, sector: str, start: date, end: date) -> pd.DataFrame:
    item = MarketSeries(symbol, f"{symbol}.NS", "EQUITY_FNO", sector)
    return fetch_yahoo_series(item, start, end)


def add_breadth_columns(data: pd.DataFrame, breadth: pd.DataFrame) -> pd.DataFrame:
    overall = breadth[(breadth.scope_type == "FNO") & (breadth.scope_name == "ALL_FNO")].copy()
    overall = overall[["trade_date", "advances", "declines", "unchanged", "total", "advance_decline_ratio", "net_advances", "advance_decline_line"]]
    overall = overall.rename(columns={column: f"fno_{column}" for column in overall.columns if column != "trade_date"})
    nifty = breadth[(breadth.scope_type == "INDEX_MEMBERS") & (breadth.scope_name == "NIFTY50_CURRENT")].copy()
    nifty = nifty[["trade_date", "advances", "declines", "unchanged", "total", "advance_decline_ratio", "net_advances", "advance_decline_line"]]
    nifty = nifty.rename(columns={column: f"nifty50_{column}" for column in nifty.columns if column != "trade_date"})
    result = data.merge(overall, on="trade_date", how="left").merge(nifty, on="trade_date", how="left")
    sector = breadth[breadth.scope_type == "SECTOR"].copy()
    sector = sector[["trade_date", "scope_name", "advances", "declines", "unchanged", "total", "advance_decline_ratio", "net_advances"]]
    sector = sector.rename(columns={"scope_name": "sector", **{column: f"sector_{column}" for column in sector.columns if column not in ("trade_date", "scope_name")}})
    return result.merge(sector, on=["trade_date", "sector"], how="left")


def write_excel(
    path: Path, data: pd.DataFrame, universe: pd.DataFrame, breadth: pd.DataFrame, coverage: pd.DataFrame
) -> None:
    readme = pd.DataFrame(
        {
            "field": [
                "purpose", "equity_source", "index_source", "date_semantics",
                "vwap_warning", "breadth_semantics", "generated_at_utc",
            ],
            "value": [
                "Five-year daily F&O equity, index, sector and volatility technical dataset",
                "PostgreSQL nse.fact_eod_prices; yfinance only for absent symbols",
                "yfinance/Yahoo Finance",
                "Exchange trading date; indicators use current and prior completed daily bars only",
                "rolling_vwap_20_proxy and anchored_vwap_ytd_proxy are daily-bar proxies, not intraday session VWAP",
                "Current F&O/current NIFTY50 membership applied retrospectively; not point-in-time membership",
                pd.Timestamp.now(tz="UTC").isoformat(),
            ],
        }
    )
    with pd.ExcelWriter(path, engine="xlsxwriter", engine_kwargs={"options": {"strings_to_urls": False}}) as writer:
        readme.to_excel(writer, sheet_name="README", index=False)
        universe.to_excel(writer, sheet_name="UNIVERSE", index=False)
        coverage.to_excel(writer, sheet_name="COVERAGE", index=False)
        breadth.to_excel(writer, sheet_name="BREADTH_DAILY", index=False)
        for number, offset in enumerate(range(0, len(data), 900_000), start=1):
            data.iloc[offset : offset + 900_000].to_excel(writer, sheet_name=f"DAILY_DATA_{number}", index=False)
        for sheet in writer.sheets.values():
            sheet.freeze_panes(1, 0)
            sheet.autofilter(0, 0, max(0, sheet.dim_rowmax), max(0, sheet.dim_colmax))


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database-url", default=os.getenv("DATABASE_URL") or os.getenv("TRADING_DATABASE_URL"))
    parser.add_argument("--start", type=date.fromisoformat, default=DEFAULT_START)
    parser.add_argument("--end", type=date.fromisoformat, default=DEFAULT_END)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--limit", type=int, help="Bounded equity count for testing")
    parser.add_argument("--skip-excel", action="store_true")
    parser.add_argument("--skip-market-series", action="store_true")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if not args.database_url:
        raise SystemExit("DATABASE_URL or TRADING_DATABASE_URL is required")
    if args.start > args.end:
        raise SystemExit("--start must be on or before --end")
    args.output_dir.mkdir(parents=True, exist_ok=True)

    nifty500 = read_url_csv(NIFTY500_URL)
    nifty500.columns = [str(column).strip() for column in nifty500.columns]
    sector_by_symbol = dict(zip(nifty500["Symbol"].astype(str).str.strip(), nifty500["Industry"].astype(str).str.strip()))
    nifty50 = read_url_csv(NIFTY50_URL)
    nifty50_symbols = set(nifty50["Symbol"].astype(str).str.strip())

    with psycopg.connect(args.database_url) as conn:
        universe = fetch_fno_universe(conn, args.limit)
        database_sector_by_symbol = fetch_latest_sector_map(conn)
        universe["sector"] = universe["symbol"].map(sector_by_symbol)
        universe["sector"] = universe["sector"].fillna(universe["symbol"].map(database_sector_by_symbol)).fillna("UNCLASSIFIED")
        universe["yahoo_ticker"] = universe["symbol"] + ".NS"
        equities = fetch_equities(conn, universe["symbol"], args.start, args.end)

    frames: list[pd.DataFrame] = []
    failures: list[dict[str, str]] = []
    warnings: list[dict[str, str]] = []
    partial_history_fills: list[dict[str, object]] = []
    for number, row in enumerate(universe.itertuples(index=False), start=1):
        raw = equities[equities.symbol == row.symbol].copy()
        if raw.empty:
            try:
                raw = fetch_missing_equity_yahoo(row.symbol, row.sector, args.start, args.end)
            except Exception as exc:  # pragma: no cover - network dependent
                failures.append({"symbol": row.symbol, "stage": "equity_fallback", "error": str(exc)})
                continue
        elif raw.trade_date.min() > args.start + timedelta(days=45) and row.symbol not in LINEAGE_FILL_EXCLUSIONS:
            try:
                yahoo = fetch_missing_equity_yahoo(row.symbol, row.sector, args.start, args.end)
                earlier = yahoo[yahoo.trade_date < raw.trade_date.min()].copy()
                if not earlier.empty:
                    earlier["history_lineage_note"] = "CURRENT_YAHOO_TICKER_PRE_LOCAL_HISTORY"
                    partial_history_fills.append(
                        {
                            "symbol": row.symbol,
                            "local_min_date": raw.trade_date.min().isoformat(),
                            "yahoo_fill_min_date": earlier.trade_date.min().isoformat(),
                            "rows_added": int(len(earlier)),
                        }
                    )
                    raw = pd.concat([earlier, raw], ignore_index=True, sort=False)
            except Exception as exc:  # network fill is optional when local rows exist
                warnings.append({"symbol": row.symbol, "stage": "partial_history_fill", "error": str(exc)})
        raw["yahoo_ticker"] = row.yahoo_ticker
        raw["instrument_type"], raw["sector"] = "EQUITY_FNO", row.sector
        enriched = calculate_indicators(raw)
        frames.append(enriched)
        print(f"equity {number}/{len(universe)} {row.symbol}: {len(enriched):,} rows", flush=True)

    equity_data = pd.concat(frames, ignore_index=True) if frames else pd.DataFrame()
    breadth = calculate_breadth(equity_data, nifty50_symbols)

    market_frames: list[pd.DataFrame] = []
    if not args.skip_market_series:
        for item in MARKET_SERIES:
            try:
                market_frames.append(calculate_indicators(fetch_yahoo_series(item, args.start, args.end)))
                print(f"market {item.symbol}: {len(market_frames[-1]):,} rows", flush=True)
            except Exception as exc:  # pragma: no cover - network dependent
                failures.append({"symbol": item.symbol, "stage": "market_series", "error": str(exc)})

    all_data = pd.concat([equity_data, *market_frames], ignore_index=True, sort=False)
    all_data = add_breadth_columns(all_data, breadth)
    all_data = all_data.sort_values(["instrument_type", "symbol", "trade_date"]).reset_index(drop=True)

    individual_columns = list(all_data.columns)
    for (instrument_type, symbol), symbol_data in all_data.groupby(["instrument_type", "symbol"], sort=True):
        filename = f"{safe_filename(instrument_type)}_{safe_filename(symbol)}_daily.csv"
        symbol_data[individual_columns].to_csv(args.output_dir / filename, index=False, float_format="%.8f")
    all_data.to_csv(args.output_dir / "ALL_FNO_AND_MARKET_DAILY_TECHNICAL.csv", index=False, float_format="%.8f")
    breadth.to_csv(args.output_dir / "ADVANCES_DECLINES_DAILY.csv", index=False, float_format="%.8f")

    coverage = (
        all_data.groupby(["instrument_type", "symbol", "sector", "source"], dropna=False)
        .agg(rows=("trade_date", "size"), min_date=("trade_date", "min"), max_date=("trade_date", "max"), missing_close=("close", lambda values: int(values.isna().sum())))
        .reset_index()
    )
    universe_export = universe.merge(
        coverage[coverage.instrument_type == "EQUITY_FNO"][["symbol", "rows", "min_date", "max_date"]],
        on="symbol", how="left",
    )
    universe_export["is_current_nifty50"] = universe_export.symbol.isin(nifty50_symbols)
    universe_export.to_csv(args.output_dir / "FNO_UNIVERSE.csv", index=False)
    coverage.to_csv(args.output_dir / "DATA_COVERAGE.csv", index=False)
    pd.DataFrame(failures, columns=["symbol", "stage", "error"]).to_csv(args.output_dir / "FAILURES.csv", index=False)
    pd.DataFrame(warnings, columns=["symbol", "stage", "error"]).to_csv(args.output_dir / "WARNINGS.csv", index=False)

    workbook = args.output_dir / "FNO_DAILY_TECHNICAL_5Y.xlsx"
    if not args.skip_excel:
        write_excel(workbook, all_data, universe_export, breadth, coverage)

    manifest = {
        "generated_at_utc": pd.Timestamp.now(tz="UTC").isoformat(),
        "requested_start": args.start.isoformat(),
        "requested_end": args.end.isoformat(),
        "fno_symbols_requested": int(len(universe)),
        "equity_symbols_exported": int(equity_data.symbol.nunique()),
        "market_series_exported": int(len(market_frames)),
        "rows": int(len(all_data)),
        "breadth_rows": int(len(breadth)),
        "failures": failures,
        "warnings": warnings,
        "partial_history_fills": partial_history_fills,
        "lineage_fill_exclusions": sorted(LINEAGE_FILL_EXCLUSIONS),
        "equity_source": "PostgreSQL nse.fact_eod_prices with yfinance fallback only when absent",
        "market_source": "yfinance/Yahoo Finance",
        "membership_warning": "Current F&O/NIFTY50 membership is applied retrospectively; breadth is not survivorship-free.",
        "vwap_warning": "Daily-bar VWAP values are explicitly named proxies and are not intraday session VWAP.",
    }
    (args.output_dir / "MANIFEST.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    readme = f"""# F&O daily technical dataset

- Requested window: `{args.start}` through `{args.end}`.
- Equity source: `nse.fact_eod_prices`; yfinance is fallback-only for a missing current F&O symbol.
- Market context: NIFTY 50, India VIX and available sector indices from yfinance.
- Renamed symbols may include clearly labelled pre-local history from their current Yahoo ticker. TMPV is deliberately not joined to pre-demerger history.
- Breadth: advances, declines and unchanged counts for current F&O, current NIFTY 50 and sector groups.
- Indicators: returns, SMA/EMA, RSI(14), Williams %R(14), MACD(12,26,9), Bollinger(20,2), ATR/ADX(14), stochastic, ROC, CCI, MFI, OBV and volume averages.
- `rolling_vwap_20_proxy` and `anchored_vwap_ytd_proxy` use daily typical price and volume. They are not true intraday session VWAP.
- Current membership is applied retrospectively, so breadth and constituent analysis contain survivorship bias.

Re-run:

```bash
{Path(os.sys.executable)} {Path(__file__).resolve()} --database-url "$DATABASE_URL" --start {args.start} --end {args.end} --output-dir {args.output_dir}
```
"""
    (args.output_dir / "README.md").write_text(readme, encoding="utf-8")
    files = sorted(path for path in args.output_dir.iterdir() if path.is_file() and path.name != "SHA256SUMS.txt")
    (args.output_dir / "SHA256SUMS.txt").write_text(
        "".join(f"{sha256_file(path)}  {path.name}\n" for path in files), encoding="utf-8"
    )
    print(json.dumps(manifest, indent=2), flush=True)
    print(f"output={args.output_dir}", flush=True)


if __name__ == "__main__":
    main()
