#!/usr/bin/env python3
"""Run the OIIS Phase-A cash-daily replay from canonical PostgreSQL facts."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta
from decimal import Decimal
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
import psycopg
from psycopg.rows import dict_row

PROJECT_ROOT = Path(__file__).resolve().parents[1]
MONOREPO_ROOT = PROJECT_ROOT.parents[1]
sys.path.insert(0, str(PROJECT_ROOT / "src"))

from nifty_stratlab.oiis import OIISFeature, evaluate_feature  # noqa: E402
from nifty_stratlab.evaluation.common_exit import (  # noqa: E402
    CommonExitPolicy, PathBar, evaluate_long_target_only,
)


STRATEGY_ID = "oiis_cash_daily_research_v1"
FORMULA_VERSION = "OIIS-CASH-DAILY-RESEARCH-V1.1"
POLICY_VERSION = "NIFTY-SEROE-V1.0"
EXCLUDED_SYMBOLS = {"TMPV"}
DEFAULT_CONFIG = PROJECT_ROOT / "config/oiis/formulas/oiis_cash_daily_research_v1.json"
DEFAULT_SCHEMA = MONOREPO_ROOT / "db/sql/021_oiis_research.sql"
LIMITATIONS = [
    "Current-panel Nifty 100 universe introduces survivorship bias.",
    "Public OHLCV and delivery are participation proxies, not confirmed institutional flow.",
    "OIIS determines entry eligibility only; every accepted entry uses the common target-only exit contract.",
    "Cash replay executes LONG decisions only; SHORT decisions remain signal studies.",
    "Options, futures, live orders, calibrated probabilities and unapproved risk limits are blocked.",
    "Event/catalyst history is not yet complete enough to create positive catalyst scores.",
    "Outcomes are isolated per symbol; a finite-capital cross-symbol portfolio replay is a separate required evaluation.",
    "There is no stop-loss, strategy, timeout, forced-close, or run-end exit; adverse paths are recorded as risk evidence.",
]

DEFAULT_MINUTE_CSV_DIR = Path("/home/novius2/data/nifty-50-minute-data/aaditya555/NIFTY50")


def digest_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def digest_file(path: Path) -> str:
    return digest_bytes(path.read_bytes())


def frame(cur, sql: str, params: tuple[Any, ...] = ()) -> pd.DataFrame:
    cur.execute(sql, params)
    rows = cur.fetchall()
    return pd.DataFrame(rows, columns=[column.name for column in cur.description])


def load_source(conn, start: date, end: date, symbol: str | None) -> tuple[pd.DataFrame, pd.DataFrame]:
    warmup = start - timedelta(days=150)
    symbol_clause = "AND UPPER(TRIM(e.symbol))=%s" if symbol else ""
    params: tuple[Any, ...] = (warmup, end, symbol) if symbol else (warmup, end)
    with conn.cursor() as cur:
        prices = frame(cur, f"""
          WITH universe AS (
            SELECT DISTINCT UPPER(REGEXP_REPLACE(TRIM(tradingsymbol),'-EQ$','')) symbol
            FROM public.instrument_universe
            WHERE exchange='NSE' AND universe_name='nifty100_equity' AND active_to IS NULL
          ), sectors AS (
            SELECT DISTINCT ON (UPPER(TRIM(symbol))) UPPER(TRIM(symbol)) symbol,
              COALESCE(NULLIF(TRIM(sector),''),NULLIF(TRIM(industry),''),NULLIF(TRIM(basic_industry),''),'OTHER') sector
            FROM public.index_constituents ORDER BY UPPER(TRIM(symbol)),updated_at DESC
          )
          SELECT DISTINCT ON (e.trade_date,UPPER(TRIM(e.symbol))) e.trade_date,
            UPPER(TRIM(e.symbol)) symbol,COALESCE(s.sector,'OTHER') sector,
            e.open_price::double precision open_price,e.high_price::double precision high_price,
            e.low_price::double precision low_price,e.close_price::double precision close_price,
            e.prev_close::double precision prev_close,e.total_traded_qty::double precision volume,
            e.turnover_lacs::double precision turnover_lacs,e.deliverable_pct::double precision deliverable_pct
          FROM nse.fact_eod_prices e JOIN universe u ON u.symbol=UPPER(TRIM(e.symbol))
          LEFT JOIN sectors s ON s.symbol=u.symbol
          WHERE e.trade_date BETWEEN %s AND %s AND COALESCE(e.series,'EQ')='EQ'
            AND UPPER(TRIM(e.symbol)) <> 'TMPV' {symbol_clause}
          ORDER BY e.trade_date,UPPER(TRIM(e.symbol)),e.loaded_at DESC
        """, params)
        regime_symbol_clause = "AND (instrument_type='INDEX' OR symbol=%s)" if symbol else ""
        regime_params: tuple[Any, ...] = (POLICY_VERSION, warmup, end, symbol) if symbol else (POLICY_VERSION, warmup, end)
        regimes = frame(cur, f"""
          SELECT trade_date,instrument_type,symbol,return_21d_pct,primary_trend,market_zone,vix_regime
          FROM strategy_eval.market_regime_daily
          WHERE policy_version=%s AND trade_date BETWEEN %s AND %s
            {regime_symbol_clause}
        """, regime_params)
    return prices, regimes


def derive_features(prices: pd.DataFrame, regimes: pd.DataFrame) -> pd.DataFrame:
    if prices.empty:
        raise RuntimeError("No canonical EOD rows matched the requested scope")
    prices = prices.sort_values(["symbol", "trade_date"]).copy()
    prices["trade_date"] = pd.to_datetime(prices["trade_date"])
    grouped = prices.groupby("symbol", sort=False)
    for period in (1, 5, 21, 63):
        prices[f"return_{period}d_pct"] = grouped["close_price"].pct_change(period, fill_method=None) * 100.0
    prices["sma20"] = grouped["close_price"].transform(lambda s: s.rolling(20, min_periods=20).mean())
    prices["sma50"] = grouped["close_price"].transform(lambda s: s.rolling(50, min_periods=50).mean())
    prior_close = grouped["close_price"].shift(1)
    true_range = pd.concat([
        prices["high_price"] - prices["low_price"],
        (prices["high_price"] - prior_close).abs(),
        (prices["low_price"] - prior_close).abs(),
    ], axis=1).max(axis=1)
    prices["atr14"] = true_range.groupby(prices["symbol"]).transform(lambda s: s.rolling(14, min_periods=14).mean())
    delta = grouped["close_price"].diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.groupby(prices["symbol"]).transform(lambda s: s.ewm(alpha=1/14, adjust=False, min_periods=14).mean())
    avg_loss = loss.groupby(prices["symbol"]).transform(lambda s: s.ewm(alpha=1/14, adjust=False, min_periods=14).mean())
    rs = avg_gain / avg_loss.replace(0, np.nan)
    prices["rsi_14"] = (100.0 - 100.0 / (1.0 + rs)).where(avg_loss != 0, 100.0)
    prices["volume_ratio_20"] = prices["volume"] / grouped["volume"].transform(lambda s: s.shift(1).rolling(20, min_periods=20).mean())
    prices["delivery_ratio_20"] = prices["deliverable_pct"] / grouped["deliverable_pct"].transform(lambda s: s.shift(1).rolling(20, min_periods=20).mean())
    prices["prior_high_20"] = grouped["high_price"].transform(lambda s: s.shift(1).rolling(20, min_periods=20).max())
    prices["prior_low_20"] = grouped["low_price"].transform(lambda s: s.shift(1).rolling(20, min_periods=20).min())
    spread = prices["high_price"] - prices["low_price"]
    prices["close_location"] = ((prices["close_price"] - prices["low_price"]) / spread.replace(0, np.nan)).clip(0, 1)
    prices["turnover_percentile"] = prices.groupby("trade_date")["turnover_lacs"].rank(pct=True, method="average")
    prices["sector_return_21d_pct"] = prices.groupby(["trade_date", "sector"])["return_21d_pct"].transform("mean")

    index_regimes = regimes[regimes["instrument_type"] == "INDEX"].copy()
    stock_regimes = regimes[regimes["instrument_type"] == "STOCK"].copy()
    index_regimes["trade_date"] = pd.to_datetime(index_regimes["trade_date"])
    stock_regimes["trade_date"] = pd.to_datetime(stock_regimes["trade_date"])
    for code, prefix in (("NIFTY 50", "nifty"), ("BANK NIFTY", "bank_nifty"), ("INDIA VIX", "vix")):
        subset = index_regimes[index_regimes["symbol"] == code][["trade_date", "return_21d_pct", "primary_trend", "market_zone", "vix_regime"]].rename(columns={
            "return_21d_pct": f"{prefix}_return_21d_pct", "primary_trend": f"{prefix}_trend", "market_zone": f"{prefix}_zone", "vix_regime": f"{prefix}_regime"
        }).sort_values("trade_date")
        # Index files occasionally omit a session present in the stock bhavcopy.
        # Carry only the latest already-available regime, capped at seven days;
        # never look forward into a future index observation.
        prices = pd.merge_asof(
            prices.sort_values("trade_date"), subset, on="trade_date",
            direction="backward", tolerance=pd.Timedelta(7, unit="D"),
        )
    stock_subset = stock_regimes[["trade_date", "symbol", "primary_trend", "market_zone"]].rename(columns={"primary_trend": "stock_trend", "market_zone": "stock_zone"})
    prices = prices.merge(stock_subset, on=["trade_date", "symbol"], how="left")
    cross_section_proxy = prices.groupby("trade_date")["return_21d_pct"].mean()
    prices["nifty_return_21d_pct"] = prices["nifty_return_21d_pct"].fillna(prices["trade_date"].map(cross_section_proxy))
    return prices


def number(value: Any) -> float | None:
    return None if value is None or pd.isna(value) else float(value)


def text_value(value: Any) -> str | None:
    return None if value is None or pd.isna(value) else str(value)


def evaluate_symbol(item: tuple[str, pd.DataFrame], start: date, end: date) -> list[dict[str, Any]]:
    symbol, rows = item
    output: list[dict[str, Any]] = []
    for row in rows.itertuples(index=False):
        trade_date = pd.Timestamp(row.trade_date).date()
        if trade_date < start or trade_date > end:
            continue
        feature = OIISFeature(
            symbol=symbol, trade_date=trade_date.isoformat(), open_price=float(row.open_price), high_price=float(row.high_price),
            low_price=float(row.low_price), close_price=float(row.close_price), prev_close=float(row.prev_close),
            volume_ratio_20=number(row.volume_ratio_20), delivery_ratio_20=number(row.delivery_ratio_20),
            turnover_percentile=number(row.turnover_percentile), close_location=number(row.close_location),
            return_1d_pct=number(row.return_1d_pct), return_5d_pct=number(row.return_5d_pct),
            return_21d_pct=number(row.return_21d_pct), return_63d_pct=number(row.return_63d_pct),
            nifty_return_21d_pct=number(row.nifty_return_21d_pct), sector_return_21d_pct=number(row.sector_return_21d_pct),
            rsi_14=number(row.rsi_14), sma20=number(row.sma20), sma50=number(row.sma50), atr14=number(row.atr14),
            prior_high_20=number(row.prior_high_20), prior_low_20=number(row.prior_low_20),
            stock_trend=text_value(getattr(row, "stock_trend", None)), stock_zone=text_value(getattr(row, "stock_zone", None)),
            nifty_trend=text_value(getattr(row, "nifty_trend", None)), nifty_zone=text_value(getattr(row, "nifty_zone", None)),
            bank_nifty_trend=text_value(getattr(row, "bank_nifty_trend", None)), bank_nifty_zone=text_value(getattr(row, "bank_nifty_zone", None)),
            vix_regime=text_value(getattr(row, "vix_regime", None)) or text_value(getattr(row, "nifty_vix_regime", None)),
        )
        result = evaluate_feature(feature)
        payload = {
            "symbol": symbol, "sector": row.sector, "trade_date": trade_date,
            "data_quality_score": result["dq"]["score"], "data_permission": result["dq"]["permission"],
            "ofactor_long": result["ofactor_long"]["final_score"], "ofactor_short": result["ofactor_short"]["final_score"],
            "directional_edge": result["directional_edge"], "selected_direction": result["direction"],
            "setup_id": result["xfactor"]["setup_id"], "setup_state": result["xfactor"]["setup_state"],
            "xfactor_score": result["xfactor"]["score"], "decision_code": result["xfactor"]["decision"],
            "hard_gates": result["xfactor"]["hard_gates"], "evidence": result,
            "stock_primary_trend": feature.stock_trend, "stock_market_zone": feature.stock_zone,
            "nifty_primary_trend": feature.nifty_trend, "nifty_market_zone": feature.nifty_zone,
            "bank_nifty_primary_trend": feature.bank_nifty_trend, "bank_nifty_market_zone": feature.bank_nifty_zone,
            "vix_regime": feature.vix_regime,
        }
        payload["decision_hash"] = digest_bytes(json.dumps(payload, sort_keys=True, default=str).encode())
        output.append(payload)
    return output


def _minute_frame(path: Path, start: date, end: date) -> pd.DataFrame:
    if not path.is_file():
        raise FileNotFoundError(f"minute CSV is required for exact common-exit evaluation: {path}")
    frame = pd.read_csv(path, usecols=["date", "open", "high", "low", "close"])
    frame = frame[(frame["date"] >= f"{start} 00:00:00") & (frame["date"] <= f"{end} 23:59:59")].copy()
    frame["ts"] = pd.to_datetime(frame.pop("date"), errors="coerce")
    if frame["ts"].dt.tz is None:
        frame["ts"] = frame["ts"].dt.tz_localize("Asia/Kolkata", ambiguous="raise", nonexistent="raise")
    for column in ("open", "high", "low", "close"):
        frame[column] = pd.to_numeric(frame[column], errors="coerce")
    frame = frame.dropna().sort_values("ts").reset_index(drop=True)
    frame["session"] = frame["ts"].dt.date
    return frame


def simulate_trades(
    decisions: list[dict[str, Any]], prices: pd.DataFrame, config: dict[str, Any],
    minute_csv_dir: Path, end: date,
) -> list[dict[str, Any]]:
    simulate_trades.missing_minute_symbols = []
    execution = config["execution"]
    policy = CommonExitPolicy(
        intraday_target_pct=Decimal(str(execution["intraday_target_pct_from_buy_price"])),
        swing_target_pct=Decimal(str(execution["swing_target_pct_from_original_buy_price"])),
        intraday_round_trip_cost_bps=Decimal(str(execution["intraday_round_trip_cost_bps"])),
        swing_round_trip_cost_bps=Decimal(str(execution["swing_round_trip_cost_bps"])),
        positive_profit_tax_rate=Decimal(str(execution["positive_profit_tax_rate"])),
    )
    by_symbol = {symbol: group.sort_values("trade_date").reset_index(drop=True) for symbol, group in prices.groupby("symbol")}
    index_by_symbol = {symbol: {pd.Timestamp(value).date(): idx for idx, value in enumerate(group["trade_date"])} for symbol, group in by_symbol.items()}
    trades: list[dict[str, Any]] = []
    busy_until: dict[str, date] = {}
    minute_cache: dict[str, pd.DataFrame] = {}
    minute_checksums: dict[str, str] = {}
    missing_minute_symbols: set[str] = set()
    for decision in sorted(decisions, key=lambda row: (row["trade_date"], row["symbol"])):
        if decision["decision_code"] not in {"ENTERABLE_TIER_A", "ENTERABLE_TIER_B"} or decision["selected_direction"] != "LONG":
            continue
        symbol = decision["symbol"]
        if busy_until.get(symbol, date.min) >= decision["trade_date"]:
            continue
        group = by_symbol[symbol]
        signal_index = index_by_symbol[symbol].get(decision["trade_date"])
        if signal_index is None or signal_index + 1 >= len(group):
            continue
        entry_index = signal_index + 1
        entry_row = group.iloc[entry_index]
        entry_date = pd.Timestamp(entry_row.trade_date).date()
        if symbol not in minute_cache:
            minute_path = minute_csv_dir / f"{symbol}.csv"
            if not minute_path.is_file():
                missing_minute_symbols.add(symbol)
                continue
            minute_cache[symbol] = _minute_frame(minute_path, entry_date, end)
            minute_checksums[symbol] = digest_file(minute_path)
        minute = minute_cache[symbol]
        path_frame = minute[minute["session"] >= entry_date].copy()
        if path_frame.empty or path_frame.iloc[0]["session"] != entry_date:
            continue
        # The CSV estate is retrospectively corporate-action adjusted whereas
        # canonical EOD facts retain their session price basis.  Normalize each
        # minute session to that session's canonical EOD open before evaluating
        # targets; this prevents future bonus/split adjustments from changing a
        # historical ₹2 lakh position size.
        eod_open = {pd.Timestamp(row.trade_date).date(): float(row.open_price) for row in group.itertuples(index=False)}
        csv_open = path_frame.groupby("session", sort=False)["open"].first().to_dict()
        factors = {session: eod_open[session] / value for session, value in csv_open.items() if session in eod_open and value > 0}
        path_frame = path_frame[path_frame["session"].isin(factors)].copy()
        if path_frame.empty or entry_date not in factors:
            continue
        for column in ("open", "high", "low", "close"):
            path_frame[column] = path_frame[column] * path_frame["session"].map(factors)
        first = path_frame.iloc[0]
        entry = Decimal(str(first.open))
        quantity = max(int(Decimal(str(execution["ticket_rupees"])) // entry), 1)
        path = [PathBar(
            ts=pd.Timestamp(row.ts).to_pydatetime(), session=row.session,
            open=Decimal(str(row.open)), high=Decimal(str(row.high)),
            low=Decimal(str(row.low)), close=Decimal(str(row.close)),
        ) for row in path_frame.itertuples(index=False)]
        outcome = evaluate_long_target_only(
            symbol=symbol, signal_date=decision["trade_date"], entry_price=entry,
            quantity=quantity, bars=path, policy=policy,
        )
        outcome["decision_hash"] = decision["decision_hash"]
        outcome["minute_source_sha256"] = minute_checksums[symbol]
        outcome["minute_to_eod_entry_basis_factor"] = round(float(factors[entry_date]), 8)
        outcome["target_price"] = (
            outcome["intraday_target_price"] if str(outcome["exit_reason"]).startswith("TARGET_INTRADAY")
            else outcome["swing_target_price"]
        )
        notional = float(entry) * quantity
        economic_pnl = outcome["after_tax_net_pnl"] if outcome["status"] == "CLOSED" else outcome["unrealized_net_liquidation_pnl"]
        outcome["return_pct"] = round(100.0 * float(economic_pnl) / notional, 4)
        trades.append(outcome)
        if outcome["status"] == "CLOSED":
            busy_until[symbol] = outcome["exit_date"]
        else:
            # An unresolved target-only position occupies the symbol and its
            # capital through the end of the evaluation; later entries cannot occur.
            busy_until[symbol] = end
    # The attribute is consumed by the caller without changing the stable
    # trade-row contract. Missing minute evidence is a data warning, never a
    # fabricated daily fallback or a synthetic exit.
    simulate_trades.missing_minute_symbols = sorted(missing_minute_symbols)
    return trades


def performance(decisions: list[dict[str, Any]], trades: list[dict[str, Any]]) -> list[dict[str, Any]]:
    trade_map = {row["decision_hash"]: row for row in trades}
    rows: list[dict[str, Any]] = []
    dimensions = {
        "STOCK_TREND": "stock_primary_trend", "STOCK_ZONE": "stock_market_zone",
        "NIFTY_TREND": "nifty_primary_trend", "NIFTY_ZONE": "nifty_market_zone",
        "BANK_NIFTY_TREND": "bank_nifty_primary_trend", "BANK_NIFTY_ZONE": "bank_nifty_market_zone",
        "VIX_REGIME": "vix_regime", "SECTOR": "sector", "DECISION": "decision_code",
    }
    for bucket_type, field in dimensions.items():
        values = sorted({str(row.get(field) or "UNKNOWN") for row in decisions})
        for value in values:
            selected = [row for row in decisions if str(row.get(field) or "UNKNOWN") == value]
            selected_trades = [trade_map[row["decision_hash"]] for row in selected if row["decision_hash"] in trade_map]
            closed_trades = [row for row in selected_trades if row["status"] == "CLOSED"]
            returns = [row["return_pct"] for row in closed_trades]
            rows.append({
                "bucket_type": bucket_type, "bucket_key": value, "decision_count": len(selected), "trade_count": len(closed_trades),
                "win_rate_pct": round(100 * sum(value > 0 for value in returns) / len(returns), 4) if returns else None,
                "avg_return_pct": round(float(np.mean(returns)), 4) if returns else None,
                "median_return_pct": round(float(np.median(returns)), 4) if returns else None,
                "after_tax_net_pnl": round(sum(row["after_tax_net_pnl"] for row in closed_trades), 4),
                "open_position_count": len(selected_trades) - len(closed_trades),
                "open_unrealized_net_liquidation_pnl": round(sum(row["unrealized_net_liquidation_pnl"] for row in selected_trades if row["status"] != "CLOSED"), 4),
            })
    return rows


def jsonable(value: Any) -> Any:
    if isinstance(value, (date, datetime, pd.Timestamp)): return value.isoformat()
    if isinstance(value, Decimal): return float(value)
    if isinstance(value, (np.integer,)): return int(value)
    if isinstance(value, (np.floating,)): return None if np.isnan(value) else float(value)
    raise TypeError(type(value).__name__)


def write_outputs(output_dir: Path, run_id: str, decisions: list[dict[str, Any]], trades: list[dict[str, Any]], buckets: list[dict[str, Any]], summary: dict[str, Any], missing_minute_symbols: list[str]) -> list[Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    decision_export = [{key: json.dumps(value, default=jsonable, sort_keys=True) if key in {"hard_gates", "evidence"} else value for key, value in row.items()} for row in decisions]
    pd.DataFrame(decision_export).to_csv(output_dir / "decisions.csv", index=False, lineterminator="\n")
    trade_export = [{key: value for key, value in row.items() if key not in {"target_events", "adverse_events", "policy"}} for row in trades]
    target_export = [{"decision_hash": row["decision_hash"], "symbol": row["symbol"], **event} for row in trades for event in row["target_events"]]
    adverse_export = [{"decision_hash": row["decision_hash"], "symbol": row["symbol"], **event} for row in trades for event in row["adverse_events"]]
    pd.DataFrame(trade_export).to_csv(output_dir / "trades.csv", index=False, lineterminator="\n")
    pd.DataFrame(target_export).to_csv(output_dir / "target_events.csv", index=False, lineterminator="\n")
    pd.DataFrame(adverse_export).to_csv(output_dir / "adverse_events.csv", index=False, lineterminator="\n")
    pd.DataFrame({"symbol": missing_minute_symbols}).to_csv(output_dir / "missing_minute_symbols.csv", index=False, lineterminator="\n")
    pd.DataFrame(buckets).to_csv(output_dir / "regime_performance.csv", index=False, lineterminator="\n")
    (output_dir / "summary.json").write_text(json.dumps(summary, indent=2, sort_keys=True, default=jsonable) + "\n", encoding="utf-8")
    (output_dir / "summary.md").write_text(
        "# OIIS cash-daily replay\n\n" + "\n".join(f"- {key}: `{value}`" for key, value in summary.items() if not isinstance(value, (dict, list)))
        + "\n\nThis is a research replay, not live-order authority or a profitability claim.\n", encoding="utf-8"
    )
    files = sorted(path for path in output_dir.iterdir() if path.is_file())
    checksums = "\n".join(f"{digest_file(path)}  {path.name}" for path in files) + "\n"
    (output_dir / "checksums.sha256").write_text(checksums, encoding="utf-8")
    return sorted(path for path in output_dir.iterdir() if path.is_file())


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database-url", default=os.environ.get("DATABASE_URL"))
    parser.add_argument("--start", type=date.fromisoformat, default=date(2023, 8, 6))
    parser.add_argument("--end", type=date.fromisoformat, default=date(2026, 8, 5))
    parser.add_argument("--symbol", help="One NSE symbol for smoke/acceptance; omit only for confirmed full run")
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    parser.add_argument("--schema-sql", type=Path, default=DEFAULT_SCHEMA)
    parser.add_argument("--minute-csv-dir", type=Path, default=DEFAULT_MINUTE_CSV_DIR,
                        help="IST one-minute OHLCV directory used by the common exit evaluator")
    parser.add_argument("--output-root", type=Path, default=PROJECT_ROOT / "outputs" / "oiis_cash_daily_research_v1")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    if not args.database_url: raise SystemExit("--database-url or DATABASE_URL is required")
    if args.end < args.start: raise SystemExit("--end must not precede --start")
    if not args.symbol and os.environ.get("CONFIRM_FULL_OIIS_REPLAY") != "YES":
        raise SystemExit("Full replay blocked. Set CONFIRM_FULL_OIIS_REPLAY=YES after the one-symbol acceptance passes.")
    config = json.loads(args.config.read_text(encoding="utf-8"))
    config_hash = digest_file(args.config)
    symbol = args.symbol.strip().upper() if args.symbol else None
    if symbol in EXCLUDED_SYMBOLS:
        raise SystemExit(f"{symbol} is excluded because its demerger breaks comparable historical continuity")
    run_id = str(uuid.uuid4())
    run_hash = digest_bytes(json.dumps({"config": config_hash, "start": str(args.start), "end": str(args.end), "symbol": symbol}, sort_keys=True).encode())
    output_dir = args.output_root / run_id

    with psycopg.connect(args.database_url, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute(args.schema_sql.read_text(encoding="utf-8"))
            cur.execute("INSERT INTO oiis.formula_version (formula_version,strategy_id,status,config_json,config_sha256) VALUES (%s,%s,%s,%s::jsonb,%s) ON CONFLICT (formula_version) DO NOTHING", (FORMULA_VERSION, STRATEGY_ID, config["status"], json.dumps(config), config_hash))
            cur.execute("INSERT INTO oiis.replay_run (replay_run_id,strategy_id,formula_version,universe_name,membership_mode,requested_start,requested_end,symbol_filter,status,run_hash,limitations_json) VALUES (%s,%s,%s,'nifty100_equity','CURRENT_PANEL_RESEARCH_ONLY',%s,%s,%s,'RUNNING',%s,%s::jsonb)", (run_id, STRATEGY_ID, FORMULA_VERSION, args.start, args.end, symbol, run_hash, json.dumps(LIMITATIONS)))
        conn.commit()
        try:
            prices, regimes = load_source(conn, args.start, args.end, symbol)
            features = derive_features(prices, regimes)
            groups = list(features.groupby("symbol", sort=True))
            with ThreadPoolExecutor(max_workers=max(1, min(args.workers, len(groups)))) as pool:
                nested = list(pool.map(lambda item: evaluate_symbol(item, args.start, args.end), groups))
            decisions = [row for rows in nested for row in rows]
            trades = simulate_trades(decisions, features, config, args.minute_csv_dir, args.end)
            missing_minute_symbols = list(getattr(simulate_trades, "missing_minute_symbols", []))
            buckets = performance(decisions, trades)
            closed_trades = [row for row in trades if row["status"] == "CLOSED"]
            open_positions = [row for row in trades if row["status"] != "CLOSED"]
            minute_sources = {row["symbol"]: row["minute_source_sha256"] for row in trades}
            run_hash = digest_bytes(json.dumps({"base_run_hash": run_hash, "minute_sources": minute_sources}, sort_keys=True).encode())
            summary = {
                "replay_run_id": run_id, "strategy_id": STRATEGY_ID, "formula_version": FORMULA_VERSION,
                "requested_start": args.start, "requested_end": args.end,
                "actual_start": min((row["trade_date"] for row in decisions), default=None),
                "actual_end": max((row["trade_date"] for row in decisions), default=None),
                "symbol_filter": symbol, "symbol_count": len(groups), "decision_count": len(decisions),
                "enterable_count": sum(row["decision_code"] in {"ENTERABLE_TIER_A", "ENTERABLE_TIER_B"} for row in decisions),
                "accepted_position_count": len(trades), "trade_count": len(closed_trades),
                "open_position_count": len(open_positions),
                "after_tax_net_pnl": round(sum(row["after_tax_net_pnl"] for row in closed_trades), 4),
                "open_unrealized_net_liquidation_pnl": round(sum(row["unrealized_net_liquidation_pnl"] for row in open_positions), 4),
                "total_net_liquidation_pnl": round(sum(row["after_tax_net_pnl"] for row in closed_trades) + sum(row["unrealized_net_liquidation_pnl"] for row in open_positions), 4),
                "win_rate_pct": round(100 * sum(row["after_tax_net_pnl"] > 0 for row in closed_trades) / len(closed_trades), 4) if closed_trades else None,
                "config_sha256": config_hash, "run_hash": run_hash, "status": "SUCCEEDED", "limitations": LIMITATIONS,
                "exit_policy_id": "COMMON-TARGET-ONLY-0.3-1.0-V1",
                "missing_minute_symbols": missing_minute_symbols,
                "data_completeness_status": "WARN" if missing_minute_symbols else "PASS",
                "result_type": "OPPORTUNITY_SCAN", "rankability_status": "NOT_RANKABLE", "rating": "NR",
            }
            files = write_outputs(output_dir, run_id, decisions, trades, buckets, summary, missing_minute_symbols)
            if args.dry_run:
                conn.rollback()
            else:
                with conn.cursor() as cur:
                    for row in decisions:
                        cur.execute("""
                          INSERT INTO oiis.decision_snapshot (replay_run_id,symbol,sector,trade_date,data_quality_score,data_permission,
                            ofactor_long,ofactor_short,directional_edge,selected_direction,setup_id,setup_state,xfactor_score,decision_code,
                            hard_gates_json,evidence_json,stock_primary_trend,stock_market_zone,nifty_primary_trend,nifty_market_zone,
                            bank_nifty_primary_trend,bank_nifty_market_zone,vix_regime,decision_hash)
                          VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb,%s::jsonb,%s,%s,%s,%s,%s,%s,%s,%s)
                        """, (run_id,row["symbol"],row["sector"],row["trade_date"],row["data_quality_score"],row["data_permission"],row["ofactor_long"],row["ofactor_short"],row["directional_edge"],row["selected_direction"],row["setup_id"],row["setup_state"],row["xfactor_score"],row["decision_code"],json.dumps(row["hard_gates"]),json.dumps(row["evidence"],default=jsonable),row["stock_primary_trend"],row["stock_market_zone"],row["nifty_primary_trend"],row["nifty_market_zone"],row["bank_nifty_primary_trend"],row["bank_nifty_market_zone"],row["vix_regime"],row["decision_hash"]))
                    cur.execute("SELECT decision_id,decision_hash FROM oiis.decision_snapshot WHERE replay_run_id=%s", (run_id,))
                    decision_ids = {row["decision_hash"]: row["decision_id"] for row in cur.fetchall()}
                    for row in trades:
                        cur.execute("""
                          INSERT INTO oiis.trade_outcome (decision_id,entry_date,exit_date,entry_price,exit_price,stop_price,target_price,quantity,
                            exit_reason,gross_pnl,costs,tax_reserve,after_tax_net_pnl,return_pct,holding_sessions,mfe_pct,mae_pct,outcome_json,
                            position_status,unrealized_net_liquidation_pnl,capital_released)
                          VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb,%s,%s,%s)
                        """, (decision_ids[row["decision_hash"]],row["entry_date"],row["exit_date"],row["entry_price"],row["exit_price"],row["stop_price"],row["target_price"],row["quantity"],row["exit_reason"],row["gross_pnl"],row["costs"],row["tax_reserve"],row["after_tax_net_pnl"],row["return_pct"],row["holding_sessions"],row["mfe_pct"],row["mae_pct"],json.dumps({"policy_id":row["policy_id"],"target_events":row["target_events"],"adverse_events":row["adverse_events"],"entry_ts":row["entry_ts"],"exit_ts":row["exit_ts"],"mark_price":row["mark_price"],"minute_source_sha256":row["minute_source_sha256"],"stop_exit_enabled":False,"timeout_exit_enabled":False},default=jsonable),row["status"],row["unrealized_net_liquidation_pnl"],row["capital_released"]))
                    for row in buckets:
                        cur.execute("INSERT INTO oiis.performance_bucket (replay_run_id,bucket_type,bucket_key,decision_count,trade_count,win_rate_pct,avg_return_pct,median_return_pct,after_tax_net_pnl,metrics_json) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb)", (run_id,row["bucket_type"],row["bucket_key"],row["decision_count"],row["trade_count"],row["win_rate_pct"],row["avg_return_pct"],row["median_return_pct"],row["after_tax_net_pnl"],json.dumps({"open_position_count":row["open_position_count"],"open_unrealized_net_liquidation_pnl":row["open_unrealized_net_liquidation_pnl"]})))
                    cur.execute("UPDATE oiis.replay_run SET actual_start=%s,actual_end=%s,symbol_count=%s,decision_count=%s,enterable_count=%s,trade_count=%s,status='SUCCEEDED',result_type=%s,rankability_status=%s,rating=%s,run_hash=%s,metrics_json=%s::jsonb,finished_at=NOW() WHERE replay_run_id=%s", (summary["actual_start"],summary["actual_end"],summary["symbol_count"],summary["decision_count"],summary["enterable_count"],summary["trade_count"],summary["result_type"],summary["rankability_status"],summary["rating"],summary["run_hash"],json.dumps(summary,default=jsonable),run_id))
                    for path in files:
                        cur.execute("INSERT INTO oiis.artifact_manifest (replay_run_id,artifact_type,artifact_path,sha256,size_bytes) VALUES (%s,%s,%s,%s,%s)", (run_id,path.suffix.lstrip(".") or "file",str(path.resolve()),digest_file(path),path.stat().st_size))
                conn.commit()
            print(json.dumps({**summary, "output_dir": str(output_dir), "persisted": not args.dry_run}, indent=2, default=jsonable))
        except Exception as exc:
            conn.rollback()
            with conn.cursor() as cur:
                cur.execute("UPDATE oiis.replay_run SET status='FAILED',error_message=%s,finished_at=NOW() WHERE replay_run_id=%s", (str(exc)[:2000], run_id))
            conn.commit()
            raise


if __name__ == "__main__":
    main()
