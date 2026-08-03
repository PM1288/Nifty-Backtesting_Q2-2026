from __future__ import annotations

import argparse
import importlib
import os
import sys
from pathlib import Path

from .logging_utils import configure_logging
from .pipeline import (
    refresh_dashboard_snapshots,
    refresh_exports,
    refresh_watchlist_snapshots,
    retention_cleanup,
    run_quality_checks,
)
from .sql_loader import install_sql


def _resolve_worker_root() -> Path:
    file_path = Path(__file__).resolve()
    candidates = [Path("/app/vendor/nse_analytics_worker")]
    candidates.extend(parent / "services" / "nse_analytics_worker" for parent in file_path.parents)
    for candidate in candidates:
        if candidate.exists():
            return candidate
    raise RuntimeError("Unable to locate the vendored nse_analytics_worker package root")


def refresh_indicator_strategy_snapshots() -> dict[str, object]:
    worker_root = _resolve_worker_root()
    worker_root_str = str(worker_root)
    if worker_root_str not in sys.path:
        sys.path.insert(0, worker_root_str)

    worker_db = importlib.import_module("app.db")
    worker_module = importlib.import_module("app.indicator_strategy")

    registry_path = worker_root / "config" / "indicator_strategy_registry.yml"
    database_url = os.getenv("PG_DSN")
    if not database_url:
        raise RuntimeError("PG_DSN is not configured for the orchestration environment")

    with worker_db.connect(database_url) as conn:
        run_id = worker_db.create_job_run(conn, "refresh-indicator-strategy")
        try:
            metrics = worker_module.refresh_indicator_strategy_snapshots(conn, registry_path, run_id)
            worker_db.finish_job_run(conn, run_id, "success", metrics)
            return metrics
        except Exception as exc:
            worker_db.finish_job_run(conn, run_id, "failed", {"error": str(exc)})
            raise


def main() -> None:
    configure_logging()
    parser = argparse.ArgumentParser(description="Run manual NSE orchestration jobs")
    parser.add_argument(
        "job",
        choices=[
            "install-sql",
            "refresh-summaries",
            "refresh-indicator-strategy",
            "refresh-watchlists",
            "refresh-exports",
            "run-quality-checks",
            "retention",
        ],
    )
    args = parser.parse_args()

    if args.job == "install-sql":
        install_sql()
        return
    if args.job == "refresh-summaries":
        refresh_dashboard_snapshots()
        refresh_indicator_strategy_snapshots()
        return
    if args.job == "refresh-indicator-strategy":
        refresh_indicator_strategy_snapshots()
        return
    if args.job == "refresh-watchlists":
        refresh_watchlist_snapshots()
        return
    if args.job == "refresh-exports":
        refresh_exports()
        return
    if args.job == "run-quality-checks":
        run_quality_checks()
        return
    if args.job == "retention":
        retention_cleanup()
        return


if __name__ == "__main__":
    main()
