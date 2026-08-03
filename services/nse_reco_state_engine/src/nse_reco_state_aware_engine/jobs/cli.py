from __future__ import annotations

import argparse
from typing import List, Optional

from nse_reco_state_aware_engine.core.config import settings
from nse_reco_state_aware_engine.jobs.service import run_job


def main() -> int:
    parser = argparse.ArgumentParser(prog="nse-reco-cli", description="Run reco engine jobs")
    sub = parser.add_subparsers(dest="cmd", required=True)

    run = sub.add_parser("run", help="Run one job chain")
    run.add_argument("--job-name", default="reco_chain")
    run.add_argument("--trade-date", default=None)
    run.add_argument("--index-code", default=settings.DEFAULT_INDEX_CODE)
    run.add_argument("--horizon", default=settings.DEFAULT_HORIZON)
    run.add_argument("--steps", default="baselines,regime,anomalies,recommendations,scorecards,watchlists,quality,retention")

    args = parser.parse_args()
    if args.cmd == "run":
        steps: List[str] = [s.strip() for s in args.steps.split(",") if s.strip()]
        res = run_job(job_name=args.job_name, trade_date=args.trade_date, index_code=args.index_code, horizon=args.horizon, steps=steps)
        print(res)
        return 0 if res.get("status") == "SUCCESS" else 2
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
