from __future__ import annotations

import argparse
import json
import sys
from dataclasses import asdict
from datetime import date, datetime, timezone
from decimal import Decimal
from pathlib import Path

import numpy as np
import pandas as pd

from nifty_stratlab.calibration.model import ChronologicalProbabilityModel
from nifty_stratlab.contracts import ProductType
from nifty_stratlab.calendar.config import load_calendar_config
from nifty_stratlab.costs.config import load_fee_registry
from nifty_stratlab.costs.engine import ExecutionFriction, solve_minimum_exit_price
from nifty_stratlab.data.csv_profiler import profile_csv
from nifty_stratlab.data.postgres import inspect_core_coverage
from nifty_stratlab.demo.config import demo_fee_registry
from nifty_stratlab.demo.synthetic import frame_to_strategy_bars, synthetic_equity_frame, synthetic_option_premium_bars
from nifty_stratlab.discovery.labels import OpportunityLabelConfig, build_executable_opportunity_labels
from nifty_stratlab.discovery.patterns import rank_candidate_features
from nifty_stratlab.discovery.walkforward import expanding_walk_forward_splits
from nifty_stratlab.evaluation.metrics import calculate_performance_metrics
from nifty_stratlab.features.technical import compute_technical_features
from nifty_stratlab.live.parity import compare_batch_and_online
from nifty_stratlab.options.black_scholes import OptionType, black_scholes_greeks, implied_volatility
from nifty_stratlab.options.simulator import simulate_long_option_trade
from nifty_stratlab.orchestration.models import RunSpec
from nifty_stratlab.orchestration.planner import plan_shards
from nifty_stratlab.reporting.artifacts import write_json
from nifty_stratlab.reporting.research_pack import ResearchPackBuilder, ResearchPackRequest, verify_research_pack
from nifty_stratlab.simulation.engine import BacktestEngine
from nifty_stratlab.simulation.models import PathPolicy, SimulationConfig
from nifty_stratlab.strategy.sdk import instantiate_strategy, load_manifest
from nifty_stratlab.v2_programme import add_v2_parsers


def _json(value) -> str:
    def default(item):
        if hasattr(item, "model_dump"):
            return item.model_dump(mode="json")
        if hasattr(item, "__dataclass_fields__"):
            return asdict(item)
        if hasattr(item, "isoformat"):
            return item.isoformat()
        if isinstance(item, Decimal):
            return str(item)
        return str(item)

    return json.dumps(value, default=default, indent=2, sort_keys=True)


def cmd_profile_csv(args: argparse.Namespace) -> int:
    calendar = None
    if args.calendar_config:
        calendar, _ = load_calendar_config(args.calendar_config)
    result = profile_csv(
        args.path,
        default_timezone=args.timezone,
        trading_calendar=calendar,
        segment=args.segment,
    )
    payload = result.as_dict()
    if args.output:
        write_json(args.output, payload)
    print(_json(payload))
    return 0 if result.status != "FAIL" else 2


def cmd_inspect_postgres(args: argparse.Namespace) -> int:
    print(_json(inspect_core_coverage(args.dsn)))
    return 0


def cmd_target_price(args: argparse.Namespace) -> int:
    registry = load_fee_registry(args.fees)
    product = ProductType(args.product)
    schedule = registry.resolve(date.fromisoformat(args.trade_date), args.exchange, product)
    solution = solve_minimum_exit_price(
        entry_price=Decimal(args.entry_price),
        quantity=args.quantity,
        target_net_pnl=Decimal(args.target_net),
        tick_size=Decimal(args.tick_size),
        schedule=schedule,
        friction=ExecutionFriction(
            entry_slippage_bps=Decimal(args.entry_slippage_bps),
            exit_slippage_bps=Decimal(args.exit_slippage_bps),
            entry_impact_bps=Decimal(args.entry_impact_bps),
            exit_impact_bps=Decimal(args.exit_impact_bps),
        ),
    )
    print(_json(asdict(solution)))
    return 0


def cmd_demo_backtest(args: argparse.Namespace) -> int:
    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)
    frame = synthetic_equity_frame(bars_per_symbol=args.bars, seed=args.seed)
    frame.to_csv(output / "input_bars.csv", index=False)
    manifest = load_manifest(args.strategy)
    strategy = instantiate_strategy(manifest)
    config = SimulationConfig(
        initial_cash=Decimal(args.initial_cash),
        ticket_size=Decimal(args.ticket_size),
        max_open_positions=args.max_positions,
        product=ProductType.EQUITY_INTRADAY,
        target_net_pnl=Decimal(args.target_net),
        stop_loss_pct=Decimal(args.stop_loss_pct),
        max_hold_bars=args.max_hold_bars,
        tick_size=Decimal(args.tick_size),
        path_policy=PathPolicy(args.path_policy),
    )
    result = BacktestEngine(
        strategy=strategy,
        config=config,
        fee_registry=demo_fee_registry(ProductType.EQUITY_INTRADAY),
        friction=ExecutionFriction(
            entry_slippage_bps=Decimal(args.slippage_bps),
            exit_slippage_bps=Decimal(args.slippage_bps),
        ),
    ).run(frame_to_strategy_bars(frame))
    metrics = calculate_performance_metrics(result.trades, result.equity_curve)
    write_json(output / "metrics.json", metrics.to_dict())
    write_json(output / "simulation.json", result)
    print(_json({"output": str(output), "metrics": metrics.to_dict(), "signals": len(result.signals)}))
    return 0


def cmd_plan_demo(args: argparse.Namespace) -> int:
    symbols = tuple(item.strip().upper() for item in args.symbols.split(",") if item.strip())
    spec = RunSpec(
        strategy_version_id=args.strategy_version,
        data_snapshot_id=args.data_snapshot,
        feature_set_id=args.feature_set,
        feature_version=args.feature_version,
        fee_profile_id=args.fee_profile,
        execution_model_id=args.execution_model,
        universe_snapshot_id=args.universe_snapshot,
        date_start=date.fromisoformat(args.start),
        date_end=date.fromisoformat(args.end),
        symbols=symbols,
        scenario_key=args.scenario,
        simulation_config={"ticket_size": args.ticket_size},
        code_hash=args.code_hash,
        random_seed=args.seed,
        requested_by=args.requested_by,
    )
    shards = plan_shards(spec, days_per_shard=args.days_per_shard, symbols_per_shard=args.symbols_per_shard)
    payload = {"run_id": spec.run_id, "run_spec": spec.model_dump(mode="json"), "shards": [item.model_dump(mode="json") | {"shard_id": item.shard_id} for item in shards]}
    if args.output:
        write_json(args.output, payload)
    print(_json(payload))
    return 0


def _discovery_frame(rows: int, seed: int):
    raw = synthetic_equity_frame(symbols=("AAA",), bars_per_symbol=rows, seed=seed)
    features = compute_technical_features(raw)
    labels = build_executable_opportunity_labels(
        raw,
        config=OpportunityLabelConfig(
            ticket_size=Decimal("200000"),
            target_net_pnl=Decimal("100"),
            stop_loss_pct=Decimal("1.0"),
            horizon_bars=20,
            tick_size=Decimal("0.05"),
            exchange="NSE",
            product=ProductType.EQUITY_INTRADAY,
        ),
        fee_registry=demo_fee_registry(ProductType.EQUITY_INTRADAY),
    )
    decision_features = features.copy()
    decision_features["decision_ts"] = pd.to_datetime(decision_features["event_ts"], utc=True)
    joined = labels.merge(decision_features, on=["symbol", "decision_ts"], how="left", suffixes=("", "_feature"))
    return raw, joined


def cmd_discover_demo(args: argparse.Namespace) -> int:
    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)
    raw, joined = _discovery_frame(args.rows, args.seed)
    joined.to_csv(output / "opportunities_with_features.csv", index=False)
    candidates = rank_candidate_features(
        joined,
        feature_columns=["rsi_14", "willr_14", "return_1", "range_pct", "close_location_pct"],
        minimum_non_null=max(20, args.minimum_train // 4),
    )
    write_json(output / "feature_associations.json", [asdict(item) for item in candidates])
    feature_names = ["rsi_14", "willr_14", "return_1", "range_pct", "close_location_pct"]
    model_data = joined.dropna(subset=["target_hit"]).reset_index(drop=True)
    X = model_data[feature_names].to_numpy(dtype=float)
    y = model_data["target_hit"].to_numpy(dtype=int)
    splits = expanding_walk_forward_splits(
        len(model_data),
        minimum_train=args.minimum_train,
        test_size=args.test_size,
        purge=args.purge,
        embargo=args.embargo,
    )
    model = ChronologicalProbabilityModel(feature_names, random_state=args.seed)
    evidence = model.fit(X, y, splits)
    manifest = model.save(output / "model")
    write_json(output / "calibration_evidence.json", {**asdict(evidence), "bins": [asdict(item) for item in evidence.bins]})
    print(_json({"output": str(output), "rows": len(model_data), "model": manifest, "top_features": [asdict(item) for item in candidates[:5]]}))
    return 0


def cmd_option_demo(args: argparse.Namespace) -> int:
    bars = synthetic_option_premium_bars(args.bars, args.seed)
    registry = demo_fee_registry(ProductType.INDEX_OPTION)
    trade = simulate_long_option_trade(
        bars,
        signal_index=args.signal_index,
        lot_size=args.lot_size,
        ticket_size=Decimal(args.ticket_size),
        target_net_pnl=Decimal(args.target_net),
        stop_loss_pct=Decimal(args.stop_loss_pct),
        horizon_bars=args.horizon,
        tick_size=Decimal(args.tick_size),
        exchange="NSE",
        product=ProductType.INDEX_OPTION,
        fee_registry=registry,
    )
    greek = black_scholes_greeks(
        spot=args.spot,
        strike=args.strike,
        time_years=args.days_to_expiry / 365.0,
        risk_free_rate=args.risk_free_rate,
        volatility=args.volatility,
        option_type=OptionType(args.right),
    )
    recovered_iv = implied_volatility(
        market_price=greek.theoretical_price,
        spot=args.spot,
        strike=args.strike,
        time_years=args.days_to_expiry / 365.0,
        risk_free_rate=args.risk_free_rate,
        option_type=OptionType(args.right),
    )
    print(_json({"trade": trade, "greeks": greek, "recovered_implied_volatility": recovered_iv, "warning": "test-only fee schedule"}))
    return 0


def cmd_parity_demo(args: argparse.Namespace) -> int:
    frame = synthetic_equity_frame(bars_per_symbol=args.bars, seed=args.seed)
    differences = compare_batch_and_online(frame, tolerance=args.tolerance)
    payload = {"rows": len(frame), "differences": [asdict(item) for item in differences], "passed": not differences}
    print(_json(payload))
    return 0 if not differences else 3


def cmd_research_pack_demo(args: argparse.Namespace) -> int:
    output = Path(args.output)
    raw, joined = _discovery_frame(args.rows, args.seed)
    request = ResearchPackRequest(
        as_of=datetime.now(timezone.utc),
        symbols=("AAA",),
        purpose="Demonstrate the morning/on-demand analyst evidence exchange",
        data_snapshot_id="demo_snapshot",
        strategy_version_ids=("rsi30_willr80_closegtprev_net_target_v1",),
        requested_by="demo",
    )
    builder = ResearchPackBuilder(request)
    builder.add_frame("data/recent_bars.csv", raw.tail(100))
    builder.add_frame("data/opportunity_labels.csv", joined.tail(100))
    builder.add_json("evidence/data_quality.json", {"status": "DEMO", "rows": len(raw)})
    builder.add_markdown_section("Scope", "Synthetic evidence only. Replace adapters with the existing PostgreSQL and qualified historical file sources.")
    result = builder.build(output)
    result["verification"] = verify_research_pack(output)
    print(_json(result))
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="nifty-stratlab", description="NIFTY strategy research/backtesting reference implementation")
    sub = parser.add_subparsers(dest="command", required=True)

    profile = sub.add_parser("profile-csv", help="Profile a historical OHLC CSV before it is admitted")
    profile.add_argument("path")
    profile.add_argument("--timezone", default="Asia/Kolkata")
    profile.add_argument("--calendar-config")
    profile.add_argument("--segment", default="NSE_CM")
    profile.add_argument("--output")
    profile.set_defaults(func=cmd_profile_csv)

    inspect = sub.add_parser("inspect-postgres", help="Read-only core table coverage inspection")
    inspect.add_argument("--dsn")
    inspect.set_defaults(func=cmd_inspect_postgres)

    target = sub.add_parser("target-price", help="Solve first valid tick reaching a requested net P&L")
    target.add_argument("--fees", required=True)
    target.add_argument("--trade-date", required=True)
    target.add_argument("--product", choices=[item.value for item in ProductType], required=True)
    target.add_argument("--exchange", default="NSE")
    target.add_argument("--entry-price", required=True)
    target.add_argument("--quantity", type=int, required=True)
    target.add_argument("--target-net", required=True)
    target.add_argument("--tick-size", default="0.05")
    target.add_argument("--entry-slippage-bps", default="0")
    target.add_argument("--exit-slippage-bps", default="0")
    target.add_argument("--entry-impact-bps", default="0")
    target.add_argument("--exit-impact-bps", default="0")
    target.set_defaults(func=cmd_target_price)

    demo = sub.add_parser("demo-backtest", help="Run a deterministic end-to-end equity reference test")
    demo.add_argument("--strategy", required=True)
    demo.add_argument("--output", required=True)
    demo.add_argument("--bars", type=int, default=220)
    demo.add_argument("--seed", type=int, default=7)
    demo.add_argument("--initial-cash", default="1000000")
    demo.add_argument("--ticket-size", default="200000")
    demo.add_argument("--max-positions", type=int, default=3)
    demo.add_argument("--target-net", default="500")
    demo.add_argument("--stop-loss-pct", default="1")
    demo.add_argument("--max-hold-bars", type=int, default=60)
    demo.add_argument("--tick-size", default="0.05")
    demo.add_argument("--slippage-bps", default="2.5")
    demo.add_argument("--path-policy", choices=[item.value for item in PathPolicy], default="stop_first")
    demo.set_defaults(func=cmd_demo_backtest)

    plan = sub.add_parser("plan-run", help="Generate deterministic run and shard identities")
    plan.add_argument("--strategy-version", default="rsi30_willr80_closegtprev_net_target_v1")
    plan.add_argument("--data-snapshot", default="snapshot_example")
    plan.add_argument("--feature-set", default="technical_core")
    plan.add_argument("--feature-version", default="1")
    plan.add_argument("--fee-profile", default="fee_example")
    plan.add_argument("--execution-model", default="execution_e2")
    plan.add_argument("--universe-snapshot", default="nifty50_example")
    plan.add_argument("--start", required=True)
    plan.add_argument("--end", required=True)
    plan.add_argument("--symbols", required=True)
    plan.add_argument("--scenario", default="finite_2l_intraday")
    plan.add_argument("--ticket-size", default="200000")
    plan.add_argument("--code-hash", default="replace-with-git-commit")
    plan.add_argument("--seed", type=int, default=0)
    plan.add_argument("--requested-by", default="cli")
    plan.add_argument("--days-per-shard", type=int, default=20)
    plan.add_argument("--symbols-per-shard", type=int, default=10)
    plan.add_argument("--output")
    plan.set_defaults(func=cmd_plan_demo)

    discovery = sub.add_parser("discover-demo", help="Build executable labels and a calibrated chronological baseline")
    discovery.add_argument("--output", required=True)
    discovery.add_argument("--rows", type=int, default=700)
    discovery.add_argument("--seed", type=int, default=11)
    discovery.add_argument("--minimum-train", type=int, default=250)
    discovery.add_argument("--test-size", type=int, default=80)
    discovery.add_argument("--purge", type=int, default=20)
    discovery.add_argument("--embargo", type=int, default=0)
    discovery.set_defaults(func=cmd_discover_demo)

    option = sub.add_parser("option-demo", help="Run observed-premium long-option simulation and Greeks")
    option.add_argument("--bars", type=int, default=80)
    option.add_argument("--seed", type=int, default=5)
    option.add_argument("--signal-index", type=int, default=10)
    option.add_argument("--lot-size", type=int, default=65)
    option.add_argument("--ticket-size", default="200000")
    option.add_argument("--target-net", default="1000")
    option.add_argument("--stop-loss-pct", default="20")
    option.add_argument("--horizon", type=int, default=40)
    option.add_argument("--tick-size", default="0.05")
    option.add_argument("--spot", type=float, default=25000)
    option.add_argument("--strike", type=float, default=25000)
    option.add_argument("--days-to-expiry", type=int, default=7)
    option.add_argument("--risk-free-rate", type=float, default=0.06)
    option.add_argument("--volatility", type=float, default=0.18)
    option.add_argument("--right", choices=[item.value for item in OptionType], default="CE")
    option.set_defaults(func=cmd_option_demo)

    parity = sub.add_parser("parity-demo", help="Compare canonical batch and incremental replay features")
    parity.add_argument("--bars", type=int, default=100)
    parity.add_argument("--seed", type=int, default=7)
    parity.add_argument("--tolerance", type=float, default=1e-10)
    parity.set_defaults(func=cmd_parity_demo)

    pack = sub.add_parser("research-pack-demo", help="Build and verify a checksummed analyst ZIP pack")
    pack.add_argument("--output", required=True)
    pack.add_argument("--rows", type=int, default=220)
    pack.add_argument("--seed", type=int, default=7)
    pack.set_defaults(func=cmd_research_pack_demo)
    add_v2_parsers(sub)
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        return int(args.func(args))
    except KeyboardInterrupt:
        return 130
    except Exception as exc:
        print(f"ERROR: {type(exc).__name__}: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
