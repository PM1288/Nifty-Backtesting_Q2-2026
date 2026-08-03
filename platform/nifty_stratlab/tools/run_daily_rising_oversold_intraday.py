#!/usr/bin/env python3
"""Bounded one-symbol runner for daily_rising_oversold_intraday_v1."""
from __future__ import annotations

import argparse
from dataclasses import asdict
from datetime import date
from decimal import Decimal
from pathlib import Path

import pandas as pd

from nifty_stratlab.contracts import ProductType
from nifty_stratlab.demo.config import demo_fee_registry
from nifty_stratlab.features.technical import attach_daily_oversold_setup, compute_technical_features
from nifty_stratlab.reporting.artifacts import build_artifact_manifest, write_csv, write_json
from nifty_stratlab.simulation.engine import BacktestEngine
from nifty_stratlab.simulation.models import SimulationConfig
from nifty_stratlab.strategy.sdk import instantiate_strategy, load_manifest

from run_rsi_intraday_backtest import _load_bounded_csv, _strategy_bars


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--csv", required=True, type=Path)
    parser.add_argument("--symbol", required=True)
    parser.add_argument("--start", required=True, type=date.fromisoformat)
    parser.add_argument("--end", required=True, type=date.fromisoformat)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--warmup-days", type=int, default=120)
    args = parser.parse_args()

    raw = _load_bounded_csv(args.csv, args.symbol, args.start, args.end, args.warmup_days)
    featured = attach_daily_oversold_setup(compute_technical_features(raw))
    bars = _strategy_bars(featured, args.start, args.end)
    package = Path(__file__).resolve().parents[1]
    manifest = load_manifest(package / "config/strategies/daily_rising_oversold_intraday_v1.yml")
    result = BacktestEngine(
        strategy=instantiate_strategy(manifest),
        config=SimulationConfig(
            initial_cash=Decimal("1600000"), ticket_size=Decimal("200000"), max_open_positions=1,
            product=ProductType.EQUITY_DELIVERY, target_net_pnl=Decimal("2500"),
            stop_loss_pct=Decimal("99"), max_hold_bars=1_000_000,
            enable_target_exit=True, enable_stop_exit=False,
        ),
        fee_registry=demo_fee_registry(ProductType.EQUITY_DELIVERY),
    ).run(bars)
    args.output_dir.mkdir(parents=True, exist_ok=True)
    trades = [trade.model_dump(mode="json") for trade in result.trades]
    signals = [signal.model_dump(mode="json") for signal in result.signals]
    write_csv(args.output_dir / "trades.csv", trades)
    write_csv(args.output_dir / "signals.csv", signals)
    write_csv(args.output_dir / "equity_curve.csv", [asdict(point) for point in result.equity_curve])
    summary = {
        "status": "PASS", "strategy_version_id": manifest.strategy_version_id,
        "symbol": args.symbol.upper(), "start": args.start, "end": args.end,
        "evaluation_bars": len(bars), "entry_signals": sum(s["intent_type"] == "enter" for s in signals),
        "exit_signals": sum(s["intent_type"] == "exit" for s in signals),
        "closed_trades": len(trades), "open_positions": len(result.open_positions),
        "final_cash": str(result.final_cash), "target_net_pnl": "2500",
        "target_assumption": "approximately 1.25% of a 200000 ticket, solved net of costs",
        "order_authority": False,
    }
    write_json(args.output_dir / "summary.json", summary)
    (args.output_dir / "SUMMARY.md").write_text(
        f"# Daily Rising Oversold Intraday — {args.symbol.upper()}\n\n"
        f"- Period: {args.start} through {args.end}\n- Bars: {len(bars)}\n"
        f"- Entries: {summary['entry_signals']}\n- Closed trades: {len(trades)}\n"
        f"- Final cash: {result.final_cash}\n- Target: net ₹2,500 per ₹2L ticket (~1.25%)\n"
        "\nResearch only; no broker orders.\n", encoding="utf-8"
    )
    build_artifact_manifest(args.output_dir)
    print((args.output_dir / "summary.json").read_text(encoding="utf-8"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
