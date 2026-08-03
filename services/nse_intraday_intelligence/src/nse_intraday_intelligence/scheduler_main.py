from __future__ import annotations

from apscheduler.schedulers.blocking import BlockingScheduler
from apscheduler.triggers.cron import CronTrigger

from .config import get_settings
from .logging_utils import configure_logging, get_logger
from .pipeline import run_job_key
from .sql_loader import install_sql

log = get_logger(__name__)


def _job_wrapper(job_key: str) -> None:
    run_job_key(job_key, trigger_type="scheduler")


def _register_job(scheduler: BlockingScheduler, cron_expr: str, job_key: str, timezone: str) -> None:
    scheduler.add_job(
        _job_wrapper,
        CronTrigger.from_crontab(cron_expr, timezone=timezone),
        args=[job_key],
        id=job_key,
        max_instances=1,
        coalesce=True,
        misfire_grace_time=30,
    )


def main() -> None:
    settings = get_settings()
    configure_logging(settings.log_level)

    if settings.install_sql_on_start:
        install_sql()

    scheduler = BlockingScheduler(timezone=settings.timezone)

    _register_job(scheduler, settings.cron_sync_raw, "intraday_sync_raw", settings.timezone)
    _register_job(scheduler, settings.cron_refresh_features, "intraday_refresh_features", settings.timezone)
    _register_job(scheduler, settings.cron_refresh_dashboard, "intraday_refresh_dashboard", settings.timezone)
    _register_job(scheduler, settings.cron_refresh_watchlists, "intraday_refresh_watchlists", settings.timezone)
    _register_job(scheduler, settings.cron_run_quality, "intraday_run_quality", settings.timezone)
    _register_job(scheduler, settings.cron_finalize_session, "intraday_finalize_session", settings.timezone)
    _register_job(scheduler, settings.cron_retention, "intraday_retention", settings.timezone)
    _register_job(scheduler, settings.cron_backfill_history, "intraday_backfill_history", settings.timezone)

    log.info("Starting intraday scheduler")
    scheduler.start()


if __name__ == "__main__":
    main()
