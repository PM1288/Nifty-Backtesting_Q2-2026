#!/usr/bin/env python3
"""Bounded RSI15/Daily40 backtest with a self-contained review report.

The command reads only the explicitly named CSV and date range.  It never scans
directories, places orders, publishes results, or writes to PostgreSQL.
"""
from __future__ import annotations

import argparse
import html
import json
import math
import time as clock
from dataclasses import asdict
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from pathlib import Path
from zoneinfo import ZoneInfo

import pandas as pd

from nifty_stratlab.contracts import ProductType
from nifty_stratlab.costs.engine import ExecutionFriction
from nifty_stratlab.demo.config import demo_fee_registry
from nifty_stratlab.evaluation.metrics import calculate_performance_metrics
from nifty_stratlab.features.technical import _wilder_rsi, attach_prior_completed_daily_rsi, compute_technical_features
from nifty_stratlab.reporting.artifacts import build_artifact_manifest, write_csv, write_json
from nifty_stratlab.simulation.engine import BacktestEngine
from nifty_stratlab.simulation.models import SimulationConfig
from nifty_stratlab.strategy.sdk import StrategyBar, instantiate_strategy, load_manifest
from nifty_stratlab.util.hashing import sha256_file
from nifty_stratlab.util.io import atomic_write_text


IST = ZoneInfo("Asia/Kolkata")


def arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the governed RSI15/Daily40 strategy on one bounded CSV slice.")
    parser.add_argument("--csv", required=True, type=Path, help="Explicit minute CSV (legacy date/OHLCV or canonical fixture format).")
    parser.add_argument("--daily-csv", type=Path, help="Optional explicit daily fixture/source CSV; otherwise daily closes are reduced from minute bars.")
    parser.add_argument("--symbol", required=True)
    parser.add_argument("--start", required=True, type=date.fromisoformat)
    parser.add_argument("--end", required=True, type=date.fromisoformat)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--warmup-days", type=int, default=120)
    parser.add_argument("--initial-cash", type=Decimal, default=Decimal("200000"))
    parser.add_argument("--ticket-size", type=Decimal, default=Decimal("200000"))
    parser.add_argument("--overwrite", action="store_true", help="Allow reuse only when the output directory is empty.")
    return parser.parse_args()


def load_minutes(path: Path, symbol: str, start: date, end: date, warmup_days: int) -> pd.DataFrame:
    if not path.is_file():
        raise FileNotFoundError(path)
    if end < start:
        raise ValueError("end precedes start")
    if warmup_days < 30:
        raise ValueError("warmup-days must be at least 30")
    lower = pd.Timestamp(start - timedelta(days=warmup_days), tz=IST).tz_convert("UTC")
    upper = pd.Timestamp(end + timedelta(days=1), tz=IST).tz_convert("UTC")
    pieces: list[pd.DataFrame] = []
    for chunk in pd.read_csv(path, chunksize=200_000):
        required = {"open", "high", "low", "close", "volume"}
        missing = sorted(required - set(chunk.columns))
        if missing:
            raise ValueError(f"CSV missing columns: {', '.join(missing)}")
        if "event_ts" in chunk:
            timestamps = pd.to_datetime(chunk["event_ts"], errors="coerce", utc=True)
            if "symbol" in chunk:
                chunk = chunk.loc[chunk["symbol"].astype(str).str.upper().eq(symbol.upper())].copy()
                timestamps = timestamps.loc[chunk.index]
        elif "date" in chunk:
            local = pd.to_datetime(chunk["date"], errors="coerce")
            timestamps = local.dt.tz_localize(IST, ambiguous="raise", nonexistent="raise").dt.tz_convert("UTC")
        else:
            raise ValueError("CSV must contain either date or event_ts")
        if timestamps.isna().any():
            raise ValueError("CSV contains unparseable timestamps")
        selected = chunk.loc[(timestamps >= lower) & (timestamps < upper)].copy()
        if selected.empty:
            continue
        selected["event_ts"] = timestamps.loc[selected.index]
        pieces.append(selected)
    if not pieces:
        raise ValueError("no rows in requested range plus warm-up")
    frame = pd.concat(pieces, ignore_index=True)
    local_time = frame["event_ts"].dt.tz_convert(IST).dt.time
    frame = frame.loc[(local_time >= time(9, 15)) & (local_time <= time(15, 29))].copy()
    for column in ("open", "high", "low", "close", "volume"):
        frame[column] = pd.to_numeric(frame[column], errors="coerce")
    if frame[["open", "high", "low", "close", "volume"]].isna().any().any():
        raise ValueError("requested rows contain missing/non-numeric OHLCV")
    invalid = (
        (frame[["open", "high", "low", "close"]] <= 0).any(axis=1)
        | (frame["high"] < frame[["open", "low", "close"]].max(axis=1))
        | (frame["low"] > frame[["open", "high", "close"]].min(axis=1))
        | (frame["volume"] < 0)
    )
    if invalid.any():
        raise ValueError(f"requested rows contain {int(invalid.sum())} invalid OHLCV records")
    if frame["event_ts"].duplicated().any():
        raise ValueError("requested rows contain duplicate timestamps")
    frame["symbol"] = symbol.upper()
    frame["instrument_id"] = f"NSE:{symbol.upper()}"
    frame["available_at"] = frame["event_ts"] + timedelta(minutes=1)
    return frame.sort_values("event_ts", kind="mergesort").reset_index(drop=True)


def attach_external_daily(frame: pd.DataFrame, daily_path: Path, symbol: str) -> pd.DataFrame:
    daily = pd.read_csv(daily_path)
    required = {"trade_date", "close"}
    if not required.issubset(daily):
        raise ValueError("daily CSV must contain trade_date and close")
    if "symbol" in daily:
        daily = daily.loc[daily["symbol"].astype(str).str.upper().eq(symbol.upper())].copy()
    daily["trade_date"] = pd.to_datetime(daily["trade_date"], errors="raise").dt.date
    daily = daily.sort_values("trade_date", kind="mergesort").reset_index(drop=True)
    daily["daily_rsi"] = _wilder_rsi(pd.to_numeric(daily["close"], errors="raise"), 14)
    sessions = frame["event_ts"].dt.tz_convert(IST).dt.date
    mapping: dict[date, float] = {}
    for session in sorted(set(sessions)):
        candidates = daily.loc[daily["trade_date"] < session, "daily_rsi"].dropna()
        if not candidates.empty:
            mapping[session] = float(candidates.iloc[-1])
    result = frame.copy()
    result["session_date"] = sessions
    result["daily_rsi_14_prior"] = result["session_date"].map(mapping)
    return result


def strategy_bars(featured: pd.DataFrame, start: date, end: date) -> list[StrategyBar]:
    sessions = featured["event_ts"].dt.tz_convert(IST).dt.date
    selected = featured.loc[(sessions >= start) & (sessions <= end)].copy()
    base = {"symbol", "instrument_id", "event_ts", "available_at", "open", "high", "low", "close", "volume"}
    bars: list[StrategyBar] = []
    for row in selected.to_dict(orient="records"):
        features = {key: (None if pd.isna(value) else value) for key, value in row.items() if key not in base}
        bars.append(StrategyBar(
            symbol=row["symbol"], instrument_id=row["instrument_id"],
            event_ts=pd.Timestamp(row["event_ts"]).to_pydatetime(),
            available_at=pd.Timestamp(row["available_at"]).to_pydatetime(), interval="1m",
            open=float(row["open"]), high=float(row["high"]), low=float(row["low"]),
            close=float(row["close"]), volume=int(row["volume"]), features=features,
        ))
    if not bars:
        raise ValueError("no regular-session bars in evaluation range")
    return bars


def line_svg(values: list[float], title: str, colour: str, *, baseline: float | None = None) -> str:
    width, height, pad = 1000, 300, 45
    if not values:
        return f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}"><text x="20" y="40">No data: {html.escape(title)}</text></svg>'
    low, high = min(values), max(values)
    if math.isclose(low, high):
        low -= 1
        high += 1
    points = []
    for index, value in enumerate(values):
        x = pad + index * (width - 2 * pad) / max(1, len(values) - 1)
        y = height - pad - (value - low) * (height - 2 * pad) / (high - low)
        points.append(f"{x:.1f},{y:.1f}")
    axis = ""
    if baseline is not None and low <= baseline <= high:
        y = height - pad - (baseline - low) * (height - 2 * pad) / (high - low)
        axis = f'<line x1="{pad}" y1="{y:.1f}" x2="{width-pad}" y2="{y:.1f}" stroke="#94a3b8" stroke-dasharray="5 5"/>'
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}">'
        f'<rect width="100%" height="100%" fill="#fff"/><text x="{pad}" y="25" font-family="sans-serif" font-weight="700">{html.escape(title)}</text>'
        f'{axis}<polyline fill="none" stroke="{colour}" stroke-width="2.5" points="{" ".join(points)}"/>'
        f'<text x="{pad}" y="{height-10}" font-family="sans-serif" font-size="12">min {low:,.2f}</text>'
        f'<text x="{width-pad-120}" y="{height-10}" font-family="sans-serif" font-size="12">max {high:,.2f}</text></svg>'
    )


def pnl_svg(values: list[float]) -> str:
    width, height, pad = 1000, 300, 45
    if not values:
        return line_svg([], "Net P&L by trade", "#2563eb")
    extent = max(1.0, max(abs(x) for x in values))
    zero = height / 2
    bar_width = max(2, (width - 2 * pad) / len(values) * .75)
    bars = []
    for index, value in enumerate(values):
        x = pad + index * (width - 2 * pad) / len(values)
        bar_height = abs(value) / extent * (height / 2 - pad)
        y = zero - bar_height if value >= 0 else zero
        colour = "#16a34a" if value >= 0 else "#dc2626"
        bars.append(f'<rect x="{x:.1f}" y="{y:.1f}" width="{bar_width:.1f}" height="{bar_height:.1f}" fill="{colour}"/>')
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}"><rect width="100%" height="100%" fill="#fff"/><text x="{pad}" y="25" font-family="sans-serif" font-weight="700">Net P&amp;L by trade</text><line x1="{pad}" y1="{zero}" x2="{width-pad}" y2="{zero}" stroke="#64748b"/>{"".join(bars)}</svg>'


def render_report(summary: dict, trades: list[dict]) -> str:
    metric = summary["metrics"]
    cards = [
        ("Trades", metric["trade_count"]), ("Net P&L", f'₹{float(metric["total_net_pnl"]):,.2f}'),
        ("Win rate", "N/A" if metric["win_rate_pct"] is None else f'{metric["win_rate_pct"]:.2f}%'),
        ("Max drawdown", "N/A" if metric["maximum_drawdown_pct"] is None else f'{metric["maximum_drawdown_pct"]:.3f}%'),
        ("₹500 hit rate", f'{summary["target_500_hit_rate_pct"]:.2f}%'), ("Validation", summary["validation_status"]),
    ]
    card_html = "".join(f'<div class="card"><small>{html.escape(str(k))}</small><strong>{html.escape(str(v))}</strong></div>' for k, v in cards)
    columns = ["symbol", "entry_ts", "exit_ts", "entry_price", "exit_price", "quantity", "exit_reason", "gross_pnl", "total_cost", "net_pnl"]
    rows = "".join("<tr>" + "".join(f'<td>{html.escape(str(row.get(col, "")))}</td>' for col in columns) + "</tr>" for row in trades)
    return f'''<!doctype html><html><head><meta charset="utf-8"><title>RSI15 Daily40 Backtest</title><style>
body{{font-family:Inter,system-ui,sans-serif;background:#f1f5f9;color:#0f172a;margin:0}}main{{max-width:1200px;margin:auto;padding:32px}}h1{{margin-bottom:4px}}.notice{{background:#fff7ed;border-left:5px solid #f97316;padding:14px;margin:20px 0}}.cards{{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}}.card,.panel{{background:white;border-radius:10px;padding:16px;box-shadow:0 1px 3px #cbd5e1}}.card strong{{display:block;font-size:22px;margin-top:6px}}.panel{{margin-top:16px;overflow:auto}}img{{width:100%;min-height:240px}}table{{border-collapse:collapse;width:100%;font-size:13px}}th,td{{padding:8px;border-bottom:1px solid #e2e8f0;text-align:left;white-space:nowrap}}th{{background:#e2e8f0}}code{{background:#e2e8f0;padding:2px 5px}}</style></head><body><main>
<h1>RSI15 / Daily RSI40 Backtest</h1><p>{summary["symbol"]} · {summary["start"]} through {summary["end"]} · generated {summary["finished_at"]}</p>
<div class="notice"><b>Point-in-time rule:</b> daily RSI is from the previous completed session. Entry is completed 1m RSI &lt;15; exit is RSI &gt;70; both fill at the next minute open. Remaining positions signal forced exit at 15:15. ₹500 is evaluation only. Probability: Not calibrated. No broker orders.</div>
<section class="cards">{card_html}</section>
<section class="panel"><img src="equity_curve.svg" alt="Equity curve"></section><section class="panel"><img src="drawdown.svg" alt="Drawdown"></section><section class="panel"><img src="trade_pnl.svg" alt="Trade P and L"></section>
<section class="panel"><h2>Trades</h2><table><thead><tr>{''.join(f'<th>{c}</th>' for c in columns)}</tr></thead><tbody>{rows}</tbody></table></section>
<section class="panel"><h2>Review notes</h2><ul><li>Costs: TEST_ONLY effective-dated intraday schedule plus 2.5 bps slippage per side; broker reconciliation is still required before capital use.</li><li>Artifacts are checksummed; run <code>sha256sum -c checksums.sha256</code> here.</li><li>Zero trades is a valid market result; it is not a runner failure.</li></ul></section>
</main></body></html>'''


def main() -> int:
    args = arguments()
    started_wall = datetime.now(tz=IST)
    started = clock.perf_counter()
    if args.output_dir.exists() and any(args.output_dir.iterdir()):
        raise FileExistsError(f"output directory is not empty: {args.output_dir}")
    args.output_dir.mkdir(parents=True, exist_ok=True)
    package = Path(__file__).resolve().parents[1]

    load_start = clock.perf_counter()
    raw = load_minutes(args.csv, args.symbol, args.start, args.end, args.warmup_days)
    load_seconds = clock.perf_counter() - load_start
    feature_start = clock.perf_counter()
    technical = compute_technical_features(raw)
    featured = attach_external_daily(technical, args.daily_csv, args.symbol) if args.daily_csv else attach_prior_completed_daily_rsi(technical)
    bars = strategy_bars(featured, args.start, args.end)
    feature_seconds = clock.perf_counter() - feature_start

    manifest_path = package / "config/strategies/rsi15_daily40_intraday_v1.yml"
    manifest = load_manifest(manifest_path)
    simulate_start = clock.perf_counter()
    result = BacktestEngine(
        strategy=instantiate_strategy(manifest),
        config=SimulationConfig(
            initial_cash=args.initial_cash, ticket_size=args.ticket_size, max_open_positions=1,
            product=ProductType.EQUITY_INTRADAY, target_net_pnl=Decimal("0"),
            stop_loss_pct=Decimal("99"), max_hold_bars=1_000_000,
            enable_target_exit=False, enable_stop_exit=False,
        ),
        fee_registry=demo_fee_registry(ProductType.EQUITY_INTRADAY),
        friction=ExecutionFriction(entry_slippage_bps=Decimal("2.5"), exit_slippage_bps=Decimal("2.5")),
    ).run(bars)
    simulation_seconds = clock.perf_counter() - simulate_start
    metrics = calculate_performance_metrics(result.trades, result.equity_curve, annualisation_periods=252 * 375)

    trade_rows: list[dict] = []
    for trade in result.trades:
        row = trade.model_dump(mode="json", exclude={"cost", "metadata"})
        row.update(trade.cost.model_dump(mode="json"))
        row["holding_minutes"] = (trade.exit_ts - trade.entry_ts).total_seconds() / 60
        row["reached_500_net_target"] = trade.net_pnl >= Decimal("500")
        row["probability"] = "Not calibrated"
        trade_rows.append(row)
    signal_rows = [signal.model_dump(mode="json") for signal in result.signals]
    equity_rows = [asdict(point) for point in result.equity_curve]
    skipped_rows = [{"signal_id": row.signal.signal_id, "symbol": row.signal.symbol, "reason": row.reason, "details": row.details} for row in result.skipped_signals]

    entries = [s for s in result.signals if s.intent_type == "enter"]
    exits = [s for s in result.signals if s.intent_type == "exit"]
    unique_trade_days = {(t.symbol, t.entry_ts.astimezone(IST).date()) for t in result.trades}
    validation_checks = {
        "no_open_positions": not result.open_positions,
        "entry_values_strict": all(float(s.metadata["minute_rsi_14"]) < 15 and float(s.metadata["prior_daily_rsi_14"]) > 40 for s in entries),
        "exit_values_strict_or_forced": all(float(s.metadata["minute_rsi_14"]) > 70 or "forced_session_exit" in s.reason_codes for s in exits),
        "one_trade_per_symbol_day": len(unique_trade_days) == len(result.trades),
        "next_bar_execution": all(
            any(
                signal.symbol == trade.symbol
                and datetime.fromisoformat(str(signal.metadata["signal_bar_event_ts"])) < trade.entry_ts
                and signal.decision_ts <= trade.entry_ts
                for signal in entries
            )
            for trade in result.trades
        ),
        "forced_exit_latest_fill": all(t.exit_ts.astimezone(IST).time() <= time(15, 20) for t in result.trades if t.exit_reason == "forced_session_exit_next_open"),
        "source_is_explicit": args.csv.is_file(),
        "order_authority_disabled": True,
    }
    validation_status = "PASS" if all(validation_checks.values()) else "FAIL"
    equity_values = [float(p.net_liquidation_equity) for p in result.equity_curve]
    peaks: list[float] = []
    peak = -math.inf
    for value in equity_values:
        peak = max(peak, value)
        peaks.append((value / peak - 1) * 100 if peak else 0)
    net_values = [float(t.net_pnl) for t in result.trades]
    target_rate = (sum(v >= 500 for v in net_values) / len(net_values) * 100) if net_values else 0.0
    finished = datetime.now(tz=IST)
    summary = {
        "run_id": args.output_dir.name, "status": "VALIDATED" if validation_status == "PASS" else "FAILED",
        "validation_status": validation_status, "strategy_version_id": manifest.strategy_version_id,
        "strategy_config_hash": sha256_file(manifest_path), "symbol": args.symbol.upper(),
        "start": args.start, "end": args.end, "started_at": started_wall, "finished_at": finished,
        "source": str(args.csv.resolve()), "source_sha256": sha256_file(args.csv),
        "daily_source": str(args.daily_csv.resolve()) if args.daily_csv else "derived_from_explicit_minute_csv",
        "evaluation_bars": len(bars), "entry_signals": len(entries), "exit_signals": len(exits),
        "executed_trades": len(result.trades), "forced_session_exits": sum(t.exit_reason == "forced_session_exit_next_open" for t in result.trades),
        "target_500_hit_rate_pct": target_rate, "metrics": metrics.to_dict(),
        "fee_profile_id": "TEST_ONLY_EQUITY_INTRADAY_V1", "slippage_bps_per_side": 2.5,
        "probability": "Not calibrated", "order_authority": False,
    }
    timing = {
        "data_load_seconds": round(load_seconds, 6), "feature_compute_seconds": round(feature_seconds, 6),
        "simulation_seconds": round(simulation_seconds, 6), "total_elapsed_seconds": round(clock.perf_counter() - started, 6),
        "processed_bars": len(bars), "bars_per_second": round(len(bars) / max(simulation_seconds, 1e-9), 2), "workers": 1,
    }
    write_json(args.output_dir / "run.json", {"arguments": vars(args), "manifest": str(manifest_path), "safe_bounded_run": True})
    write_json(args.output_dir / "summary.json", summary)
    write_json(args.output_dir / "timing.json", timing)
    write_json(args.output_dir / "validation.json", {"status": validation_status, "checks": validation_checks})
    write_json(args.output_dir / "data_quality.json", {"status": "PASS", "input_rows": len(raw), "evaluation_rows": len(bars), "duplicate_event_ts": 0, "invalid_ohlcv": 0})
    write_json(args.output_dir / "pdiagram_manifest.json", {"probability": "Not calibrated", "trades": [{"trade_id": t["trade_id"], "controls": "daily RSI D-1 >40; minute RSI <15/>70; next-open; forced 15:15", "outcome_net_pnl": t["net_pnl"]} for t in trade_rows]})
    write_csv(args.output_dir / "trades.csv", trade_rows)
    write_csv(args.output_dir / "signals.csv", signal_rows)
    write_csv(args.output_dir / "skipped_signals.csv", skipped_rows)
    write_csv(args.output_dir / "equity_curve.csv", equity_rows)
    slices = [{"slice": key, "trades": len(group), "net_pnl": str(sum((Decimal(str(x["net_pnl"])) for x in group), Decimal("0")))} for key, group in _group(trade_rows, "exit_reason").items()]
    write_csv(args.output_dir / "metric_slices.csv", slices)
    atomic_write_text(args.output_dir / "equity_curve.svg", line_svg(equity_values, "Net liquidation equity", "#2563eb"))
    atomic_write_text(args.output_dir / "drawdown.svg", line_svg(peaks, "Drawdown (%)", "#dc2626", baseline=0))
    atomic_write_text(args.output_dir / "trade_pnl.svg", pnl_svg(net_values))
    report = render_report(summary, trade_rows)
    atomic_write_text(args.output_dir / "report.html", report)
    atomic_write_text(args.output_dir / "summary.md", f"# RSI15 / Daily40 — {args.symbol.upper()}\n\n- Status: {summary['status']}\n- Period: {args.start} through {args.end}\n- Bars: {len(bars)}\n- Trades: {len(result.trades)}\n- Net P&L: ₹{float(metrics.total_net_pnl):,.2f}\n- Review: `report.html`\n\nNo live broker orders were created.\n")
    atomic_write_text(args.output_dir / "RUN_COMPLETE", summary["status"] + "\n")
    checksum_lines = []
    for path in sorted(p for p in args.output_dir.iterdir() if p.is_file() and p.name not in {"checksums.sha256", "MANIFEST.json"}):
        checksum_lines.append(f"{sha256_file(path)}  {path.name}")
    atomic_write_text(args.output_dir / "checksums.sha256", "\n".join(checksum_lines) + "\n")
    build_artifact_manifest(args.output_dir)
    print(json.dumps({"status": summary["status"], "output_dir": str(args.output_dir.resolve()), "report": str((args.output_dir / "report.html").resolve()), "trades": len(result.trades), "net_pnl": str(metrics.total_net_pnl)}, indent=2))
    return 0 if validation_status == "PASS" else 2


def _group(rows: list[dict], key: str) -> dict[str, list[dict]]:
    result: dict[str, list[dict]] = {}
    for row in rows:
        result.setdefault(str(row.get(key, "unknown")), []).append(row)
    return result


if __name__ == "__main__":
    raise SystemExit(main())
