#!/usr/bin/env python3
"""Safely import regular-session NIFTY minute CSVs and technical features."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from datetime import date, time
from pathlib import Path
from typing import Any

import pandas as pd

from nifty_stratlab.data.postgres import _psycopg
from nifty_stratlab.features.technical import attach_daily_oversold_setup, compute_technical_features

IST = "Asia/Kolkata"
UTC = "UTC"
REQUIRED = {"date", "open", "high", "low", "close", "volume"}
SYMBOL_ALIASES = {"MM": "M&M", "TATAMOTORS": "TMPV"}


def arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--csv-dir", required=True, type=Path)
    parser.add_argument("--symbols", nargs="*", help="Optional explicit symbols; default is every CSV in the directory.")
    parser.add_argument("--start", type=date.fromisoformat)
    parser.add_argument("--end", type=date.fromisoformat)
    parser.add_argument("--dsn-env", default="TRADING_DATABASE_URL")
    parser.add_argument("--migration", type=Path, default=Path(__file__).resolve().parents[1] / "db/migrations/007_csv_minute_history.sql")
    parser.add_argument("--report", type=Path, default=Path("outputs/csv_minute_import_report.json"))
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--force", action="store_true", help="Recalculate a completed file; raw conflicts remain untouched.")
    parser.add_argument("--continue-on-error", action="store_true")
    return parser.parse_args()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def load_and_qualify(path: Path, symbol: str, start: date | None, end: date | None) -> tuple[pd.DataFrame, dict[str, Any]]:
    frame = pd.read_csv(path)
    missing = sorted(REQUIRED - set(frame.columns))
    if missing:
        raise ValueError(f"missing columns: {', '.join(missing)}")
    source_rows = len(frame)
    timestamps = pd.to_datetime(frame["date"], errors="coerce")
    invalid_timestamp = timestamps.isna()
    if invalid_timestamp.any():
        raise ValueError(f"{int(invalid_timestamp.sum())} unparseable timestamps")
    frame["event_ts"] = timestamps.dt.tz_localize(IST).dt.tz_convert(UTC)
    local = frame["event_ts"].dt.tz_convert(IST)
    session_time = local.dt.time
    # Do not reject weekends blindly: NSE has held special Saturday sessions
    # (for example Union Budget trading). The authoritative qualification here
    # is a valid IST regular-session timestamp present in the source file.
    accepted = (session_time >= time(9, 15)) & (session_time <= time(15, 29))
    if start:
        accepted &= local.dt.date >= start
    if end:
        accepted &= local.dt.date <= end
    frame = frame.loc[accepted, ["event_ts", "open", "high", "low", "close", "volume"]].copy()
    for column in ("open", "high", "low", "close", "volume"):
        frame[column] = pd.to_numeric(frame[column], errors="coerce")
    valid = frame[["open", "high", "low", "close", "volume"]].notna().all(axis=1)
    valid &= (frame[["open", "high", "low", "close"]] > 0).all(axis=1) & (frame["volume"] >= 0)
    valid &= frame["high"] >= frame[["open", "low", "close"]].max(axis=1)
    valid &= frame["low"] <= frame[["open", "high", "close"]].min(axis=1)
    invalid_ohlcv = int((~valid).sum())
    frame = frame.loc[valid].sort_values("event_ts", kind="mergesort")
    duplicate_rows = int(frame["event_ts"].duplicated(keep="last").sum())
    frame = frame.drop_duplicates("event_ts", keep="last").reset_index(drop=True)
    if frame.empty:
        raise ValueError("no valid regular-session rows after filtering")
    frame["symbol"] = symbol
    frame["instrument_id"] = f"NSE:{symbol}"
    frame["available_at"] = frame["event_ts"] + pd.to_timedelta(1, unit="min")
    diagnostics = {
        "source_rows": source_rows,
        "accepted_rows": len(frame),
        "rejected_rows": source_rows - len(frame),
        "invalid_ohlcv_rows": invalid_ohlcv,
        "duplicate_timestamp_rows": duplicate_rows,
        "minimum_ts": frame["event_ts"].min().isoformat(),
        "maximum_ts": frame["event_ts"].max().isoformat(),
        "timezone": IST,
        "session_filter": "09:15-15:29 IST; special weekend sessions retained",
    }
    return frame, diagnostics


def resolve_token(cur, symbol: str) -> str:
    lookup_symbol = SYMBOL_ALIASES.get(symbol, symbol)
    cur.execute(
        """
        SELECT symbol_token
        FROM public.instrument_universe
        WHERE exchange='NSE'
          AND UPPER(REGEXP_REPLACE(TRIM(tradingsymbol), '-EQ$', ''))=%s
        ORDER BY (active_to IS NULL) DESC, active_from DESC NULLS LAST, symbol_token
        LIMIT 1
        """,
        (lookup_symbol,),
    )
    row = cur.fetchone()
    if not row:
        cur.execute(
            """
            SELECT symbol_token
            FROM public.instruments
            WHERE exchange='NSE'
              AND UPPER(REGEXP_REPLACE(TRIM(tradingsymbol), '-EQ$', ''))=%s
            ORDER BY updated_at DESC NULLS LAST, symbol_token
            LIMIT 1
            """,
            (lookup_symbol,),
        )
        row = cur.fetchone()
    if not row:
        raise ValueError(f"no NSE instrument token for {symbol} (lookup={lookup_symbol})")
    return str(row[0])


def already_completed(cur, path: Path, checksum: str, start: date | None, end: date | None) -> bool:
    cur.execute(
        """SELECT 1 FROM catalog.csv_minute_import
           WHERE source_path=%s AND source_sha256=%s AND status='COMPLETED'
             AND requested_start IS NOT DISTINCT FROM %s
             AND requested_end IS NOT DISTINCT FROM %s""",
        (str(path.resolve()), checksum, start, end),
    )
    return cur.fetchone() is not None


def import_one(conn, path: Path, symbol: str, checksum: str, frame: pd.DataFrame, diagnostics: dict[str, Any], dry_run: bool, start: date | None, end: date | None, force: bool) -> dict[str, Any]:
    with conn.cursor() as cur:
        token = resolve_token(cur, symbol)
        if dry_run:
            return {**diagnostics, "symbol": symbol, "symbol_token": token, "status": "DRY_RUN"}
        if force:
            cur.execute(
                """UPDATE catalog.csv_minute_import SET status='SUPERSEDED',finished_at=now()
                   WHERE source_path=%s AND source_sha256=%s AND status='COMPLETED'
                     AND requested_start IS NOT DISTINCT FROM %s
                     AND requested_end IS NOT DISTINCT FROM %s""",
                (str(path.resolve()), checksum, start, end),
            )
        cur.execute(
            """INSERT INTO catalog.csv_minute_import
               (source_path,symbol,symbol_token,source_sha256,source_bytes,status,requested_start,requested_end,
                source_rows,accepted_rows,rejected_rows,minimum_ts,maximum_ts,details)
               VALUES (%s,%s,%s,%s,%s,'RUNNING',%s,%s,%s,%s,%s,%s,%s,%s::jsonb) RETURNING import_id""",
            (str(path.resolve()), symbol, token, checksum, path.stat().st_size, start, end, diagnostics["source_rows"],
             diagnostics["accepted_rows"], diagnostics["rejected_rows"], diagnostics["minimum_ts"],
             diagnostics["maximum_ts"], json.dumps(diagnostics)),
        )
        import_id = cur.fetchone()[0]
        featured = attach_daily_oversold_setup(compute_technical_features(frame))
        featured["session_date"] = featured["event_ts"].dt.tz_convert(IST).dt.date
        featured["minute_of_session"] = (
            (featured["event_ts"].dt.tz_convert(IST).dt.hour * 60 + featured["event_ts"].dt.tz_convert(IST).dt.minute) - 555 + 1
        )
        cur.execute("CREATE TEMP TABLE csv_bar_stage (LIKE public.bars_1m INCLUDING DEFAULTS) ON COMMIT DROP")
        with cur.copy("COPY csv_bar_stage (ts,exchange,symbol_token,open,high,low,close,volume,source) FROM STDIN") as copy:
            for row in featured.itertuples(index=False):
                copy.write_row((row.event_ts.to_pydatetime(), "NSE", token, row.open, row.high, row.low, row.close, int(row.volume), "csv_history_ist"))
        cur.execute(
            """INSERT INTO public.bars_1m (ts,exchange,symbol_token,open,high,low,close,volume,source)
               SELECT ts,exchange,symbol_token,open,high,low,close,volume,source FROM csv_bar_stage
               ON CONFLICT (ts,exchange,symbol_token) DO NOTHING"""
        )
        raw_inserted = cur.rowcount
        cur.execute("""CREATE TEMP TABLE csv_feature_stage (
            ts timestamptz, exchange text, symbol_token text, symbol text, session_date date, minute_of_session integer,
            rsi_14 numeric, willr_14 numeric, sma20 numeric, sma50 numeric, bollinger_lower_20_2 numeric,
            macd_line numeric, macd_signal numeric, macd_hist numeric, prior_completed_daily_rsi numeric,
            prior_daily_rsi_previous numeric, prior_daily_close numeric, source_sha256 text
        ) ON COMMIT DROP""")
        columns = ("rsi_14", "willr_14", "sma20", "sma50", "bollinger_lower_20_2", "macd_line", "macd_signal", "macd_hist", "setup_rsi", "setup_rsi_prev1", "setup_close")
        with cur.copy("COPY csv_feature_stage FROM STDIN") as copy:
            for row in featured.itertuples(index=False):
                values = [None if pd.isna(getattr(row, name)) else float(getattr(row, name)) for name in columns]
                copy.write_row((row.event_ts.to_pydatetime(), "NSE", token, symbol, row.session_date, int(row.minute_of_session), *values, checksum))
        cur.execute("""INSERT INTO research.security_minute_technical
            SELECT *, now() FROM csv_feature_stage
            ON CONFLICT (ts,exchange,symbol_token) DO UPDATE SET
              symbol=excluded.symbol, session_date=excluded.session_date, minute_of_session=excluded.minute_of_session,
              rsi_14=excluded.rsi_14, willr_14=excluded.willr_14, sma20=excluded.sma20, sma50=excluded.sma50,
              bollinger_lower_20_2=excluded.bollinger_lower_20_2, macd_line=excluded.macd_line,
              macd_signal=excluded.macd_signal, macd_hist=excluded.macd_hist,
              prior_completed_daily_rsi=excluded.prior_completed_daily_rsi,
              prior_daily_rsi_previous=excluded.prior_daily_rsi_previous,
              prior_daily_close=excluded.prior_daily_close, source_sha256=excluded.source_sha256, calculated_at=now()""")
        feature_upserted = cur.rowcount
        cur.execute(
            """UPDATE catalog.csv_minute_import SET status='COMPLETED',raw_inserted_rows=%s,
               feature_upserted_rows=%s,finished_at=now() WHERE import_id=%s""",
            (raw_inserted, feature_upserted, import_id),
        )
    return {**diagnostics, "symbol": symbol, "symbol_token": token, "status": "COMPLETED", "raw_inserted_rows": raw_inserted, "feature_upserted_rows": feature_upserted}


def main() -> int:
    args = arguments()
    if not args.csv_dir.is_dir():
        raise FileNotFoundError(args.csv_dir)
    dsn = os.getenv(args.dsn_env)
    if not dsn:
        raise ValueError(f"{args.dsn_env} is not set")
    symbols = [s.upper() for s in args.symbols] if args.symbols else sorted(p.stem.upper() for p in args.csv_dir.glob("*.csv"))
    psycopg, _ = _psycopg()
    results: list[dict[str, Any]] = []
    with psycopg.connect(dsn, autocommit=False) as conn:
        if not args.dry_run:
            conn.execute(args.migration.read_text(encoding="utf-8"))
            conn.commit()
        for symbol in symbols:
            path = args.csv_dir / f"{symbol}.csv"
            try:
                checksum = sha256(path)
                if not args.dry_run and not args.force:
                    with conn.cursor() as cur:
                        if already_completed(cur, path, checksum, args.start, args.end):
                            results.append({"symbol": symbol, "status": "SKIPPED_ALREADY_COMPLETED"})
                            continue
                frame, diagnostics = load_and_qualify(path, symbol, args.start, args.end)
                result = import_one(conn, path, symbol, checksum, frame, diagnostics, args.dry_run, args.start, args.end, args.force)
                conn.commit()
                results.append(result)
                print(json.dumps(result, default=str))
            except Exception as exc:
                conn.rollback()
                failed = {"symbol": symbol, "status": "FAILED", "error": str(exc)}
                results.append(failed)
                print(json.dumps(failed))
                if not args.continue_on_error:
                    break
    report = {"csv_dir": str(args.csv_dir.resolve()), "dry_run": args.dry_run, "results": results}
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2, default=str) + "\n", encoding="utf-8")
    return 1 if any(row["status"] == "FAILED" for row in results) else 0


if __name__ == "__main__":
    raise SystemExit(main())
