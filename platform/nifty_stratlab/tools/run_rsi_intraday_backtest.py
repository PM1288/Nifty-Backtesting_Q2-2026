#!/usr/bin/env python3
from __future__ import annotations

import argparse
from dataclasses import asdict
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from pathlib import Path
from zoneinfo import ZoneInfo

import pandas as pd

from nifty_stratlab.contracts import ProductType
from nifty_stratlab.demo.config import demo_fee_registry
from nifty_stratlab.deployment import persist_bounded_equity_research_run
from nifty_stratlab.evaluation.metrics import calculate_performance_metrics
from nifty_stratlab.features.technical import compute_technical_features, attach_prior_completed_daily_rsi
from nifty_stratlab.reporting.artifacts import build_artifact_manifest, write_csv, write_json
from nifty_stratlab.reporting.research_pack import ResearchPackBuilder, ResearchPackRequest, verify_research_pack
from nifty_stratlab.simulation.engine import BacktestEngine
from nifty_stratlab.simulation.models import SimulationConfig
from nifty_stratlab.strategy.sdk import StrategyBar, instantiate_strategy, load_manifest
from nifty_stratlab.util.hashing import sha256_file
from nifty_stratlab.util.io import atomic_write_text


IST = ZoneInfo("Asia/Kolkata")


def _arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run one explicit 1-minute RSI 30/70 backtest with prior daily RSI >45."
    )
    parser.add_argument("--csv", required=True, type=Path, help="One explicit minute CSV; no directory scans.")
    parser.add_argument("--symbol", required=True)
    parser.add_argument("--start", required=True, type=date.fromisoformat)
    parser.add_argument("--end", required=True, type=date.fromisoformat)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--warmup-days", type=int, default=90)
    parser.add_argument("--initial-cash", type=Decimal, default=Decimal("1000000"))
    parser.add_argument("--ticket-size", type=Decimal, default=Decimal("200000"))
    parser.add_argument("--persist-dsn-env", help="Persist and publish to the governed research schemas using this DSN environment variable.")
    return parser.parse_args()


def _load_bounded_csv(path: Path, symbol: str, start: date, end: date, warmup_days: int) -> pd.DataFrame:
    if not path.is_file():
        raise FileNotFoundError(path)
    if end < start:
        raise ValueError("end precedes start")
    if warmup_days < 30:
        raise ValueError("warmup-days must be at least 30")
    lower = pd.Timestamp(start - timedelta(days=warmup_days))
    upper = pd.Timestamp(end + timedelta(days=1))
    pieces = []
    for chunk in pd.read_csv(path, chunksize=200_000):
        required = {"date", "open", "high", "low", "close", "volume"}
        missing = sorted(required - set(chunk.columns))
        if missing:
            raise ValueError(f"CSV missing columns: {', '.join(missing)}")
        timestamps = pd.to_datetime(chunk["date"], errors="coerce")
        if timestamps.isna().any():
            raise ValueError("CSV contains unparseable timestamps")
        selected = chunk.loc[(timestamps >= lower) & (timestamps < upper)].copy()
        if selected.empty:
            continue
        selected["event_ts"] = timestamps.loc[selected.index].dt.tz_localize(IST)
        pieces.append(selected)
    if not pieces:
        raise ValueError("no rows in requested range plus warmup")
    frame = pd.concat(pieces, ignore_index=True)
    local_time = frame["event_ts"].dt.time
    frame = frame.loc[(local_time >= time(9, 15)) & (local_time <= time(15, 29))].copy()
    for column in ("open", "high", "low", "close", "volume"):
        frame[column] = pd.to_numeric(frame[column], errors="coerce")
    if frame[["open", "high", "low", "close", "volume"]].isna().any().any():
        raise ValueError("requested rows contain missing or non-numeric OHLCV")
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


def _strategy_bars(featured: pd.DataFrame, start: date, end: date) -> list[StrategyBar]:
    sessions = featured["event_ts"].dt.tz_convert(IST).dt.date
    selected = featured.loc[(sessions >= start) & (sessions <= end)].copy()
    base = {"symbol", "instrument_id", "event_ts", "available_at", "open", "high", "low", "close", "volume"}
    bars = []
    for row in selected.to_dict(orient="records"):
        features = {key: (None if pd.isna(value) else value) for key, value in row.items() if key not in base}
        bars.append(
            StrategyBar(
                symbol=row["symbol"], instrument_id=row["instrument_id"],
                event_ts=pd.Timestamp(row["event_ts"]).to_pydatetime(),
                available_at=pd.Timestamp(row["available_at"]).to_pydatetime(), interval="1m",
                open=float(row["open"]), high=float(row["high"]), low=float(row["low"]),
                close=float(row["close"]), volume=int(row["volume"]), features=features,
            )
        )
    if not bars:
        raise ValueError("no regular-session bars in the evaluation range")
    return bars


def main() -> int:
    args = _arguments()
    package = Path(__file__).resolve().parents[1]
    raw = _load_bounded_csv(args.csv, args.symbol, args.start, args.end, args.warmup_days)
    featured = attach_prior_completed_daily_rsi(compute_technical_features(raw))
    bars = _strategy_bars(featured, args.start, args.end)
    manifest = load_manifest(package / "config/strategies/rsi_1m_daily45_v1.yml")
    result = BacktestEngine(
        strategy=instantiate_strategy(manifest),
        config=SimulationConfig(
            initial_cash=args.initial_cash, ticket_size=args.ticket_size, max_open_positions=1,
            product=ProductType.EQUITY_DELIVERY, target_net_pnl=Decimal("0"),
            stop_loss_pct=Decimal("99"), max_hold_bars=1_000_000,
            enable_target_exit=False, enable_stop_exit=False,
        ),
        fee_registry=demo_fee_registry(ProductType.EQUITY_DELIVERY),
    ).run(bars)
    metrics = calculate_performance_metrics(result.trades, result.equity_curve, annualisation_periods=252 * 375)
    args.output_dir.mkdir(parents=True, exist_ok=True)
    trade_rows = [trade.model_dump(mode="json") for trade in result.trades]
    signal_rows = [signal.model_dump(mode="json") for signal in result.signals]
    equity_rows = [asdict(point) for point in result.equity_curve]
    skipped_rows = [
        {"signal_id": row.signal.signal_id, "reason": row.reason, "details": row.details}
        for row in result.skipped_signals
    ]
    write_csv(args.output_dir / "trades.csv", trade_rows)
    write_csv(args.output_dir / "signals.csv", signal_rows)
    write_csv(args.output_dir / "equity_curve.csv", equity_rows)
    write_csv(args.output_dir / "skipped_signals.csv", skipped_rows)
    source_hash = sha256_file(args.csv)
    summary = {
        "status": "PASS",
        "strategy_version_id": manifest.strategy_version_id,
        "rule": "buy when completed 1m RSI(14) <30 and prior completed daily RSI(14) >45; sell when completed 1m RSI(14) >70",
        "execution": "signals execute at next 1m bar open; target and stop exits disabled",
        "symbol": args.symbol.upper(), "start": args.start, "end": args.end,
        "source": str(args.csv.resolve()), "source_sha256": source_hash,
        "warmup_days": args.warmup_days, "evaluation_bars": len(bars),
        "regular_session_filter": "09:15 through 15:29 Asia/Kolkata",
        "entry_signal_count": sum(signal.intent_type == "enter" for signal in result.signals),
        "exit_signal_count": sum(signal.intent_type == "exit" for signal in result.signals),
        "open_position_count": len(result.open_positions),
        "final_cash_excludes_open_market_value": str(result.final_cash),
        "metrics": metrics.to_dict(),
        "cost_model": "TEST_ONLY equity-delivery schedule; not broker-reconciled",
        "order_authority": False,
    }
    write_json(args.output_dir / "summary.json", summary)
    markdown = (
        f"# RSI 1-Minute / Prior Daily RSI Backtest — {args.symbol.upper()}\n\n"
        f"- Period: {args.start} through {args.end}\n"
        f"- Bars: {len(bars)}\n"
        f"- Closed trades: {metrics.trade_count}\n"
        f"- Net P&L: {metrics.total_net_pnl}\n"
        f"- Win rate: {metrics.win_rate_pct}\n"
        f"- Open positions at end: {len(result.open_positions)}\n\n"
        "Rule: buy at the next minute open after RSI(14) < 30 when the prior completed "
        "daily RSI(14) is > 45; sell at the next minute open after RSI(14) > 70.\n\n"
        "Costs use a TEST_ONLY schedule and are not suitable for capital deployment. No orders are created.\n"
    )
    atomic_write_text(args.output_dir / "SUMMARY.md", markdown)
    request = ResearchPackRequest(
        as_of=datetime.combine(args.end, time(15, 30), tzinfo=IST), symbols=(args.symbol.upper(),),
        purpose="bounded validation of RSI 1m 30/70 with prior daily RSI >45",
        data_snapshot_id=source_hash, strategy_version_ids=(manifest.strategy_version_id,),
        requested_by="codex", metadata={"order_authority": False, "cost_model": summary["cost_model"]},
    )
    pack = ResearchPackBuilder(request)
    pack.add_frame("results/trades.csv", pd.DataFrame(trade_rows))
    pack.add_frame("results/signals.csv", pd.DataFrame(signal_rows))
    pack.add_json("results/summary.json", summary)
    pack.add_markdown_section("Backtest result", markdown)
    pack_result = pack.build(args.output_dir / "research_pack.zip")
    summary["research_pack"] = {**pack_result, "verification": verify_research_pack(pack_result["zip_path"])}
    if args.persist_dsn_env:
        summary["postgres"] = persist_bounded_equity_research_run(
            dsn_env=args.persist_dsn_env, source_path=args.csv, source_hash=source_hash,
            manifest_path=package / "config/strategies/rsi_1m_daily45_v1.yml",
            manifest=manifest, result=result, metrics=metrics, symbol=args.symbol.upper(),
            date_start=args.start, date_end=args.end, scenario_key="rsi_1m_daily45_signal_only",
            output_uri=pack_result["zip_path"], output_checksum=pack_result["zip_sha256"],
        )
    write_json(args.output_dir / "summary.json", summary)
    build_artifact_manifest(args.output_dir)
    print((args.output_dir / "summary.json").read_text(encoding="utf-8"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
