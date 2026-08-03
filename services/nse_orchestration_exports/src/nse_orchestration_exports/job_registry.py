from __future__ import annotations

from dataclasses import dataclass

from .config import get_settings


@dataclass(frozen=True)
class JobDefinition:
    job_key: str
    title: str
    cron_expr: str
    command_text: str
    timeout_sec: int


def default_jobs() -> list[JobDefinition]:
    settings = get_settings()
    return [
        JobDefinition("ingest_recent", "Ingest recent daily files", settings.cron_ingest_recent, settings.job_cmd_ingest_recent, 5400),
        JobDefinition("refresh_features", "Refresh compact features", settings.cron_refresh_features, settings.job_cmd_refresh_features, 5400),
        JobDefinition("refresh_summaries", "Refresh dashboard summaries", settings.cron_refresh_summaries, settings.job_cmd_refresh_summaries, 3600),
        JobDefinition("refresh_watchlists", "Refresh watchlists", settings.cron_refresh_watchlists, settings.job_cmd_refresh_watchlists, 3600),
        JobDefinition("refresh_exports", "Refresh export cache", settings.cron_refresh_exports, settings.job_cmd_refresh_exports, 3600),
        JobDefinition("refresh_quality", "Run quality checks", settings.cron_refresh_quality, settings.job_cmd_refresh_quality, 1800),
        JobDefinition("retention", "Retention cleanup", settings.cron_retention, settings.job_cmd_retention, 3600),
        JobDefinition("weekly_history", "Refresh historical learner", settings.cron_weekly_history, settings.job_cmd_weekly_history, 7200),
    ]
