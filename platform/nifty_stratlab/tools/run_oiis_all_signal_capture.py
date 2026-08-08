#!/usr/bin/env python3
"""Build a threshold-free, next-session OIIS path-analysis research dataset.

This is an opportunity diagnostic, not a production strategy replay. It scores
every completed daily stock observation, records O=0/X=1 as the study floor,
and evaluates every valid next-session path without allowing normal entry gates
to censor the research population. The gates and their scores remain evidence.
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import os
import sys
import time
import uuid
from concurrent.futures import ProcessPoolExecutor, as_completed
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
import psycopg
import pyarrow as pa
import pyarrow.parquet as pq

PROJECT = Path(__file__).resolve().parents[1]
ROOT = PROJECT.parents[1]
sys.path.insert(0, str(PROJECT / "src"))
sys.path.insert(0, str(PROJECT / "tools"))

import run_oiis_cash_daily_replay as shared  # noqa: E402
from nifty_stratlab.oiis.engine import data_quality, execution, opportunity  # noqa: E402

MINUTE_ROOT = Path("/home/novius2/data/algo-trading-data-nifty-100-data-with-indicators")
OUTPUT_ROOT = PROJECT / "outputs" / "oiis_all_signal_capture_v1"
MIGRATION = ROOT / "db/sql/031_oiis_all_signal_capture.sql"
O_COMPONENTS = (
    "market_regime_support", "sector_industry_support", "trend_quality",
    "relative_strength", "money_flow_participation", "momentum_quality",
    "institutional_confirmation", "liquidity_tradability", "catalyst_context",
)
X_COMPONENTS = (
    "setup_integrity", "entry_location_quality", "trigger_confirmation",
    "stop_invalidation_quality", "reward_path_quality",
    "market_sector_synchronisation", "liquidity_slippage_quality",
    "timing_session_quality", "instrument_quality",
)
INTRADAY_TARGETS = {"i030": 0.3, "i050": 0.5, "i070": 0.7}
SWING_TARGETS = {"s100": 1.0, "s200": 2.0, "s500": 5.0}
H30_TARGETS = {"h30_100": 1.0, "h30_200": 2.0, "h30_500": 5.0, "h30_1000": 10.0, "h30_2000": 20.0}
ADVERSE = {"a050": -0.5, "a100": -1.0, "a200": -2.0, "a500": -5.0, "a1000": -10.0}
ALIASES = {"ARE&M": "AREM", "GVT&D": "GVTD", "J&KBANK": "JKBANK", "M&M": "MM", "M&MFIN": "MMFIN"}


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def json_default(value: Any) -> Any:
    if isinstance(value, (date, datetime, pd.Timestamp)): return value.isoformat()
    if isinstance(value, (np.integer,)): return int(value)
    if isinstance(value, (np.floating,)): return None if np.isnan(value) else float(value)
    if isinstance(value, Decimal): return float(value)
    if pd.isna(value): return None
    raise TypeError(type(value).__name__)


def dump(path: Path, value: Any) -> None:
    path.write_text(json.dumps(value, indent=2, sort_keys=True, default=json_default) + "\n", encoding="utf-8")


def env_values() -> dict[str, str]:
    values = dict(os.environ)
    path = Path("/home/novius2/trading-stack/.env")
    if path.exists():
        for line in path.read_text(errors="replace").splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                key, value = line.split("=", 1)
                values.setdefault(key.strip(), value.strip().strip('"').strip("'"))
    return values


def connect(database: str | None = None):
    values = env_values()
    return psycopg.connect(
        host=values.get("POSTGRES_HOST", "100.86.108.108"),
        port=int(values.get("POSTGRES_PORT", "5432")),
        dbname=database or values.get("POSTGRES_DB", "tradingdb"),
        user=values.get("POSTGRES_USER", "trader"), password=values["POSTGRES_PASSWORD"],
    )


def add_indicators(frame: pd.DataFrame) -> pd.DataFrame:
    frame = frame.sort_values(["symbol", "trade_date"]).copy()
    grouped = frame.groupby("symbol", sort=False)
    high14 = grouped["high_price"].transform(lambda s: s.rolling(14, min_periods=14).max())
    low14 = grouped["low_price"].transform(lambda s: s.rolling(14, min_periods=14).min())
    frame["willr_14"] = -100.0 * (high14 - frame["close_price"]) / (high14 - low14).replace(0, np.nan)
    frame["fast_k_14"] = 100.0 * (frame["close_price"] - low14) / (high14 - low14).replace(0, np.nan)
    frame["slow_k_3"] = frame.groupby("symbol")["fast_k_14"].transform(lambda s: s.rolling(3, min_periods=3).mean())
    frame["ema_61"] = grouped["close_price"].transform(lambda s: s.ewm(span=61, adjust=False, min_periods=61).mean())
    frame["close_vs_ema61_abs"] = frame["close_price"] - frame["ema_61"]
    frame["close_vs_ema61_pct"] = 100.0 * frame["close_vs_ema61_abs"] / frame["ema_61"]
    frame["bb_mid_20"] = grouped["close_price"].transform(lambda s: s.rolling(20, min_periods=20).mean())
    bb_std = grouped["close_price"].transform(lambda s: s.rolling(20, min_periods=20).std(ddof=0))
    frame["bb_lower_20_2"] = frame["bb_mid_20"] - 2.0 * bb_std
    frame["bb_upper_20_2"] = frame["bb_mid_20"] + 2.0 * bb_std
    frame["bb_width_pct"] = 100.0 * (frame["bb_upper_20_2"] - frame["bb_lower_20_2"]) / frame["bb_mid_20"]
    frame["bb_position"] = (frame["close_price"] - frame["bb_lower_20_2"]) / (frame["bb_upper_20_2"] - frame["bb_lower_20_2"]).replace(0, np.nan)
    frame["volume_sma_20"] = grouped["volume"].transform(lambda s: s.rolling(20, min_periods=20).mean())
    frame["volume_ema_20"] = grouped["volume"].transform(lambda s: s.ewm(span=20, adjust=False, min_periods=20).mean())
    frame["volume_ema_60"] = grouped["volume"].transform(lambda s: s.ewm(span=60, adjust=False, min_periods=60).mean())
    frame["volume_vs_sma20"] = frame["volume"] / frame["volume_sma_20"]
    frame["volume_vs_ema20"] = frame["volume"] / frame["volume_ema_20"]
    frame["volume_vs_ema60"] = frame["volume"] / frame["volume_ema_60"]
    ema12 = grouped["close_price"].transform(lambda s: s.ewm(span=12, adjust=False, min_periods=12).mean())
    ema26 = grouped["close_price"].transform(lambda s: s.ewm(span=26, adjust=False, min_periods=26).mean())
    frame["macd_line_12_26"] = ema12 - ema26
    frame["macd_signal_9"] = frame.groupby("symbol")["macd_line_12_26"].transform(lambda s: s.ewm(span=9, adjust=False, min_periods=9).mean())
    frame["macd_histogram"] = frame["macd_line_12_26"] - frame["macd_signal_9"]
    frame["macd_line_pct_close"] = 100.0 * frame["macd_line_12_26"] / frame["close_price"]
    return frame


def load_inputs(start: date, end: date) -> pd.DataFrame:
    with connect() as conn:
        prices, regimes = shared.load_source(conn, start, end, None, all_stocks=True)
        features = add_indicators(shared.derive_features(prices, regimes))
        globals_ = pd.read_sql_query(
            """SELECT trade_date,instrument_name,close_price,return_1d_pct,return_21d_pct,
                      primary_trend,market_zone
               FROM strategy_eval.global_market_daily_regime
               WHERE trade_date BETWEEN %(start)s AND %(end)s""",
            conn, params={"start": start - timedelta(days=7), "end": end},
        )
    globals_["trade_date"] = pd.to_datetime(globals_["trade_date"])
    for instrument, group in globals_.groupby("instrument_name"):
        prefix = str(instrument).lower()
        subset = group.sort_values("trade_date").rename(columns={
            "close_price": f"{prefix}_close", "return_1d_pct": f"{prefix}_return_1d_pct",
            "return_21d_pct": f"{prefix}_return_21d_pct", "primary_trend": f"{prefix}_trend",
            "market_zone": f"{prefix}_zone",
        }).drop(columns=["instrument_name"])
        features = pd.merge_asof(
            features.sort_values("trade_date"), subset, on="trade_date",
            direction="backward", tolerance=pd.Timedelta(days=7),
        )
    return features.sort_values(["symbol", "trade_date"]).reset_index(drop=True)


def minute_map() -> dict[str, str]:
    result: dict[str, str] = {}
    for path in sorted(MINUTE_ROOT.glob("*_minute.csv")):
        symbol = path.name.removesuffix("_minute.csv")
        result.setdefault("".join(ch for ch in symbol.upper() if ch.isalnum()), str(path))
    return result


def minute_for_symbol(symbol: str, mapping: dict[str, str]) -> Path | None:
    alias = ALIASES.get(symbol, symbol)
    matched = mapping.get("".join(ch for ch in alias.upper() if ch.isalnum()))
    return Path(matched) if matched else None


def load_minutes(path: Path, start: date, end: date) -> pd.DataFrame:
    kept: list[pd.DataFrame] = []
    usecols = ["date", "open", "high", "low", "close"]
    for chunk in pd.read_csv(path, usecols=usecols, chunksize=500_000):
        text = chunk["date"].astype(str)
        selected = chunk[(text >= f"{start} 00:00:00") & (text <= f"{end} 23:59:59")].copy()
        if not selected.empty: kept.append(selected)
    if not kept: return pd.DataFrame(columns=[*usecols, "ts", "session"])
    frame = pd.concat(kept, ignore_index=True)
    frame["ts"] = pd.to_datetime(frame.pop("date"), errors="coerce")
    if frame["ts"].dt.tz is None:
        frame["ts"] = frame["ts"].dt.tz_localize("Asia/Kolkata", ambiguous="NaT", nonexistent="NaT")
    for column in ("open", "high", "low", "close"):
        frame[column] = pd.to_numeric(frame[column], errors="coerce")
    minute = frame["ts"].dt.hour * 60 + frame["ts"].dt.minute
    frame = frame.dropna().loc[
        (frame["ts"].dt.weekday < 5) & (minute >= 555) & (minute <= 930)
        & (frame["low"] > 0) & (frame["low"] <= frame[["open", "close"]].min(axis=1))
        & (frame["high"] >= frame[["open", "close"]].max(axis=1))
    ].sort_values("ts").drop_duplicates("ts", keep="last")
    frame["session"] = frame["ts"].dt.date
    return frame.reset_index(drop=True)


def pct(value: float, entry: float) -> float:
    return 100.0 * (float(value) / entry - 1.0)


def first_touch(frame: pd.DataFrame, column: str, threshold_price: float, above: bool) -> str | None:
    hit = frame[frame[column] >= threshold_price] if above else frame[frame[column] <= threshold_price]
    return None if hit.empty else pd.Timestamp(hit.iloc[0]["ts"]).isoformat()


def score_row(row: Any) -> tuple[dict[str, Any], dict[str, Any]]:
    feature = shared.OIISFeature(
        symbol=row.symbol, trade_date=pd.Timestamp(row.trade_date).date().isoformat(),
        open_price=float(row.open_price), high_price=float(row.high_price), low_price=float(row.low_price),
        close_price=float(row.close_price), prev_close=float(row.prev_close),
        volume_ratio_20=shared.number(row.volume_ratio_20), delivery_ratio_20=shared.number(row.delivery_ratio_20),
        turnover_percentile=shared.number(row.turnover_percentile), close_location=shared.number(row.close_location),
        return_1d_pct=shared.number(row.return_1d_pct), return_5d_pct=shared.number(row.return_5d_pct),
        return_21d_pct=shared.number(row.return_21d_pct), return_63d_pct=shared.number(row.return_63d_pct),
        nifty_return_21d_pct=shared.number(row.nifty_return_21d_pct), sector_return_21d_pct=shared.number(row.sector_return_21d_pct),
        rsi_14=shared.number(row.rsi_14), sma20=shared.number(row.sma20), sma50=shared.number(row.sma50),
        atr14=shared.number(row.atr14), prior_high_20=shared.number(row.prior_high_20), prior_low_20=shared.number(row.prior_low_20),
        stock_trend=shared.text_value(getattr(row, "stock_trend", None)), stock_zone=shared.text_value(getattr(row, "stock_zone", None)),
        nifty_trend=shared.text_value(getattr(row, "nifty_trend", None)), nifty_zone=shared.text_value(getattr(row, "nifty_zone", None)),
        bank_nifty_trend=shared.text_value(getattr(row, "bank_nifty_trend", None)), bank_nifty_zone=shared.text_value(getattr(row, "bank_nifty_zone", None)),
        vix_regime=shared.text_value(getattr(row, "vix_regime", None)) or shared.text_value(getattr(row, "nifty_vix_regime", None)),
    )
    dq = data_quality(feature)
    ol, oscore = opportunity(feature, "LONG"), opportunity(feature, "SHORT")
    edge = round(ol["final_score"] - oscore["final_score"], 4)
    selected = "LONG" if edge >= 0 else "SHORT"
    xl = execution(feature, "LONG", ol, dq, {"ofactor_min": 0, "xfactor_b": 1, "xfactor_a": 101})
    xs = execution(feature, "SHORT", oscore, dq, {"ofactor_min": 0, "xfactor_b": 1, "xfactor_a": 101})
    return {"dq": dq, "ol": ol, "os": oscore, "xl": xl, "xs": xs, "selected": selected, "edge": edge}, feature.__dict__


def analyse_symbol(args: tuple[str, pd.DataFrame, str | None, str, str, str]) -> dict[str, Any]:
    symbol, group, minute_path_text, start_text, end_text, fragment_dir_text = args
    start, end = date.fromisoformat(start_text), date.fromisoformat(end_text)
    fragment = Path(fragment_dir_text) / f"{symbol.replace('/', '_')}.parquet"
    if fragment.exists():
        metadata = pq.read_metadata(fragment)
        return {"symbol": symbol, "status": "RESUMED", "rows": metadata.num_rows, "fragment": str(fragment)}
    group = group.sort_values("trade_date").reset_index(drop=True)
    minute_path = Path(minute_path_text) if minute_path_text else None
    minutes = load_minutes(minute_path, start, end + timedelta(days=45)) if minute_path else pd.DataFrame()
    sessions = {day: rows for day, rows in minutes.groupby("session", sort=False)} if not minutes.empty else {}
    daily_index = {pd.Timestamp(value).date(): index for index, value in enumerate(group["trade_date"])}
    rows: list[dict[str, Any]] = []
    indicator_columns = (
        "open_price", "high_price", "low_price", "close_price", "prev_close", "return_1d_pct", "return_5d_pct",
        "return_21d_pct", "return_63d_pct", "rsi_14", "willr_14", "sma20", "sma50", "ema_61",
        "close_vs_ema61_abs", "close_vs_ema61_pct", "bb_lower_20_2", "bb_mid_20", "bb_upper_20_2",
        "bb_width_pct", "bb_position", "fast_k_14", "slow_k_3", "volume", "volume_sma_20",
        "volume_ema_20", "volume_ema_60", "volume_vs_sma20", "volume_vs_ema20", "volume_vs_ema60",
        "macd_line_12_26", "macd_signal_9", "macd_histogram", "macd_line_pct_close", "atr14",
    )
    global_columns = [c for c in group.columns if c.startswith(("crude_oil_", "dow_jones_", "gold_", "india_vix_", "usd_inr_"))]
    for signal_idx, signal in enumerate(group.itertuples(index=False)):
        signal_date = pd.Timestamp(signal.trade_date).date()
        if signal_date < start or signal_date > end: continue
        scored, _ = score_row(signal)
        selected_x = scored["xl"] if scored["selected"] == "LONG" else scored["xs"]
        row: dict[str, Any] = {
            "signal_date": signal_date, "symbol": symbol, "sector": signal.sector,
            "study_mode": "ALL_SIGNAL_DIAGNOSTIC_NOT_PORTFOLIO_RETURN", "ofactor_floor": 0.0, "xfactor_floor": 1.0,
            "selected_direction": scored["selected"], "directional_edge": scored["edge"],
            "ofactor_long": scored["ol"]["final_score"], "ofactor_short": scored["os"]["final_score"],
            "ofactor_long_raw": scored["ol"]["raw_score"], "ofactor_short_raw": scored["os"]["raw_score"],
            "ofactor_long_penalty": scored["ol"]["penalty_total"], "ofactor_short_penalty": scored["os"]["penalty_total"],
            "xfactor_score": selected_x["score"], "xfactor_long": scored["xl"]["score"], "xfactor_short": scored["xs"]["score"],
            "decision_code": selected_x["decision"], "setup_id": selected_x["setup_id"], "setup_state": selected_x["setup_state"],
            "data_quality_score": scored["dq"]["score"], "data_permission": scored["dq"]["permission"],
            "hard_gates": "|".join(selected_x["hard_gates"]),
            "stock_primary_trend": getattr(signal, "stock_trend", None), "stock_market_zone": getattr(signal, "stock_zone", None),
            "nifty_primary_trend": getattr(signal, "nifty_trend", None), "nifty_market_zone": getattr(signal, "nifty_zone", None),
            "bank_nifty_primary_trend": getattr(signal, "bank_nifty_trend", None), "bank_nifty_market_zone": getattr(signal, "bank_nifty_zone", None),
            "vix_regime": getattr(signal, "vix_regime", None), "nifty_close": getattr(signal, "nifty_close", None),
        }
        for name in indicator_columns + tuple(global_columns): row[name] = getattr(signal, name, None)
        for prefix, score in (("o_long", scored["ol"]), ("o_short", scored["os"])):
            for name in O_COMPONENTS:
                row[f"{prefix}_{name}"] = score["components"][name]
                row[f"{prefix}_{name}_weighted"] = score["weighted_contributions"][name]
        for prefix, score in (("x_long", scored["xl"]), ("x_short", scored["xs"])):
            for name in X_COMPONENTS:
                row[f"{prefix}_{name}"] = score["components"][name]
                row[f"{prefix}_{name}_weighted"] = score["weighted_contributions"][name]
        if signal_idx + 1 >= len(group):
            row["path_status"] = "NO_NEXT_VALID_SESSION"; rows.append(row); continue
        entry_idx = signal_idx + 1
        entry = group.iloc[entry_idx]
        entry_date = pd.Timestamp(entry.trade_date).date()
        entry_price = float(entry.open_price)
        row.update({"entry_date": entry_date, "entry_price": entry_price})
        session = sessions.get(entry_date)
        if minute_path is None:
            row["path_status"] = "MINUTE_FILE_NOT_FOUND"
        elif session is None or session.empty:
            row["path_status"] = "ENTRY_SESSION_MISSING"
        elif len(session) < 300:
            row["path_status"] = "ENTRY_SESSION_INCOMPLETE"
        else:
            row["path_status"] = "COMPLETE"
            basis = entry_price / float(session.iloc[0].open)
            session = session.copy()
            for column in ("open", "high", "low", "close"): session[column] *= basis
            row["entry_ts"] = pd.Timestamp(session.iloc[0].ts)
            row["intraday_mfe_pct"] = pct(session.high.max(), entry_price)
            row["intraday_mae_pct"] = pct(session.low.min(), entry_price)
            row["intraday_close_return_pct"] = pct(session.iloc[-1].close, entry_price)
            for name, level in INTRADAY_TARGETS.items():
                touched = first_touch(session, "high", entry_price * (1 + level / 100), True)
                row[f"{name}_hit"] = touched is not None; row[f"{name}_first_touch_ts"] = touched
            for name, level in ADVERSE.items():
                touched = first_touch(session, "low", entry_price * (1 + level / 100), False)
                row[f"intraday_{name}_hit"] = touched is not None; row[f"intraday_{name}_first_touch_ts"] = touched
            row["intraday_a_gt1000_hit"] = bool(row["intraday_mae_pct"] < -10.0)
        d5 = group.iloc[entry_idx:entry_idx + 6]
        h30 = group.iloc[entry_idx:entry_idx + 30]
        row["d5_evaluation_sessions"] = len(d5); row["h30_evaluation_sessions"] = len(h30)
        if not d5.empty:
            row["d5_mfe_pct"] = pct(d5.high_price.max(), entry_price); row["d5_mae_pct"] = pct(d5.low_price.min(), entry_price)
            row["d5_close_return_pct"] = pct(d5.iloc[-1].close_price, entry_price)
            for name, level in SWING_TARGETS.items():
                hit = d5[d5.high_price >= entry_price * (1 + level / 100)]
                row[f"{name}_hit"] = not hit.empty; row[f"{name}_first_touch_date"] = None if hit.empty else pd.Timestamp(hit.iloc[0].trade_date).date()
            for name, level in ADVERSE.items():
                hit = d5[d5.low_price <= entry_price * (1 + level / 100)]
                row[f"d5_{name}_hit"] = not hit.empty; row[f"d5_{name}_first_touch_date"] = None if hit.empty else pd.Timestamp(hit.iloc[0].trade_date).date()
            row["d5_a_gt1000_hit"] = bool(row["d5_mae_pct"] < -10.0)
            nifty_start, nifty_end = shared.number(d5.iloc[0].nifty_close), shared.number(d5.iloc[-1].nifty_close)
            row["nifty_d5_return_pct"] = None if not nifty_start or nifty_end is None else pct(nifty_end, nifty_start)
            row["stock_excess_nifty_d5_pct"] = None if row["nifty_d5_return_pct"] is None else row["d5_close_return_pct"] - row["nifty_d5_return_pct"]
        if not h30.empty:
            row["h30_max_high_upside_pct"] = pct(h30.high_price.max(), entry_price)
            row["h30_max_close_upside_pct"] = pct(h30.close_price.max(), entry_price)
            row["h30_mae_pct"] = pct(h30.low_price.min(), entry_price)
            row["h30_end_return_pct"] = pct(h30.iloc[-1].close_price, entry_price)
            row["h30_sessions_to_max_high"] = int(np.argmax(h30.high_price.to_numpy()))
            row["h30_sessions_to_max_close"] = int(np.argmax(h30.close_price.to_numpy()))
            row["h30_time_underwater_sessions"] = int((h30.close_price < entry_price).sum())
            for name, level in H30_TARGETS.items():
                hit = h30[h30.high_price >= entry_price * (1 + level / 100)]
                row[f"{name}_hit"] = not hit.empty; row[f"{name}_first_touch_session"] = None if hit.empty else int(hit.index[0] - h30.index[0])
            for name, level in ADVERSE.items():
                hit = h30[h30.low_price <= entry_price * (1 + level / 100)]
                row[f"h30_{name}_hit"] = not hit.empty; row[f"h30_{name}_first_touch_session"] = None if hit.empty else int(hit.index[0] - h30.index[0])
            row["h30_a_gt1000_hit"] = bool(row["h30_mae_pct"] < -10.0)
            nifty_start, nifty_end = shared.number(h30.iloc[0].nifty_close), shared.number(h30.iloc[-1].nifty_close)
            row["nifty_h30_return_pct"] = None if not nifty_start or nifty_end is None else pct(nifty_end, nifty_start)
            row["stock_excess_nifty_h30_pct"] = None if row["nifty_h30_return_pct"] is None else row["h30_end_return_pct"] - row["nifty_h30_return_pct"]
        row["observation_hash"] = hashlib.sha256(json.dumps(row, sort_keys=True, default=json_default).encode()).hexdigest()
        rows.append(row)
    for row in rows:
        if not row.get("observation_hash"):
            row["observation_hash"] = hashlib.sha256(json.dumps(row, sort_keys=True, default=json_default).encode()).hexdigest()
    result = pd.DataFrame(rows)
    result.to_parquet(fragment, index=False, compression="zstd")
    return {"symbol": symbol, "status": "COMPLETE", "rows": len(result), "complete_paths": int((result.path_status == "COMPLETE").sum()), "fragment": str(fragment)}


def initialise(args: argparse.Namespace) -> Path:
    run_id = args.run_id or str(uuid.uuid4())
    out = OUTPUT_ROOT / run_id
    (out / "fragments").mkdir(parents=True, exist_ok=True)
    features_path = out / "daily_feature_snapshot.parquet"
    if not features_path.exists():
        frame = load_inputs(args.start, args.end)
        frame.to_parquet(features_path, index=False, compression="zstd")
    else: frame = pd.read_parquet(features_path)
    mapping = minute_map()
    symbols = sorted(frame.symbol.unique())
    resolved = {symbol: str(minute_for_symbol(symbol, mapping)) if minute_for_symbol(symbol, mapping) else None for symbol in symbols}
    manifest = {
        "run_id": run_id, "created_at": utcnow(), "status": "INITIALISED", "study_mode": "ALL_SIGNAL_DIAGNOSTIC_NOT_PORTFOLIO_RETURN",
        "requested_start": args.start, "requested_end": args.end, "ofactor_floor": 0, "xfactor_floor": 1,
        "universe_symbols": len(symbols), "minute_sources_resolved": sum(value is not None for value in resolved.values()),
        "minute_sources_missing": [key for key, value in resolved.items() if value is None],
        "excluded_symbols": ["TMPV_DEMERGER"], "feature_rows_with_warmup": len(frame),
        "formula_version": shared.FORMULA_VERSION, "entry_semantics": "next valid session open",
        "outcome_semantics": "independent path ladders; no early exit; not realised P&L",
    }
    dump(out / "manifest.json", manifest); dump(out / "minute_mapping.json", resolved)
    (OUTPUT_ROOT / "CURRENT_RUN").write_text(run_id + "\n")
    print(json.dumps({"run_id": run_id, "output": str(out), "symbols": len(symbols), "resolved": manifest["minute_sources_resolved"]}, indent=2))
    return out


def current(args: argparse.Namespace) -> Path:
    run_id = args.run_id or (OUTPUT_ROOT / "CURRENT_RUN").read_text().strip()
    path = OUTPUT_ROOT / run_id
    if not path.exists(): raise SystemExit(f"run not found: {path}")
    return path


def run(args: argparse.Namespace) -> None:
    out = initialise(args) if args.new else current(args)
    manifest = json.loads((out / "manifest.json").read_text())
    frame = pd.read_parquet(out / "daily_feature_snapshot.parquet")
    mapping = json.loads((out / "minute_mapping.json").read_text())
    groups = [(symbol, group.copy(), mapping.get(symbol), str(args.start), str(args.end), str(out / "fragments")) for symbol, group in frame.groupby("symbol", sort=True)]
    if args.symbol:
        groups = [item for item in groups if item[0] == args.symbol.upper()]
    manifest.update({"status": "RUNNING", "started_at": utcnow(), "workers": args.workers}); dump(out / "manifest.json", manifest)
    results: list[dict[str, Any]] = []
    started = time.monotonic()
    with ProcessPoolExecutor(max_workers=args.workers) as pool:
        futures = {pool.submit(analyse_symbol, item): item[0] for item in groups}
        for completed, future in enumerate(as_completed(futures), 1):
            result = future.result(); results.append(result)
            print(f"[{completed}/{len(groups)}] {result['symbol']} rows={result['rows']} status={result['status']} elapsed={time.monotonic()-started:.1f}s", flush=True)
    existing = pd.DataFrame(results)
    status_path = out / "symbol_status.csv"
    if status_path.exists(): existing = pd.concat([pd.read_csv(status_path), existing], ignore_index=True).drop_duplicates("symbol", keep="last")
    existing.sort_values("symbol").to_csv(status_path, index=False)
    manifest.update({"status": "SYMBOLS_COMPLETE", "symbols_complete": int(existing.symbol.nunique()), "rows": int(existing.rows.sum()), "updated_at": utcnow()}); dump(out / "manifest.json", manifest)


def consolidate(args: argparse.Namespace) -> None:
    out = current(args); fragments = sorted((out / "fragments").glob("*.parquet"))
    if not fragments: raise SystemExit("no completed fragments")
    # Per-symbol checkpoints can infer Arrow ``null`` for columns that are
    # wholly absent in a newly listed stock. Pandas performs the required safe
    # nullable union before one authoritative schema is frozen.
    frame = pd.concat((pd.read_parquet(path) for path in fragments), ignore_index=True, sort=False)
    frame = frame.sort_values(["signal_date", "symbol"]).reset_index(drop=True)
    table = pa.Table.from_pandas(frame, preserve_index=False)
    master_parquet = out / "OIIS_ALL_SIGNAL_MASTER.parquet"
    pq.write_table(table, master_parquet, compression="zstd", row_group_size=100_000)
    master_csv = out / "OIIS_ALL_SIGNAL_MASTER.csv.gz"
    with gzip.open(master_csv, "wt", encoding="utf-8", newline="") as handle:
        frame.to_csv(handle, index=False)
    summary = frame.groupby(["nifty_primary_trend", "stock_primary_trend", "vix_regime"], dropna=False).agg(
        observations=("symbol", "size"), symbols=("symbol", "nunique"), complete_paths=("path_status", lambda s: int((s == "COMPLETE").sum())),
        median_ofactor_long=("ofactor_long", "median"), median_xfactor=("xfactor_score", "median"),
        i030_rate_pct=("i030_hit", lambda s: 100 * s.fillna(False).mean()), s100_rate_pct=("s100_hit", lambda s: 100 * s.fillna(False).mean()),
        h30_500_rate_pct=("h30_500_hit", lambda s: 100 * s.fillna(False).mean()), median_h30_upside_pct=("h30_max_high_upside_pct", "median"),
        median_h30_mae_pct=("h30_mae_pct", "median"), median_excess_nifty_h30_pct=("stock_excess_nifty_h30_pct", "median"),
    ).reset_index()
    summary.to_csv(out / "OIIS_ALL_SIGNAL_REGIME_SUMMARY.csv", index=False)
    coverage = frame.groupby("path_status").size().rename("rows").reset_index()
    with pd.ExcelWriter(out / "OIIS_ALL_SIGNAL_EXECUTIVE_SUMMARY.xlsx", engine="openpyxl") as writer:
        pd.DataFrame([json.loads((out / "manifest.json").read_text())]).to_excel(writer, "00 Run", index=False)
        coverage.to_excel(writer, "01 Coverage", index=False)
        summary.to_excel(writer, "02 Regime Summary", index=False)
        frame.groupby("symbol").agg(observations=("symbol", "size"), complete_paths=("path_status", lambda s: int((s == "COMPLETE").sum())), median_o=("ofactor_long", "median"), median_x=("xfactor_score", "median"), i030_rate=("i030_hit", "mean"), s100_rate=("s100_hit", "mean"), h30_500_rate=("h30_500_hit", "mean"), median_h30_upside=("h30_max_high_upside_pct", "median"), median_h30_mae=("h30_mae_pct", "median")).reset_index().to_excel(writer, "03 Symbol Summary", index=False)
        pd.DataFrame({"column": frame.columns, "description": ["See implementation guide; one row per completed signal date and symbol." for _ in frame.columns]}).to_excel(writer, "04 Data Dictionary", index=False)
    manifest = json.loads((out / "manifest.json").read_text())
    manifest.update({"status": "CONSOLIDATED", "consolidated_at": utcnow(), "rows": len(frame), "columns": len(frame.columns), "symbols": frame.symbol.nunique(), "date_min": str(frame.signal_date.min()), "date_max": str(frame.signal_date.max()), "artifacts": {p.name: {"bytes": p.stat().st_size, "sha256": hashlib.sha256(p.read_bytes()).hexdigest()} for p in [master_parquet, master_csv, out / "OIIS_ALL_SIGNAL_EXECUTIVE_SUMMARY.xlsx"]}})
    dump(out / "manifest.json", manifest)
    print(json.dumps({"rows": len(frame), "columns": len(frame.columns), "symbols": frame.symbol.nunique(), "output": str(out)}, indent=2))


def ensure_partitions(conn, start: date, end: date) -> None:
    conn.execute(MIGRATION.read_text())
    cursor = date(start.year, start.month, 1)
    while cursor <= end:
        next_month = date(cursor.year + (cursor.month == 12), 1 if cursor.month == 12 else cursor.month + 1, 1)
        conn.execute(f"CREATE TABLE IF NOT EXISTS oiis_research.all_signal_observation_{cursor:%Y%m} PARTITION OF oiis_research.all_signal_observation FOR VALUES FROM ('{cursor}') TO ('{next_month}')")
        cursor = next_month


def clean(value: Any) -> Any:
    return None if value is None or (not isinstance(value, (list, dict, str)) and pd.isna(value)) else value


def load_db(args: argparse.Namespace) -> None:
    out = current(args); frame = pd.read_parquet(out / "OIIS_ALL_SIGNAL_MASTER.parquet")
    manifest = json.loads((out / "manifest.json").read_text()); run_id = manifest["run_id"]
    columns = [
        "run_id", "signal_date", "symbol", "sector", "entry_date", "entry_ts", "path_status", "selected_direction", "decision_code",
        "ofactor_long", "ofactor_short", "directional_edge", "xfactor_score", "close_price", "entry_price", "rsi_14", "willr_14", "ema_61",
        "close_vs_ema61_pct", "bb_lower_20_2", "bb_mid_20", "bb_upper_20_2", "bb_position", "fast_k_14", "slow_k_3", "volume",
        "volume_sma_20", "volume_ema_20", "volume_ema_60", "macd_line_12_26", "macd_signal_9", "macd_histogram", "nifty_close",
        "nifty_primary_trend", "stock_primary_trend", "vix_regime", "intraday_mfe_pct", "intraday_mae_pct", "d5_mfe_pct", "d5_mae_pct",
        "h30_max_high_upside_pct", "h30_max_close_upside_pct", "h30_mae_pct", "nifty_d5_return_pct", "nifty_h30_return_pct",
        "stock_excess_nifty_d5_pct", "stock_excess_nifty_h30_pct", "ofactor_long_components", "ofactor_short_components", "xfactor_components",
        "gate_results", "indicator_payload", "outcome_payload", "observation_hash",
    ]
    with connect() as conn:
        ensure_partitions(conn, date.fromisoformat(str(manifest["requested_start"])), date.fromisoformat(str(manifest["requested_end"])))
        conn.execute("""INSERT INTO oiis_research.all_signal_run(run_id,status,requested_start,requested_end,ofactor_min,xfactor_min,universe_size,row_count,config_json)
                        VALUES (%s,'LOADING',%s,%s,0,1,%s,%s,%s::jsonb)
                        ON CONFLICT(run_id) DO UPDATE SET status='LOADING',row_count=excluded.row_count,config_json=excluded.config_json""",
                     (run_id, manifest["requested_start"], manifest["requested_end"], manifest["symbols"], len(frame), json.dumps(manifest)))
        conn.execute("DELETE FROM oiis_research.all_signal_observation WHERE run_id=%s", (run_id,))
        statement = f"COPY oiis_research.all_signal_observation ({','.join(columns)}) FROM STDIN"
        with conn.cursor().copy(statement) as copy:
            for row in frame.to_dict("records"):
                ol = {name: {"score": clean(row.get(f"o_long_{name}")), "weighted_contribution": clean(row.get(f"o_long_{name}_weighted"))} for name in O_COMPONENTS}
                oscore = {name: {"score": clean(row.get(f"o_short_{name}")), "weighted_contribution": clean(row.get(f"o_short_{name}_weighted"))} for name in O_COMPONENTS}
                selected = "x_long" if row.get("selected_direction") == "LONG" else "x_short"
                xscore = {name: {"score": clean(row.get(f"{selected}_{name}")), "weighted_contribution": clean(row.get(f"{selected}_{name}_weighted"))} for name in X_COMPONENTS}
                indicators = {key: clean(row.get(key)) for key in frame.columns if key.startswith(("bb_", "volume_", "macd_", "crude_", "dow_", "gold_", "india_vix_", "usd_inr_")) or key in {"rsi_14", "willr_14", "ema_61", "fast_k_14", "slow_k_3"}}
                outcomes = {key: clean(row.get(key)) for key in frame.columns if key.startswith(("i030_", "i050_", "i070_", "s100_", "s200_", "s500_", "intraday_", "d5_", "h30_", "nifty_", "stock_excess_"))}
                values = [run_id, *[clean(row.get(key)) for key in columns[1:47]], json.dumps(ol), json.dumps(oscore), json.dumps(xscore), json.dumps(str(row.get("hard_gates", "")).split("|") if row.get("hard_gates") else []), json.dumps(indicators, default=json_default), json.dumps(outcomes, default=json_default), row["observation_hash"]]
                if len(values) != len(columns):
                    raise RuntimeError(f"COPY row has {len(values)} values for {len(columns)} columns")
                copy.write_row(values)
        conn.execute("UPDATE oiis_research.all_signal_run SET status='COMPLETED',completed_at=now(),artifact_manifest_json=%s::jsonb WHERE run_id=%s", (json.dumps(manifest), run_id))
    manifest.update({"status": "COMPLETED", "postgres_table": "oiis_research.all_signal_observation", "postgres_latest_view": "oiis_research.all_signal_latest", "loaded_at": utcnow()}); dump(out / "manifest.json", manifest)
    print(json.dumps({"run_id": run_id, "rows_loaded": len(frame), "table": "oiis_research.all_signal_observation"}, indent=2))


def status(args: argparse.Namespace) -> None:
    out = current(args); manifest = json.loads((out / "manifest.json").read_text())
    fragments = list((out / "fragments").glob("*.parquet"))
    rows = sum(pq.read_metadata(path).num_rows for path in fragments)
    print(json.dumps({**manifest, "fragments_complete": len(fragments), "fragment_rows": rows, "output": str(out)}, indent=2, default=json_default))


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(); sub = root.add_subparsers(dest="command", required=True)
    for name in ("init", "run", "consolidate", "load-db", "status"):
        command = sub.add_parser(name); command.add_argument("--run-id"); command.add_argument("--start", type=date.fromisoformat, default=date(2023, 1, 1)); command.add_argument("--end", type=date.fromisoformat, default=date.today())
        if name == "run": command.add_argument("--workers", type=int, default=12); command.add_argument("--symbol"); command.add_argument("--new", action="store_true")
    return root


def main() -> None:
    args = parser().parse_args()
    {"init": initialise, "run": run, "consolidate": consolidate, "load-db": load_db, "status": status}[args.command](args)


if __name__ == "__main__": main()
