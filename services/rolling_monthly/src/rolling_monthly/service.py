from __future__ import annotations

import hashlib
import json
import math
import os
import uuid
import calendar
from datetime import date, timedelta
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pandas as pd
import psycopg

from .engine import (
    LONG_BASE,
    LONG_DERIVED,
    SHORT_BASE,
    SHORT_DERIVED,
    MarketContext,
    coverage_reasons,
    prepare_series,
    scanner_checks,
    score_candidate,
)
from .absolute_month import STRATEGY_VERSION as ABSOLUTE_MONTH_VERSION
from .absolute_month import evaluate_absolute_months
from .absolute_first_session import STRATEGY_VERSION as ABSOLUTE_FIRST_SESSION_VERSION
from .absolute_first_session import evaluate_absolute_first_sessions
from .rolling_window import STRATEGY_VERSION as ROLLING_WINDOW_VERSION
from .rolling_window import evaluate_rolling_windows


FACTOR_ID = "rolling_monthly_technical_quality_factor_v2"
FACTOR_VERSION = "2.1.0-research"


def load_config(path: str | Path | None = None) -> tuple[dict[str, Any], str]:
    config_path = Path(path or os.getenv("ROLLING_MONTHLY_CONFIG", "/app/config/factor_v2.json"))
    if not config_path.exists():
        config_path = Path(__file__).resolve().parents[2] / "config" / "factor_v2.json"
    raw = config_path.read_bytes()
    value = json.loads(raw)
    if value.get("factor_id") != FACTOR_ID or value.get("version") != FACTOR_VERSION:
        raise ValueError("Rolling Monthly factor identity/version mismatch")
    return value, hashlib.sha256(raw).hexdigest()


def _clean(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(key): _clean(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_clean(item) for item in value]
    if isinstance(value, (bool, str, int)) or value is None:
        return value
    if hasattr(value, "item"):
        return _clean(value.item())
    if isinstance(value, float):
        return value if math.isfinite(value) else None
    return str(value)


def _json(value: Any) -> str:
    return json.dumps(_clean(value), separators=(",", ":"), allow_nan=False)


def fetch_frames(conn: psycopg.Connection) -> tuple[pd.DataFrame, set[str], set[str], dict[str, str]]:
    fno = {row[0] for row in conn.execute("""
        SELECT symbol FROM public.instrument_profiles
        WHERE is_nse_fno OR is_nifty_largemidcap_250
        ORDER BY symbol
    """).fetchall()}
    nifty50 = {row[0] for row in conn.execute("""
        SELECT symbol FROM market_status.effective_universe_member
        WHERE index_symbol='NIFTY50' AND effective_to IS NULL
    """).fetchall()}
    sectors = {str(row[0]): str(row[1]) for row in conn.execute("""
        SELECT DISTINCT ON (symbol) symbol,sector_name
        FROM nse_intraday.universe_membership
        WHERE sector_name IS NOT NULL AND btrim(sector_name)<>''
        ORDER BY symbol,effective_from DESC,updated_at DESC
    """).fetchall()}
    yahoo_universe = [f"{symbol}.NS" for symbol in fno]
    if "LTM" in fno:
        yahoo_universe.append("LTIM.NS")
    rows = conn.execute("""
        WITH yahoo AS (
          SELECT r.trade_date,r.open_price AS open,r.high_price AS high,r.low_price AS low,
            r.close_price AS close,r.volume::double precision AS volume,
            CASE WHEN regexp_replace(r.yahoo_symbol,'\\.NS$','')='LTIM' THEN 'LTM'
              ELSE regexp_replace(r.yahoo_symbol,'\\.NS$','') END AS symbol,0 AS priority
          FROM strategy_eval.stock_daily_regime r
          WHERE r.trade_date>=current_date-interval '1300 days' AND r.data_source='yfinance'
            AND r.yahoo_symbol=ANY(%s)
        ), official AS (
          SELECT e.trade_date,e.open_price,e.high_price,e.low_price,e.close_price,
            e.total_traded_qty::double precision,
            CASE WHEN e.symbol='LTIM' THEN 'LTM' ELSE e.symbol END,1
          FROM nse.fact_eod_prices e WHERE e.series='EQ'
            AND e.trade_date>=current_date-interval '1300 days'
            AND CASE WHEN e.symbol='LTIM' THEN 'LTM' ELSE e.symbol END=ANY(%s)
        ), rest AS (
          SELECT b.trade_date,b.open,b.high,b.low,b.close,b.volume::double precision,
            CASE WHEN i.name='LTIM' THEN 'LTM' ELSE i.name END,2
          FROM public.bars_1d b JOIN public.instruments i
            ON i.exchange=b.exchange AND i.symbol_token=b.symbol_token
          WHERE b.exchange='NSE' AND b.trade_date>=current_date-interval '1300 days'
            AND (CASE WHEN i.name='LTIM' THEN 'LTM' ELSE i.name END=ANY(%s)
              OR i.name IN ('NIFTY','INDIA VIX'))
        ), combined AS (SELECT * FROM yahoo UNION ALL SELECT * FROM official UNION ALL SELECT * FROM rest)
        SELECT DISTINCT ON(symbol,trade_date) trade_date,open,high,low,close,volume,symbol
        FROM combined ORDER BY symbol,trade_date,priority
    """, (yahoo_universe, list(fno), list(fno))).fetchall()
    frame = pd.DataFrame(rows, columns=["trade_date", "open", "high", "low", "close", "volume", "symbol"])
    return frame, fno, nifty50, sectors


def last_tuesday(year: int, month: int) -> date:
    value = date(year, month, calendar.monthrange(year, month)[1])
    while value.weekday() != 1:
        value -= timedelta(days=1)
    return value


def prepare_run_inputs(conn: psycopg.Connection) -> tuple[
    set[str], set[str], dict[str, str], list[pd.Timestamp], dict[str, pd.DataFrame], list[pd.Timestamp]
]:
    raw, governed_universe, nifty50, sectors = fetch_frames(conn)
    if raw.empty:
        raise RuntimeError("No canonical daily bars are available")
    raw.trade_date = pd.to_datetime(raw.trade_date)
    reference_sessions = sorted(raw.loc[raw.symbol.eq("NIFTY"), "trade_date"].drop_duplicates())
    if not reference_sessions:
        raise RuntimeError("NIFTY reference sessions are unavailable")
    prepared = {symbol: prepare_series(group, reference_sessions) for symbol, group in raw.groupby("symbol")}
    dates = sorted(raw.trade_date.drop_duplicates())
    if len(dates) < 2:
        raise RuntimeError("At least two trading sessions are required")
    return governed_universe, nifty50, sectors, reference_sessions, prepared, dates


def build_run(
    conn: psycopg.Connection,
    config: dict[str, Any],
    config_hash: str,
    scheduled_signal_date: date | None = None,
    preloaded_inputs: tuple[
        set[str], set[str], dict[str, str], list[pd.Timestamp], dict[str, pd.DataFrame], list[pd.Timestamp]
    ] | None = None,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    fno_universe, nifty50, sectors, reference_sessions, prepared, dates = preloaded_inputs or prepare_run_inputs(conn)
    if scheduled_signal_date is None:
        signal_date, entry_date = dates[-2], dates[-1]
    else:
        eligible = [value for value in dates if value.date() <= scheduled_signal_date]
        if not eligible:
            raise RuntimeError(f"No trading session exists on or before {scheduled_signal_date}")
        signal_date = eligible[-1]
        if signal_date.year != scheduled_signal_date.year or signal_date.month != scheduled_signal_date.month:
            raise RuntimeError(f"Expiry session is unavailable for {scheduled_signal_date:%Y-%m}")
        future = [value for value in dates if value > signal_date]
        if not future:
            raise RuntimeError(f"Next-session entry is unavailable after {signal_date.date()}")
        entry_date = future[0]
    relevant_start = (signal_date.to_period("M") - 2).start_time.date()
    calendar_sessions = {
        pd.Timestamp(row[0])
        for row in conn.execute(
            """SELECT trade_date FROM market_status.exchange_session_calendar
               WHERE is_trading_day AND trade_date BETWEEN %s AND %s""",
            (relevant_start, entry_date.date()),
        ).fetchall()
    }
    reference_relevant = {
        value.normalize()
        for value in reference_sessions
        if relevant_start <= value.date() <= entry_date.date()
    }
    calendar_missing_sessions = sorted(reference_relevant - calendar_sessions)
    nifty = prepared.get("NIFTY")
    vix = prepared.get("INDIA VIX")
    if nifty is None or vix is None:
        raise RuntimeError("NIFTY or India VIX canonical daily series is missing")
    nifty_row = nifty[nifty.trade_date.eq(signal_date)]
    vix_row = vix[vix.trade_date.eq(signal_date)]
    if nifty_row.empty or vix_row.empty:
        raise RuntimeError("Market context does not cover the signal date")
    nr, vr = nifty_row.iloc[0], vix_row.iloc[0]
    previous_vix = vix.loc[vix.trade_date.lt(signal_date)].tail(1)
    vix_change = None if previous_vix.empty else 100 * (float(vr.close) / float(previous_vix.iloc[0].close) - 1)

    advances = declines = coverage = 0
    for symbol in nifty50:
        series = prepared.get(symbol)
        if series is None:
            continue
        point = series[series.trade_date.eq(signal_date)]
        if point.empty or not pd.notna(point.iloc[0].previous_open):
            continue
        coverage += 1
        prior_close = series.loc[series.trade_date.lt(signal_date), "close"].tail(1)
        if prior_close.empty:
            continue
        change = float(point.iloc[0].close) - float(prior_close.iloc[0])
        advances += int(change > 0)
        declines += int(change < 0)
    context = MarketContext(vix_change, nr.plus_di14, nr.minus_di14, advances, declines, coverage)

    scanner_rows: dict[str, list[tuple[str, pd.Series]]] = {"LONG": [], "SHORT": []}
    incomplete_inputs: dict[str, list[str]] = {}
    for symbol in sorted(fno_universe):
        series = prepared.get(symbol)
        if series is None:
            continue
        point = series[series.trade_date.eq(signal_date)]
        if point.empty:
            incomplete_inputs[symbol] = ["SIGNAL_SESSION_MISSING"]
            continue
        row = point.iloc[0]
        missing = coverage_reasons(row)
        signal_missing = [reason for reason in missing if reason != "NEXT_SESSION_MISSING"]
        if missing:
            incomplete_inputs[symbol] = missing
        if signal_missing:
            continue
        for side in ("LONG", "SHORT"):
            if all(scanner_checks(row, side)):
                scanner_rows[side].append((symbol, row))

    candidates: list[dict[str, Any]] = []
    universe_size = len(fno_universe)
    for side in ("LONG", "SHORT"):
        same_side_count = len(scanner_rows[side])
        for symbol, row in scanner_rows[side]:
            scored = score_candidate(row, side, context, same_side_count, universe_size, config)
            primary_target = float(row.next_open) * (1.05 if side == "LONG" else 0.95)
            stop = float(row.next_open) * (0.98 if side == "LONG" else 1.02)
            candidates.append({
                # Stable across daemon refreshes for the same governed signal.
                "candidate_id": str(uuid.uuid5(
                    uuid.NAMESPACE_URL,
                    f"{FACTOR_ID}:{FACTOR_VERSION}:{signal_date.date()}:{side}:{symbol}",
                )),
                "base_strategy_id": LONG_BASE if side == "LONG" else SHORT_BASE,
                "derived_strategy_id": LONG_DERIVED if side == "LONG" else SHORT_DERIVED,
                "symbol": symbol,
                "sector": sectors.get(symbol),
                "side": side,
                "signal_date": signal_date.date(),
                "entry_date": entry_date.date(),
                "signal_close": float(row.close),
                "entry_price": float(row.next_open),
                "primary_target_price": primary_target,
                "stop_price": stop,
                "universe_size": universe_size,
                "same_side_occurrence_count": same_side_count,
                **scored,
                "scanner_evidence": {
                    "m1_open": row.m1_open, "m1_close": row.m1_close, "m2_open": row.m2_open,
                    "m1_monthly_ema9": row.m1_ema9,
                    "m1_close_above_monthly_ema9": bool(row.m1_close > row.m1_ema9) if math.isfinite(float(row.m1_ema9)) else None,
                    "m1_candle_above_monthly_ema9_pct": row.m1_candle_above_ema9_pct,
                    "w0_open": row.w0_open, "w0_close_asof_t": row.close, "w1_open": row.w1_open,
                    "d0_open": row.open, "d0_close": row.close, "d1_open": row.previous_open,
                    "checks": scanner_checks(row, side),
                },
                "data_quality": {
                    "status": "VALID" if coverage == 50 and not calendar_missing_sessions else "DEGRADED",
                    "source": "public.bars_1d+public.instruments+market_status.effective_universe_member",
                    "nifty50_coverage": coverage,
                    "expected_nifty50": 50,
                    "calendar_missing_sessions": [str(value.date()) for value in calendar_missing_sessions],
                    "limitations": [
                        "CURRENT_FNO_MEMBERSHIP",
                        "CASH_UNDERLYING_PROXY_FOR_SHORT",
                        *(["EXCHANGE_CALENDAR_INCOMPLETE_RECOVERED_FROM_NIFTY_BARS"] if calendar_missing_sessions else []),
                    ],
                },
            })
    band_order = {"HIGH": 0, "MEDIUM": 1, "LOW": 2, "INCOMPLETE": 3}
    for side in ("LONG", "SHORT"):
        ordered = sorted((c for c in candidates if c["side"] == side), key=lambda c: (band_order[c["quality_band"]], -c["quality_score"], c["symbol"]))
        for rank, candidate in enumerate(ordered, 1):
            candidate["rank"] = rank
    quality_status = (
        "VALID"
        if coverage == 50 and not calendar_missing_sessions and not incomplete_inputs
        else "DEGRADED"
    )
    run = {
        "run_id": str(uuid.uuid4()),
        "signal_date": signal_date.date(),
        "entry_date": entry_date.date(),
        "source_max_date": dates[-1].date(),
        "universe_size": universe_size,
        "nifty50_coverage": coverage,
        "quality_status": quality_status,
        "long_scanner_count": len(scanner_rows["LONG"]),
        "short_scanner_count": len(scanner_rows["SHORT"]),
        "high_count": sum(c["quality_band"] == "HIGH" for c in candidates),
        "medium_count": sum(c["quality_band"] == "MEDIUM" for c in candidates),
        "low_count": sum(c["quality_band"] == "LOW" for c in candidates),
        "metrics": {
            "vix_change_pct": vix_change,
            "nifty50_advances": advances,
            "nifty50_declines": declines,
            "nifty50_coverage": coverage,
            "strategy_model": "CONFIRMED_CLOSE_NEXT_SESSION_OPEN",
            "signal_information_cutoff": "SIGNAL_SESSION_CLOSE",
            "entry_price_source": "NEXT_VALID_SESSION_OPEN",
            "live_candidate_population": "ALL_COMPLETE_SCANNER_SIGNALS",
            "historical_evaluation_population": "MATURED_HORIZONS_ONLY",
            "calendar_source": "market_status.exchange_session_calendar+NIFTY_REFERENCE_BARS",
            "calendar_missing_sessions": [str(value.date()) for value in calendar_missing_sessions],
            "incomplete_input_symbol_count": len(incomplete_inputs),
            "incomplete_input_symbols": incomplete_inputs,
        },
    }
    return run, candidates


def persist(conn: psycopg.Connection, run: dict[str, Any], candidates: list[dict[str, Any]], config: dict[str, Any], config_hash: str, update_heartbeat: bool = True) -> str:
    existing = conn.execute("SELECT run_id FROM rolling_monthly.run WHERE signal_date=%s AND factor_version=%s", (run["signal_date"], FACTOR_VERSION)).fetchone()
    run_id = str(existing[0]) if existing else run["run_id"]
    conn.execute("""INSERT INTO rolling_monthly.run(
        run_id,signal_date,entry_date,factor_version,configuration_hash,universe_size,nifty50_coverage,
        source_max_date,data_as_of,status,quality_status,long_scanner_count,short_scanner_count,
        high_count,medium_count,low_count,completed_at,metrics)
        VALUES(%s,%s,%s,%s,%s,%s,%s,%s,now(),'COMPLETED',%s,%s,%s,%s,%s,%s,now(),%s::jsonb)
        ON CONFLICT(signal_date,factor_version) DO UPDATE SET
          entry_date=excluded.entry_date,configuration_hash=excluded.configuration_hash,
          universe_size=excluded.universe_size,nifty50_coverage=excluded.nifty50_coverage,
          source_max_date=excluded.source_max_date,data_as_of=excluded.data_as_of,status='COMPLETED',
          quality_status=excluded.quality_status,long_scanner_count=excluded.long_scanner_count,
          short_scanner_count=excluded.short_scanner_count,high_count=excluded.high_count,
          medium_count=excluded.medium_count,low_count=excluded.low_count,completed_at=now(),metrics=excluded.metrics""",
        (run_id,run["signal_date"],run["entry_date"],FACTOR_VERSION,config_hash,run["universe_size"],run["nifty50_coverage"],run["source_max_date"],run["quality_status"],run["long_scanner_count"],run["short_scanner_count"],run["high_count"],run["medium_count"],run["low_count"],_json(run["metrics"])))
    conn.execute("DELETE FROM rolling_monthly.candidate WHERE run_id=%s", (run_id,))
    for c in candidates:
        conn.execute("""INSERT INTO rolling_monthly.candidate(
          candidate_id,run_id,base_strategy_id,derived_strategy_id,quality_factor_id,quality_factor_version,
          symbol,sector,side,signal_date,entry_date,signal_close,entry_price,primary_target_price,stop_price,
          universe_size,same_side_occurrence_count,quality_band,quality_score,mandatory_gate_pass,
          confirmation_count,entry_eligible,entry_rejection_reason,deployment_action,rank,scanner_evidence,
          component_snapshot,quality_reasons,data_quality)
          VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb,%s::jsonb,%s::jsonb,%s::jsonb)""",
          (c["candidate_id"],run_id,c["base_strategy_id"],c["derived_strategy_id"],FACTOR_ID,FACTOR_VERSION,
           c["symbol"],c["sector"],c["side"],c["signal_date"],c["entry_date"],c["signal_close"],c["entry_price"],
           c["primary_target_price"],c["stop_price"],c["universe_size"],c["same_side_occurrence_count"],
           c["quality_band"],c["quality_score"],c["mandatory_gate_pass"],c["confirmation_count"],c["entry_eligible"],
           c["entry_rejection_reason"],c["deployment_action"],c["rank"],_json(c["scanner_evidence"]),
           _json({"components":c["components"],"values":c["values"]}),_json(c["reasons"]),_json(c["data_quality"])))
    for side,strategy,base,segment in (("LONG",LONG_DERIVED,LONG_BASE,"CASH"),("SHORT",SHORT_DERIVED,SHORT_BASE,"FUTURES")):
        conn.execute("""INSERT INTO rolling_monthly.strategy_version(strategy_id,version,side,base_strategy_id,scanner_segment,configuration,configuration_hash)
          VALUES(%s,%s,%s,%s,%s,%s::jsonb,%s) ON CONFLICT(strategy_id,version) DO UPDATE SET configuration=excluded.configuration,configuration_hash=excluded.configuration_hash""",
          (strategy,FACTOR_VERSION,side,base,segment,_json(config),config_hash))
    if update_heartbeat:
        conn.execute("""INSERT INTO rolling_monthly.service_heartbeat(service_name,status,last_seen_at,last_successful_run_id,details)
          VALUES('rolling-monthly-runner','HEALTHY',now(),%s,%s::jsonb)
          ON CONFLICT(service_name) DO UPDATE SET status='HEALTHY',last_seen_at=now(),last_successful_run_id=excluded.last_successful_run_id,details=excluded.details""",
          (run_id,_json({"signal_date":run["signal_date"],"candidate_count":len(candidates)})))
    conn.commit()
    return run_id


def execute(database_url: str, config_path: str | None = None) -> dict[str, Any]:
    config, config_hash = load_config(config_path)
    with psycopg.connect(database_url) as conn:
        run, candidates = build_run(conn, config, config_hash)
        run_id = persist(conn, run, candidates, config, config_hash)
    return {"run_id": run_id, "signal_date": str(run["signal_date"]), "entry_date": str(run["entry_date"]), "candidate_count": len(candidates), "high": run["high_count"], "medium": run["medium_count"], "quality_status": run["quality_status"]}


def execute_expiry_history(database_url: str, months: int = 6, config_path: str | None = None) -> list[dict[str, Any]]:
    config, config_hash = load_config(config_path)
    today = datetime.now(timezone.utc).date()
    cursor = date(today.year, today.month, 1)
    expiries: list[date] = []
    while len(expiries) < max(1, months):
        expiry = last_tuesday(cursor.year, cursor.month)
        if expiry < today:
            expiries.append(expiry)
        cursor = (cursor - timedelta(days=1)).replace(day=1)
    results: list[dict[str, Any]] = []
    with psycopg.connect(database_url) as conn:
        # The canonical daily frame is immutable during one backfill. Loading it
        # once avoids repeating the same multi-source query for every month.
        preloaded_inputs = prepare_run_inputs(conn)
        for scheduled in reversed(expiries):
            run, candidates = build_run(conn, config, config_hash, scheduled, preloaded_inputs)
            run_id = persist(conn, run, candidates, config, config_hash, update_heartbeat=False)
            conn.execute("""INSERT INTO rolling_monthly.expiry_run(
              expiry_month,scheduled_expiry_date,signal_date,entry_date,run_id,status,data_as_of)
              VALUES(%s,%s,%s,%s,%s,'COMPLETED',now())
              ON CONFLICT(expiry_month) DO UPDATE SET scheduled_expiry_date=excluded.scheduled_expiry_date,
                signal_date=excluded.signal_date,entry_date=excluded.entry_date,run_id=excluded.run_id,
                status='COMPLETED',data_as_of=now(),error_excerpt=NULL""",
              (scheduled.replace(day=1), scheduled, run["signal_date"], run["entry_date"], run_id))
            conn.commit()
            results.append({"expiry_month": str(scheduled.replace(day=1)), "scheduled_expiry_date": str(scheduled), "signal_date": str(run["signal_date"]), "entry_date": str(run["entry_date"]), "run_id": run_id, "candidate_count": len(candidates)})
    return results


def _absolute_month_frame(
    conn: psycopg.Connection,
    first_evaluation_month: date,
) -> tuple[pd.DataFrame, set[str], dict[str, str], list[date], date]:
    # Eleven completed months are required so the earliest evaluated month has
    # a genuine nine-month EMA. The strategy universe is the explicit union of
    # NSE F&O and NIFTY LargeMidcap 250 profiles, not an NFO-only proxy.
    lookback_start = (pd.Timestamp(first_evaluation_month).to_period("M") - 11).start_time.date()
    universe_rows = conn.execute("""
        SELECT symbol FROM public.instrument_profiles
        WHERE is_nse_fno OR is_nifty_largemidcap_250
        ORDER BY symbol
    """).fetchall()
    universe = {str(row[0]) for row in universe_rows}
    yahoo_universe = [f"{symbol}.NS" for symbol in universe]
    if "LTM" in universe:
        yahoo_universe.append("LTIM.NS")
    sectors = {str(row[0]): str(row[1]) for row in conn.execute("""
        SELECT symbol,sector FROM public.instrument_profiles
        WHERE is_nse_fno OR is_nifty_largemidcap_250
    """).fetchall()}
    rows = conn.execute("""
        WITH yahoo AS (
          SELECT r.trade_date,
            CASE WHEN regexp_replace(r.yahoo_symbol,'\\.NS$','')='LTIM' THEN 'LTM'
                 ELSE regexp_replace(r.yahoo_symbol,'\\.NS$','') END AS symbol,
            COALESCE(p.company_name,r.stock_name) AS company_name,
            r.open_price,r.high_price,r.low_price,r.close_price,r.volume,
            'YAHOO_FINANCE_SPLIT_ADJUSTED_OHLC'::text AS source,0::int AS source_priority
          FROM strategy_eval.stock_daily_regime r
          LEFT JOIN public.instrument_profiles p ON p.symbol=CASE
            WHEN regexp_replace(r.yahoo_symbol,'\\.NS$','')='LTIM' THEN 'LTM'
            ELSE regexp_replace(r.yahoo_symbol,'\\.NS$','') END
          WHERE r.trade_date >= %s AND r.data_source='yfinance'
            AND r.yahoo_symbol = ANY(%s)
        ), official AS (
          SELECT e.trade_date,
            CASE WHEN e.symbol='LTIM' THEN 'LTM' ELSE e.symbol END AS symbol,
            COALESCE(p.company_name,CASE WHEN e.symbol='LTIM' THEN 'LTM' ELSE e.symbol END) AS company_name,
            e.open_price,e.high_price,e.low_price,e.close_price,e.total_traded_qty,
            'NSE_EOD_BHAVCOPY'::text AS source,1::int AS source_priority
          FROM nse.fact_eod_prices e
          LEFT JOIN public.instrument_profiles p ON p.symbol=CASE WHEN e.symbol='LTIM' THEN 'LTM' ELSE e.symbol END
          WHERE e.series='EQ' AND e.trade_date >= %s
            AND CASE WHEN e.symbol='LTIM' THEN 'LTM' ELSE e.symbol END = ANY(%s)
        ), rest AS (
          SELECT b.trade_date,
            CASE WHEN i.name='LTIM' THEN 'LTM' ELSE i.name END AS symbol,
            COALESCE(p.company_name,CASE WHEN i.name='LTIM' THEN 'LTM' ELSE i.name END) AS company_name,
            b.open,b.high,b.low,b.close,b.volume,
            'SMARTAPI_REST_DAILY'::text AS source,2::int AS source_priority
          FROM public.bars_1d b
          JOIN public.instruments i ON i.exchange=b.exchange AND i.symbol_token=b.symbol_token
          LEFT JOIN public.instrument_profiles p ON p.symbol=CASE WHEN i.name='LTIM' THEN 'LTM' ELSE i.name END
          WHERE b.exchange='NSE' AND b.trade_date >= %s
            AND CASE WHEN i.name='LTIM' THEN 'LTM' ELSE i.name END = ANY(%s)
        )
        SELECT trade_date,symbol,company_name,open_price,high_price,low_price,close_price,volume,source,source_priority
        FROM yahoo
        UNION ALL
        SELECT trade_date,symbol,company_name,open_price,high_price,low_price,close_price,total_traded_qty,source,source_priority
        FROM official
        UNION ALL
        SELECT trade_date,symbol,company_name,open,high,low,close,volume,source,source_priority FROM rest
        ORDER BY symbol,trade_date,source_priority
    """, (lookback_start, yahoo_universe, lookback_start, list(universe), lookback_start, list(universe))).fetchall()
    frame = pd.DataFrame(rows, columns=[
        "trade_date", "symbol", "company_name", "open", "high", "low", "close", "volume", "source", "source_priority"
    ])
    session_rows = conn.execute("""
        SELECT DISTINCT trade_date FROM public.bars_1d b
        JOIN public.instruments i ON i.exchange=b.exchange AND i.symbol_token=b.symbol_token
        WHERE b.exchange='NSE' AND i.name='NIFTY' AND b.trade_date >= %s
        ORDER BY trade_date
    """, (lookback_start,)).fetchall()
    sessions = [row[0] for row in session_rows]
    if not sessions:
        session_rows = conn.execute("""
          SELECT trade_date FROM market_status.exchange_session_calendar
          WHERE is_trading_day AND trade_date >= %s ORDER BY trade_date
        """, (lookback_start,)).fetchall()
        sessions = [row[0] for row in session_rows]
    if frame.empty or not sessions:
        raise RuntimeError("Absolute Monthly canonical daily inputs are unavailable")
    return frame, universe, sectors, sessions, max(pd.Timestamp(value) for value in frame.trade_date).date()


def _persist_absolute_months(
    conn: psycopg.Connection,
    runs: list[dict[str, Any]],
    candidates: list[dict[str, Any]],
) -> None:
    by_run: dict[str, list[dict[str, Any]]] = {}
    for candidate in candidates:
        by_run.setdefault(candidate["run_id"], []).append(candidate)
    for run in runs:
        conn.execute("""INSERT INTO rolling_monthly.absolute_month_run(
          run_id,evaluation_month,strategy_version,status,maturity_state,universe_size,
          evaluated_symbol_count,qualified_count,incomplete_symbol_count,source_start_date,
          source_end_date,data_as_of,methodology,quality_metrics)
          VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,now(),%s::jsonb,%s::jsonb)
          ON CONFLICT(evaluation_month,strategy_version) DO UPDATE SET
            status=excluded.status,maturity_state=excluded.maturity_state,
            universe_size=excluded.universe_size,evaluated_symbol_count=excluded.evaluated_symbol_count,
            qualified_count=excluded.qualified_count,incomplete_symbol_count=excluded.incomplete_symbol_count,
            source_start_date=excluded.source_start_date,source_end_date=excluded.source_end_date,
            data_as_of=now(),methodology=excluded.methodology,quality_metrics=excluded.quality_metrics,
            error_excerpt=NULL,updated_at=now()""", (
            run["run_id"], run["evaluation_month"], run["strategy_version"], run["status"],
            run["maturity_state"], run["universe_size"], run["evaluated_symbol_count"],
            run["qualified_count"], run["incomplete_symbol_count"], run["source_start_date"],
            run["source_end_date"], _json(run["methodology"]), _json(run["quality_metrics"]),
        ))
        conn.execute("DELETE FROM rolling_monthly.absolute_month_candidate WHERE run_id=%s", (run["run_id"],))
        for candidate in by_run.get(run["run_id"], []):
            conn.execute("""INSERT INTO rolling_monthly.absolute_month_candidate(
              candidate_id,run_id,strategy_version,evaluation_month,symbol,company_name,sector,
              signal_date,entry_date,entry_price,evaluation_end_date,evaluation_status,
              observed_post_entry_sessions,month_two_open,month_two_close,month_one_open,month_one_close,
              monthly_ema9,monthly_close_above_ema9,monthly_candle_above_ema9_pct,
              current_week_open,current_week_close_asof,previous_week_open,previous_week_close,
              previous_day_open,previous_day_close,signal_day_open,signal_day_close,conditions,
              path_end_price,end_return_pct,max_profit_price,max_profit_pct,max_profit_date,
              max_drawdown_price,max_drawdown_pct,max_drawdown_date,profit_per_share,
              max_profit_per_share,max_drawdown_per_share,source_provenance,data_quality)
              VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,
                %s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb,%s::jsonb)""", (
                candidate["candidate_id"], candidate["run_id"], candidate["strategy_version"],
                candidate["evaluation_month"], candidate["symbol"], candidate["company_name"], candidate["sector"],
                candidate["signal_date"], candidate["entry_date"], candidate["entry_price"],
                candidate["evaluation_end_date"], candidate["evaluation_status"], candidate["observed_post_entry_sessions"],
                candidate["month_two_open"], candidate["month_two_close"], candidate["month_one_open"],
                candidate["month_one_close"], candidate["monthly_ema9"], candidate["monthly_close_above_ema9"],
                candidate["monthly_candle_above_ema9_pct"], candidate["current_week_open"], candidate["current_week_close_asof"],
                candidate["previous_week_open"], candidate["previous_week_close"], candidate["previous_day_open"],
                candidate["previous_day_close"], candidate["signal_day_open"], candidate["signal_day_close"],
                _json(candidate["conditions"]), candidate["path_end_price"], candidate["end_return_pct"],
                candidate["max_profit_price"], candidate["max_profit_pct"], candidate["max_profit_date"],
                candidate["max_drawdown_price"], candidate["max_drawdown_pct"], candidate["max_drawdown_date"],
                candidate["profit_per_share"], candidate["max_profit_per_share"], candidate["max_drawdown_per_share"],
                _json(candidate["source_provenance"]), _json(candidate["data_quality"]),
            ))
    conn.commit()


def execute_absolute_months(database_url: str, months: int = 36) -> dict[str, Any]:
    today = datetime.now(timezone.utc).date()
    last_month = pd.Timestamp(today).to_period("M")
    first_month = last_month - max(0, months - 1)
    with psycopg.connect(database_url) as conn:
        frame, universe, sectors, sessions, source_end = _absolute_month_frame(conn, first_month.start_time.date())
        result = evaluate_absolute_months(
            frame, universe, sectors, sessions, str(first_month), str(last_month), source_end
        )
        _persist_absolute_months(conn, result.runs, result.candidates)
    latest = result.runs[-1]
    return {
        "strategy_version": ABSOLUTE_MONTH_VERSION,
        "months": len(result.runs),
        "candidate_count": len(result.candidates),
        "latest_month": str(latest["evaluation_month"]),
        "latest_candidates": latest["qualified_count"],
        "source_end_date": str(source_end),
        "universe_size": len(universe),
    }


def _persist_absolute_first_sessions(
    conn: psycopg.Connection,
    runs: list[dict[str, Any]],
    candidates: list[dict[str, Any]],
) -> None:
    by_run: dict[str, list[dict[str, Any]]] = {}
    for candidate in candidates:
        by_run.setdefault(candidate["run_id"], []).append(candidate)
    candidate_columns = [
        "candidate_id", "run_id", "strategy_version", "evaluation_month", "symbol", "company_name", "sector",
        "gap_threshold_pct", "first_session_date", "previous_session_date", "previous_close", "first_session_open",
        "opening_gap_pct", "entry_mode", "entry_status", "entry_date", "entry_price", "evaluation_end_date",
        "evaluation_status", "observed_sessions", "month_two_open", "month_two_close", "month_one_open",
        "month_one_close", "monthly_ema9", "monthly_close_above_ema9", "monthly_candle_above_ema9_pct",
        "anchor_day_open", "anchor_vs_previous_week_open_pct", "completed_week_open", "completed_week_close", "prior_week_open", "prior_week_close",
        "conditions", "path_end_price", "end_return_pct", "max_profit_price", "max_profit_pct", "max_profit_date",
        "max_drawdown_price", "max_drawdown_pct", "max_drawdown_date", "profit_per_share", "max_profit_per_share",
        "max_drawdown_per_share", "quantity_10000", "invested_10000", "end_pnl_10000", "max_profit_10000",
        "max_drawdown_10000", "source_provenance", "data_quality",
    ]
    json_columns = {"conditions", "source_provenance", "data_quality"}
    placeholders = ",".join("%s::jsonb" if column in json_columns else "%s" for column in candidate_columns)
    insert_candidate = (
        f"INSERT INTO rolling_monthly.absolute_first_session_candidate({','.join(candidate_columns)}) "
        f"VALUES({placeholders})"
    )
    for run in runs:
        conn.execute("""INSERT INTO rolling_monthly.absolute_first_session_run(
          run_id,evaluation_month,strategy_version,status,maturity_state,universe_size,
          evaluated_symbol_count,eligible_setup_count,scenario_count,entered_scenario_count,
          incomplete_symbol_count,source_start_date,source_end_date,data_as_of,methodology,quality_metrics)
          VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,now(),%s::jsonb,%s::jsonb)
          ON CONFLICT(evaluation_month,strategy_version) DO UPDATE SET
            status=excluded.status,maturity_state=excluded.maturity_state,universe_size=excluded.universe_size,
            evaluated_symbol_count=excluded.evaluated_symbol_count,eligible_setup_count=excluded.eligible_setup_count,
            scenario_count=excluded.scenario_count,entered_scenario_count=excluded.entered_scenario_count,
            incomplete_symbol_count=excluded.incomplete_symbol_count,source_start_date=excluded.source_start_date,
            source_end_date=excluded.source_end_date,data_as_of=now(),methodology=excluded.methodology,
            quality_metrics=excluded.quality_metrics,error_excerpt=NULL,updated_at=now()""", (
            run["run_id"], run["evaluation_month"], run["strategy_version"], run["status"], run["maturity_state"],
            run["universe_size"], run["evaluated_symbol_count"], run["eligible_setup_count"], run["scenario_count"],
            run["entered_scenario_count"], run["incomplete_symbol_count"], run["source_start_date"],
            run["source_end_date"], _json(run["methodology"]), _json(run["quality_metrics"]),
        ))
        conn.execute("DELETE FROM rolling_monthly.absolute_first_session_candidate WHERE run_id=%s", (run["run_id"],))
        for candidate in by_run.get(run["run_id"], []):
            values = [_json(candidate[column]) if column in json_columns else candidate[column] for column in candidate_columns]
            conn.execute(insert_candidate, values)
    conn.commit()


def execute_absolute_first_sessions(database_url: str, months: int = 36) -> dict[str, Any]:
    today = datetime.now(timezone.utc).date()
    last_month = pd.Timestamp(today).to_period("M")
    first_month = last_month - max(0, months - 1)
    with psycopg.connect(database_url) as conn:
        frame, universe, sectors, sessions, source_end = _absolute_month_frame(conn, first_month.start_time.date())
        result = evaluate_absolute_first_sessions(
            frame, universe, sectors, sessions, str(first_month), str(last_month), source_end
        )
        _persist_absolute_first_sessions(conn, result.runs, result.candidates)
    latest = result.runs[-1]
    return {
        "strategy_version": ABSOLUTE_FIRST_SESSION_VERSION,
        "months": len(result.runs),
        "scenario_count": len(result.candidates),
        "latest_month": str(latest["evaluation_month"]),
        "latest_setups": latest["eligible_setup_count"],
        "latest_entered_scenarios": latest["entered_scenario_count"],
        "source_end_date": str(source_end),
        "universe_size": len(universe),
    }


def execute_rolling_windows(database_url: str, years: int = 3) -> dict[str, Any]:
    start = (pd.Timestamp(datetime.now(timezone.utc).date()) - pd.DateOffset(years=years, months=3)).date()
    with psycopg.connect(database_url) as conn:
        frame, universe, _sectors, _sessions, source_end = _absolute_month_frame(conn, start)
        result = evaluate_rolling_windows(frame, universe, source_end, years)
        conn.execute("DELETE FROM rolling_monthly.rolling_window_candidate WHERE strategy_version=%s", (ROLLING_WINDOW_VERSION,))
        columns = [
            "candidate_id", "strategy_version", "symbol", "signal_date", "entry_date", "entry_price", "signal_close",
            "older_block_open", "older_block_close", "recent_block_open", "prior_week_open", "current_week_open",
            "previous_day_open", "signal_day_open", "path_end_date", "path_end_price", "observed_sessions",
            "evaluation_status", "end_return_pct", "max_profit_pct", "max_drawdown_pct", "max_profit_date",
            "max_drawdown_date", "profit_per_share", "quantity_10000", "pnl_10000", "max_profit_10000",
            "max_drawdown_10000", "hit_1_pct", "hit_3_pct", "hit_5_pct", "conditions", "signal_source",
        ]
        placeholders = ",".join("%s::jsonb" if name == "conditions" else "%s" for name in columns)
        sql = f"INSERT INTO rolling_monthly.rolling_window_candidate({','.join(columns)}) VALUES({placeholders})"
        for candidate in result.candidates:
            conn.execute(sql, [_json(candidate[name]) if name == "conditions" else candidate[name] for name in columns])
        conn.execute("DELETE FROM rolling_monthly.rolling_window_evaluation WHERE strategy_version=%s", (ROLLING_WINDOW_VERSION,))
        evaluation_columns = [
            "evaluation_id", "strategy_version", "symbol", "signal_date", "selection_status",
            "selected_candidate_id", "evaluated_condition_count", "passed_condition_count",
            "failed_condition_codes", "conditions", "rejection_reasons", "factor_values", "data_quality",
        ]
        evaluation_json = {"conditions", "rejection_reasons", "factor_values", "data_quality"}
        evaluation_placeholders = ",".join("%s::jsonb" if name in evaluation_json else "%s" for name in evaluation_columns)
        evaluation_sql = f"INSERT INTO rolling_monthly.rolling_window_evaluation({','.join(evaluation_columns)}) VALUES({evaluation_placeholders})"
        for evaluation in result.evaluations:
            conn.execute(evaluation_sql, [_json(evaluation[name]) if name in evaluation_json else evaluation[name] for name in evaluation_columns])
        conn.execute("""INSERT INTO rolling_monthly.rolling_window_refresh(
          strategy_version,source_end_date,universe_size,candidate_count,refreshed_at)
          VALUES(%s,%s,%s,%s,now())
          ON CONFLICT(strategy_version) DO UPDATE SET source_end_date=excluded.source_end_date,
            universe_size=excluded.universe_size,candidate_count=excluded.candidate_count,refreshed_at=now()""",
          (ROLLING_WINDOW_VERSION, source_end, len(universe), len(result.candidates)))
        conn.commit()
    return {"strategy_version": ROLLING_WINDOW_VERSION, "years": years, "candidate_count": len(result.candidates),
            "evaluation_count": len(result.evaluations), "source_end_date": str(source_end), "universe_size": len(universe)}
