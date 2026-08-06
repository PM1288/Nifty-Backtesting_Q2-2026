#!/usr/bin/env python3
"""Run the governed acceptance gate for one strategy and one stock scenario.

This command deliberately reuses the latest validated, published backtest batch.
It does not replace the production batch with a partial run. It refreshes the
Rules-of-Engagement evaluation for the exact scenario, exports its evidence pack,
and verifies that stock, NIFTY 50, Bank NIFTY and India VIX context is persisted.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import sys
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path
from typing import Any

import psycopg
from psycopg.rows import dict_row


PROJECT_ROOT = Path(__file__).resolve().parents[1]
MONOREPO_ROOT = PROJECT_ROOT.parents[1]
DEFAULT_WORKBOOK = Path("/home/novius2/NIFTY50/Rules-of-engegemnt/Nifty_50_Event_Regime_Analysis_Master_2016_2026.xlsx")
DEFAULT_RULES = Path("/home/novius2/NIFTY50/Rules-of-engegemnt/CODEX_IMPLEMENT_STRATEGY_EVALUATION_RULES_OF_ENGAGEMENT_V1.0.md")
REQUIRED_SLICE_TYPES = {
    "STOCK_TREND",
    "STOCK_ZONE",
    "NIFTY_TREND",
    "NIFTY_ZONE",
    "BANK_NIFTY_TREND",
    "BANK_NIFTY_ZONE",
    "STOCK_NIFTY_MATRIX",
    "VIX_REGIME",
}


def scalar(value: Any) -> Any:
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    return value


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def run(command: list[str]) -> None:
    subprocess.run(command, cwd=PROJECT_ROOT, check=True)


def fetch_one(cur, sql: str, params: tuple[Any, ...]) -> dict[str, Any]:
    cur.execute(sql, params)
    row = cur.fetchone()
    if row is None:
        raise RuntimeError("Required persisted record was not found")
    return dict(row)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database-url", default=os.environ.get("DATABASE_URL"))
    parser.add_argument("--strategy-id", required=True)
    parser.add_argument("--symbol", required=True)
    parser.add_argument("--capital-mode", default="capital_16l")
    parser.add_argument("--workbook", type=Path, default=DEFAULT_WORKBOOK)
    parser.add_argument("--rules", type=Path, default=DEFAULT_RULES)
    parser.add_argument("--output-root", type=Path, default=PROJECT_ROOT / "outputs" / "acceptance")
    parser.add_argument("--skip-evaluation-refresh", action="store_true")
    args = parser.parse_args()
    if not args.database_url:
        raise SystemExit("--database-url or DATABASE_URL is required")

    symbol = args.symbol.strip().upper()
    scenario = f"single_stock:{args.capital_mode}:{symbol}"
    output_dir = args.output_root / args.strategy_id / f"{symbol}_{args.capital_mode}"
    output_dir.mkdir(parents=True, exist_ok=True)

    if not args.skip_evaluation_refresh:
        run(
            [
                sys.executable,
                str(PROJECT_ROOT / "tools" / "import_strategy_evaluation_roe.py"),
                "--database-url",
                args.database_url,
                "--workbook",
                str(args.workbook),
                "--rules",
                str(args.rules),
                "--evaluation-strategy-id",
                args.strategy_id,
                "--evaluation-scenario",
                scenario,
            ]
        )

    run(
        [
            sys.executable,
            str(PROJECT_ROOT / "tools" / "export_strategy_evaluation_pack.py"),
            "--database-url",
            args.database_url,
            "--strategy-id",
            args.strategy_id,
            "--scenario",
            scenario,
            "--output-dir",
            str(output_dir),
        ]
    )

    checks: list[dict[str, Any]] = []
    with psycopg.connect(args.database_url, row_factory=dict_row) as conn, conn.cursor() as cur:
        identity = fetch_one(
            cur,
            """
            SELECT r.backtest_run_id,r.batch_run_id,r.scenario_key,r.as_of_date,
                   b.status AS batch_status,b.validation_status AS batch_validation_status,
                   e.evaluation_id,e.result_type,e.rankability_status,e.rating,e.validation_status,
                   (r.summary_json->>'totalClosedTrades')::int AS closed_trades,
                   (r.summary_json->>'openPositions')::int AS open_positions
            FROM nse_app.backtest_run r
            JOIN nse_app.batch_run_audit b USING(batch_run_id)
            JOIN nse_app.backtest_strategy_version sv USING(strategy_version_id)
            JOIN nse_app.backtest_strategy s USING(strategy_id)
            JOIN strategy_eval.run_evaluation e ON e.backtest_run_id=r.backtest_run_id
            WHERE b.batch_name='backtesting_precompute' AND b.published_flag
              AND s.strategy_id=%s AND r.scenario_key=%s
            ORDER BY e.evaluated_at DESC LIMIT 1
            """,
            (args.strategy_id, scenario),
        )
        checks.append({
            "name": "published_backtest_and_governed_evaluation",
            "passed": identity["batch_status"] == "published" and identity["batch_validation_status"] == "passed",
            "details": {key: scalar(value) for key, value in identity.items()},
        })

        context = fetch_one(
            cur,
            """
            SELECT COUNT(*)::int AS trade_rows,
                   COUNT(c.trade_log_id)::int AS context_rows,
                   COUNT(*) FILTER (WHERE c.stock_primary_trend IS NOT NULL
                     AND c.stock_persistence_class IS NOT NULL AND c.stock_volatility_regime IS NOT NULL
                     AND c.stock_market_zone IS NOT NULL)::int AS complete_stock,
                   COUNT(*) FILTER (WHERE c.nifty_primary_trend IS NOT NULL
                     AND c.nifty_persistence_class IS NOT NULL AND c.nifty_volatility_regime IS NOT NULL
                     AND c.nifty_market_zone IS NOT NULL)::int AS complete_nifty,
                   COUNT(*) FILTER (WHERE c.bank_nifty_primary_trend IS NOT NULL
                     AND c.bank_nifty_persistence_class IS NOT NULL AND c.bank_nifty_volatility_regime IS NOT NULL
                     AND c.bank_nifty_market_zone IS NOT NULL)::int AS complete_bank_nifty,
                   COUNT(*) FILTER (WHERE c.india_vix IS NOT NULL AND c.vix_regime IS NOT NULL)::int AS complete_vix
            FROM nse_app.backtest_trade_log t
            LEFT JOIN strategy_eval.trade_context_snapshot c USING(trade_log_id)
            WHERE t.batch_run_id=%s AND t.scenario_key=%s
              AND t.strategy_version_id=(SELECT strategy_version_id FROM nse_app.backtest_run WHERE backtest_run_id=%s)
            """,
            (identity["batch_run_id"], scenario, identity["backtest_run_id"]),
        )
        trade_rows = int(context["trade_rows"])
        context_complete = trade_rows > 0 and all(int(context[key]) == trade_rows for key in (
            "context_rows", "complete_stock", "complete_nifty", "complete_bank_nifty", "complete_vix"
        ))
        checks.append({"name": "all_trade_regimes_persisted", "passed": context_complete, "details": context})

        cur.execute(
            """
            SELECT instrument_type,symbol,COUNT(*)::int AS row_count,MIN(trade_date) AS min_date,
                   MAX(trade_date) AS max_date,COUNT(DISTINCT primary_trend)::int AS trend_classes,
                   COUNT(DISTINCT market_zone)::int AS zone_classes
            FROM strategy_eval.market_regime_daily
            WHERE policy_version='NIFTY-SEROE-V1.0'
              AND ((instrument_type='STOCK' AND symbol=%s)
                OR (instrument_type='INDEX' AND symbol IN ('NIFTY 50','BANK NIFTY','INDIA VIX')))
            GROUP BY instrument_type,symbol ORDER BY instrument_type,symbol
            """,
            (symbol,),
        )
        coverage = [{key: scalar(value) for key, value in dict(row).items()} for row in cur.fetchall()]
        covered = {(row["instrument_type"], row["symbol"]) for row in coverage if row["row_count"] > 0}
        required = {("STOCK", symbol), ("INDEX", "NIFTY 50"), ("INDEX", "BANK NIFTY"), ("INDEX", "INDIA VIX")}
        checks.append({"name": "regime_history_coverage", "passed": covered == required, "details": coverage})

        cur.execute("SELECT DISTINCT slice_type FROM strategy_eval.slice_metric WHERE evaluation_id=%s", (identity["evaluation_id"],))
        slice_types = {row["slice_type"] for row in cur.fetchall()}
        checks.append({
            "name": "all_required_regime_slices_saved",
            "passed": REQUIRED_SLICE_TYPES.issubset(slice_types),
            "details": {"required": sorted(REQUIRED_SLICE_TYPES), "saved": sorted(slice_types)},
        })

        required_files = {
            "strategy_evaluation.xlsx", "trades.csv", "stock_performance.csv", "slice_metrics.csv",
            "strategy_summary.json", "strategy_summary.md", "checksums.sha256",
        }
        files = {path.name for path in output_dir.iterdir() if path.is_file()}
        checks.append({
            "name": "review_artifacts_saved",
            "passed": required_files.issubset(files),
            "details": {"output_dir": str(output_dir), "files": sorted(files)},
        })

        status = "PASS" if all(check["passed"] for check in checks) else "FAIL"
        report = {
            "status": status,
            "generated_at": datetime.now().astimezone().isoformat(),
            "strategy_id": args.strategy_id,
            "symbol": symbol,
            "scenario": scenario,
            "note": "Pipeline acceptance is independent of strategy rankability or profitability.",
            "checks": checks,
        }
        json_path = output_dir / "acceptance.json"
        md_path = output_dir / "acceptance.md"
        json_path.write_text(json.dumps(report, indent=2, sort_keys=True, default=scalar) + "\n", encoding="utf-8")
        md_path.write_text(
            "# Single-stock strategy acceptance\n\n"
            f"- Status: `{status}`\n- Strategy: `{args.strategy_id}`\n- Symbol: `{symbol}`\n"
            f"- Scenario: `{scenario}`\n- Backtest run: `{identity['backtest_run_id']}`\n"
            f"- Result classification: `{identity['result_type']} / {identity['rankability_status']} / {identity['rating']}`\n\n"
            "## Checks\n\n" + "\n".join(
                f"- {'PASS' if check['passed'] else 'FAIL'} — {check['name']}" for check in checks
            ) + "\n",
            encoding="utf-8",
        )
        for path in (json_path, md_path):
            cur.execute(
                """
                INSERT INTO strategy_eval.artifact_manifest
                  (evaluation_id,artifact_type,artifact_path,sha256,size_bytes)
                VALUES (%s,%s,%s,%s,%s)
                ON CONFLICT (evaluation_id,artifact_path) DO UPDATE SET
                  artifact_type=EXCLUDED.artifact_type,sha256=EXCLUDED.sha256,
                  size_bytes=EXCLUDED.size_bytes,created_at=NOW()
                """,
                (identity["evaluation_id"], path.suffix.lstrip("."), str(path.resolve()), sha256(path), path.stat().st_size),
            )
        conn.commit()

    print(json.dumps(report, indent=2, sort_keys=True, default=scalar))
    if report["status"] != "PASS":
        raise SystemExit(1)


if __name__ == "__main__":
    main()
