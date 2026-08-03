from __future__ import annotations

import logging
import os
from datetime import datetime

from apscheduler.schedulers.blocking import BlockingScheduler
from apscheduler.triggers.cron import CronTrigger

from nse_reco_state_aware_engine.core.config import settings
from nse_reco_state_aware_engine.core.logging import configure_logging
from nse_reco_state_aware_engine.jobs.service import run_job

logger = logging.getLogger(__name__)


def _job(name: str, steps: str) -> None:
    logger.info("scheduler_trigger", extra={"job": name, "steps": steps})
    step_list = [s.strip() for s in steps.split(",") if s.strip()]
    run_job(job_name=name, trade_date=None, index_code=settings.DEFAULT_INDEX_CODE, horizon=settings.DEFAULT_HORIZON, steps=step_list)


def main() -> int:
    configure_logging(settings.LOG_LEVEL)
    if not settings.SCHEDULER_ENABLED:
        logger.warning("scheduler_disabled")
        return 0

    sched = BlockingScheduler(timezone="Asia/Kolkata")

    sched.add_job(lambda: _job("baselines", "baselines"), CronTrigger.from_crontab(settings.CRON_REFRESH_BASELINES), id="baselines", replace_existing=True)
    sched.add_job(lambda: _job("regime_anom_reco", "regime,anomalies,recommendations,watchlists"), CronTrigger.from_crontab(settings.CRON_REFRESH_RECOMMENDATIONS), id="reco", replace_existing=True)
    sched.add_job(lambda: _job("anomalies", "anomalies"), CronTrigger.from_crontab(settings.CRON_REFRESH_ANOMALIES), id="anomalies", replace_existing=True)
    sched.add_job(lambda: _job("scorecards", "scorecards"), CronTrigger.from_crontab(settings.CRON_REFRESH_SCORECARDS), id="scorecards", replace_existing=True)
    sched.add_job(lambda: _job("quality_retention", "quality,retention"), CronTrigger.from_crontab(settings.CRON_REFRESH_QUALITY), id="quality", replace_existing=True)

    logger.info("scheduler_started")
    sched.start()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
