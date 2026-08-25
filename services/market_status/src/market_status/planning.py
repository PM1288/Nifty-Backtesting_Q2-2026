from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any

from .config import Settings


@dataclass(frozen=True)
class PlannedJob:
    job_name: str
    slot: str
    scheduled_for: datetime
    status: str = "PENDING"
    reason: str | None = None
    metrics: dict[str, Any] = field(default_factory=dict)


def at(trade_date: date, value: Any, timezone: Any) -> datetime:
    return datetime.combine(trade_date, value, tzinfo=timezone)


def plan_daily_jobs(
    current: datetime, calendar: dict[str, Any], settings: Settings
) -> list[PlannedJob]:
    if not calendar["is_trading_day"]:
        return []

    if calendar["special_session"]:
        required_times = (
            "open_send_time",
            "open_retry_deadline",
            "movers_send_time",
            "movers_retry_deadline",
            "regular_close_trigger_time",
            "finalisation_not_before_time",
            "finalisation_cutoff_time",
            "delayed_cutoff_time",
        )
        if any(calendar.get(name) is None for name in required_times):
            return [
                PlannedJob(
                    job_name=name,
                    slot="SPECIAL_SESSION",
                    scheduled_for=current,
                    status="SUPPRESSED",
                    reason="SPECIAL_SESSION_TIME_UNAVAILABLE",
                )
                for name in ("MARKET_OPEN", "MARKET_MOVERS", "MARKET_CLOSE")
            ]

    def select(calendar_name: str, default: Any) -> Any:
        return calendar[calendar_name] if calendar["special_session"] else default

    planned: list[PlannedJob] = []
    for job_name, send_time, deadline in (
        (
            "MARKET_OPEN",
            select("open_send_time", settings.market_open_send_time),
            select("open_retry_deadline", settings.market_open_retry_deadline),
        ),
        (
            "MARKET_MOVERS",
            select("movers_send_time", settings.movers_send_time),
            select("movers_retry_deadline", settings.movers_retry_deadline),
        ),
    ):
        due = at(current.date(), send_time, settings.timezone)
        cutoff = at(current.date(), deadline, settings.timezone)
        if current < due:
            continue
        late = current > cutoff
        planned.append(
            PlannedJob(
                job_name=job_name,
                slot=send_time.isoformat(),
                scheduled_for=due,
                status="SUPPRESSED" if late else "PENDING",
                reason="MISSED_NOTIFICATION_DEADLINE" if late else None,
                metrics={"deadline": cutoff.isoformat()},
            )
        )

    close_trigger = select("regular_close_trigger_time", settings.close_trigger_time)
    final_not_before = select("finalisation_not_before_time", settings.close_final_not_before)
    final_deadline = select("finalisation_cutoff_time", settings.close_final_deadline)
    delayed_cutoff = select("delayed_cutoff_time", settings.close_delayed_cutoff)
    trigger = at(current.date(), close_trigger, settings.timezone)
    if current >= trigger:
        final_due = at(current.date(), final_not_before, settings.timezone)
        final_cutoff = at(current.date(), delayed_cutoff, settings.timezone)
        late = current > final_cutoff
        planned.append(
            PlannedJob(
                job_name="MARKET_CLOSE",
                slot=close_trigger.isoformat(),
                scheduled_for=final_due,
                status="SUPPRESSED" if late else "PENDING",
                reason="EOD_NOT_FINAL" if late else None,
                metrics={
                    "trigger": trigger.isoformat(),
                    "final_not_before": final_due.isoformat(),
                    "final_deadline": at(
                        current.date(), final_deadline, settings.timezone
                    ).isoformat(),
                    "delayed_cutoff": final_cutoff.isoformat(),
                },
            )
        )
    return planned
