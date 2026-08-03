#!/usr/bin/env python3
import argparse
import csv
import datetime as dt
import json
import math
import pathlib
import subprocess
import sys
from typing import Iterable


ROOT = pathlib.Path(__file__).resolve().parents[1]


def run_psql_copy(sql: str) -> str:
    cmd = [
        "docker",
        "compose",
        "exec",
        "-T",
        "postgres",
        "sh",
        "-lc",
        'PGPASSWORD="$POSTGRES_PASSWORD" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -f -',
    ]
    proc = subprocess.run(
        cmd,
        cwd=ROOT,
        input=sql,
        text=True,
        capture_output=True,
        check=False,
    )
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.strip() or proc.stdout.strip() or "psql export failed")
    return proc.stdout


def resolve_equity_token(symbol: str) -> dict[str, str]:
    sql = f"""
COPY (
  SELECT exchange, symbol_token, tradingsymbol, name
  FROM public.instruments
  WHERE exchange = 'NSE'
    AND (
      tradingsymbol = '{symbol}-EQ'
      OR name = '{symbol}'
    )
  ORDER BY CASE WHEN tradingsymbol = '{symbol}-EQ' THEN 0 ELSE 1 END, tradingsymbol
  LIMIT 1
) TO STDOUT WITH CSV HEADER;
"""
    rows = list(csv.DictReader(run_psql_copy(sql).splitlines()))
    if not rows:
        raise RuntimeError(f"could not resolve NSE equity token for symbol {symbol}")
    return rows[0]


def write_csv(path: pathlib.Path, rows: Iterable[dict], fieldnames: list[str]) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    count = 0
    with path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow(row)
            count += 1
    return count


def parse_num(value: str | None) -> float | None:
    if value is None or value == "":
        return None
    return float(value)


def compute_rsi(closes: list[float], period: int = 14) -> list[float | None]:
    result: list[float | None] = [None] * len(closes)
    if len(closes) <= period:
        return result
    gains = []
    losses = []
    for idx in range(1, period + 1):
        delta = closes[idx] - closes[idx - 1]
        gains.append(max(delta, 0.0))
        losses.append(max(-delta, 0.0))
    avg_gain = sum(gains) / period
    avg_loss = sum(losses) / period
    if avg_loss == 0:
        result[period] = 100.0
    else:
        rs = avg_gain / avg_loss
        result[period] = 100.0 - (100.0 / (1.0 + rs))
    for idx in range(period + 1, len(closes)):
        delta = closes[idx] - closes[idx - 1]
        gain = max(delta, 0.0)
        loss = max(-delta, 0.0)
        avg_gain = ((avg_gain * (period - 1)) + gain) / period
        avg_loss = ((avg_loss * (period - 1)) + loss) / period
        if avg_loss == 0:
            result[idx] = 100.0
        else:
            rs = avg_gain / avg_loss
            result[idx] = 100.0 - (100.0 / (1.0 + rs))
    return result


def compute_willr(highs: list[float], lows: list[float], closes: list[float], period: int = 14) -> list[float | None]:
    result: list[float | None] = [None] * len(closes)
    for idx in range(period - 1, len(closes)):
        window_high = max(highs[idx - period + 1 : idx + 1])
        window_low = min(lows[idx - period + 1 : idx + 1])
        if math.isclose(window_high, window_low):
            result[idx] = 0.0
        else:
            result[idx] = ((window_high - closes[idx]) / (window_high - window_low)) * -100.0
    return result


def export_table(query: str, path: pathlib.Path) -> int:
    output = run_psql_copy(f"COPY ({query}) TO STDOUT WITH CSV HEADER;\n")
    rows = list(csv.DictReader(output.splitlines()))
    if not rows:
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("w", newline="", encoding="utf-8") as fh:
            fh.write("")
        return 0
    return write_csv(path, rows, list(rows[0].keys()))


def main() -> int:
    parser = argparse.ArgumentParser(description="Export symbol CSV bundle from trading-stack Postgres.")
    parser.add_argument("--symbol", default="RELIANCE")
    parser.add_argument("--output-dir", default=str(ROOT / "output" / "exports"))
    args = parser.parse_args()

    symbol = args.symbol.upper()
    resolved = resolve_equity_token(symbol)
    token = resolved["symbol_token"]
    tradingsymbol = resolved["tradingsymbol"]
    stamp = dt.date.today().isoformat()
    out_dir = pathlib.Path(args.output_dir) / f"{symbol.lower()}-{stamp}"
    out_dir.mkdir(parents=True, exist_ok=True)

    bars_sql = f"""
SELECT ts, exchange, symbol_token, open, high, low, close, volume, oi, source, created_at
FROM public.bars_1m
WHERE exchange = 'NSE' AND symbol_token = '{token}'
ORDER BY ts
"""
    bars_rows = list(csv.DictReader(run_psql_copy(f"COPY ({bars_sql}) TO STDOUT WITH CSV HEADER;\n").splitlines()))
    closes = [parse_num(row["close"]) or 0.0 for row in bars_rows]
    highs = [parse_num(row["high"]) or 0.0 for row in bars_rows]
    lows = [parse_num(row["low"]) or 0.0 for row in bars_rows]
    rsi_vals = compute_rsi(closes, 14)
    willr_vals = compute_willr(highs, lows, closes, 14)
    enriched_rows = []
    for idx, row in enumerate(bars_rows):
        enriched = dict(row)
        enriched["rsi_14"] = "" if rsi_vals[idx] is None else f"{rsi_vals[idx]:.6f}"
        enriched["willr_14"] = "" if willr_vals[idx] is None else f"{willr_vals[idx]:.6f}"
        enriched_rows.append(enriched)
    bars_path = out_dir / f"{symbol}_1m_with_rsi_willr.csv"
    bars_count = write_csv(bars_path, enriched_rows, list(enriched_rows[0].keys()) if enriched_rows else [
        "ts", "exchange", "symbol_token", "open", "high", "low", "close", "volume", "oi", "source", "created_at", "rsi_14", "willr_14"
    ])

    quote_count = export_table(
        f"""
SELECT ts, exchange, symbol_token, ltp, open, high, low, close, volume, oi, bid, ask, bid_qty, ask_qty,
       last_trade_qty, exch_feed_time, exch_trade_time, net_change, percent_change, avg_price,
       total_buy_qty, total_sell_qty, upper_circuit, lower_circuit, week52_high, week52_low
FROM public.quote_snapshots
WHERE exchange = 'NSE' AND symbol_token = '{token}'
ORDER BY ts
""",
        out_dir / f"{symbol}_quote_snapshots.csv",
    )

    perf_count = export_table(
        f"""
SELECT ts, index_name, exchange, symbol, symbol_token, last_price, pct_intraday, pct_1d, pct_1w, volume_today, quality_flags
FROM public.symbol_perf_snapshot
WHERE exchange = 'NSE' AND symbol_token = '{token}'
ORDER BY ts
""",
        out_dir / f"{symbol}_symbol_perf_snapshot.csv",
    )

    live_count = export_table(
        f"""
SELECT run_id, exchange, symbol_token, symbol, tradingsymbol, entry_time, entry_close, success, gain_pct, percentile, created_at
FROM public.a02_backtest_live_stream
WHERE exchange = 'NSE' AND symbol_token = '{token}'
ORDER BY entry_time
""",
        out_dir / f"{symbol}_a02_backtest_live_stream.csv",
    )

    manifest = {
        "symbol": symbol,
        "exchange": resolved["exchange"],
        "symbol_token": token,
        "tradingsymbol": tradingsymbol,
        "generated_on": dt.datetime.now(dt.timezone.utc).isoformat(),
        "files": {
            bars_path.name: bars_count,
            f"{symbol}_quote_snapshots.csv": quote_count,
            f"{symbol}_symbol_perf_snapshot.csv": perf_count,
            f"{symbol}_a02_backtest_live_stream.csv": live_count,
        },
    }
    (out_dir / f"{symbol}_bundle_manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    print(json.dumps({"output_dir": str(out_dir), **manifest}, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
