from __future__ import annotations

import argparse
import atexit
from pathlib import Path

from apscheduler.schedulers.blocking import BlockingScheduler
from apscheduler.triggers.cron import CronTrigger

from .command_runner import run_logged_command
from .config import get_settings
from .job_registry import default_jobs
from .logging_utils import configure_logging, get_logger
from .pipeline import run_quality_checks
from .sql_loader import install_sql

log = get_logger(__name__)


def _parse_cron(expr: str, timezone: str) -> CronTrigger:
    minute, hour, day, month, dow = expr.split()
    return CronTrigger(minute=minute, hour=hour, day=day, month=month, day_of_week=dow, timezone=timezone)


def _run_job(job_key: str, command_text: str, timeout_sec: int, trigger_type: str) -> None:
    if not command_text:
        log.warning("Skipping job %s because command is empty", job_key)
        return
    result = run_logged_command(job_key, command_text, trigger_type=trigger_type, timeout_sec=timeout_sec)
    if job_key in {"refresh_summaries", "refresh_exports", "refresh_quality"}:
        run_quality_checks(parent_run_id=result.run_id)
    log.info("Job %s completed with exit_code=%s duration_ms=%s", job_key, result.exit_code, result.duration_ms)


def run_once(job_key: str) -> None:
    settings = get_settings()
    jobs = {job.job_key: job for job in default_jobs()}
    if job_key not in jobs:
        raise SystemExit(f"Unknown job key: {job_key}")
    job = jobs[job_key]
    _run_job(job.job_key, job.command_text, job.timeout_sec, trigger_type="manual")


def main() -> None:
    settings = get_settings()
    configure_logging(settings.log_level)

    parser = argparse.ArgumentParser(description="NSE orchestration scheduler")
    parser.add_argument("--run-once", dest="run_once_key", help="Run a single job and exit")
    args = parser.parse_args()

    if settings.install_sql_on_start:
        install_sql()

    if args.run_once_key:
        run_once(args.run_once_key)
        return

    scheduler = BlockingScheduler(timezone=settings.timezone)
    for job in default_jobs():
        if not job.command_text:
            log.warning("Job %s has no command configured; leaving unscheduled", job.job_key)
            continue
        scheduler.add_job(
            _run_job,
            trigger=_parse_cron(job.cron_expr, settings.timezone),
            id=job.job_key,
            replace_existing=True,
            kwargs={
                "job_key": job.job_key,
                "command_text": job.command_text,
                "timeout_sec": job.timeout_sec,
                "trigger_type": "scheduled",
            },
        )
        log.info("Scheduled job %s on cron %s", job.job_key, job.cron_expr)

    atexit.register(lambda: scheduler.shutdown(wait=False))
    log.info("Starting scheduler in timezone %s", settings.timezone)
    scheduler.start()


if __name__ == "__main__":
    main()
