from datetime import datetime, time

from market_status.config import Settings
from market_status.planning import plan_daily_jobs


def settings() -> Settings:
    return Settings(DATABASE_URL="postgresql://example.invalid/db")


def regular(trading: bool = True) -> dict:
    return {
        "is_trading_day": trading,
        "special_session": False,
        "open_send_time": time(9, 16, 5),
        "open_retry_deadline": time(9, 18),
        "movers_send_time": time(9, 20, 5),
        "movers_retry_deadline": time(9, 22),
        "regular_close_trigger_time": time(15, 30),
        "finalisation_not_before_time": time(15, 42),
        "finalisation_cutoff_time": time(15, 50),
        "delayed_cutoff_time": time(18),
    }


def moment(hour: int, minute: int, second: int = 0) -> datetime:
    config = settings()
    return datetime(2026, 8, 11, hour, minute, second, tzinfo=config.timezone)


def test_weekend_or_holiday_produces_no_jobs():
    assert plan_daily_jobs(moment(10, 0), regular(False), settings()) == []


def test_open_and_movers_are_enqueued_only_inside_deadline():
    planned = plan_daily_jobs(moment(9, 20, 5), regular(), settings())
    assert [(job.job_name, job.status) for job in planned] == [
        ("MARKET_OPEN", "SUPPRESSED"),
        ("MARKET_MOVERS", "PENDING"),
    ]
    assert planned[0].reason == "MISSED_NOTIFICATION_DEADLINE"


def test_missed_intraday_jobs_never_become_late_pending_work():
    planned = plan_daily_jobs(moment(12, 0), regular(), settings())
    assert all(job.status == "SUPPRESSED" for job in planned)
    assert {job.job_name for job in planned} == {"MARKET_OPEN", "MARKET_MOVERS"}


def test_close_is_finalisation_job_not_a_1530_send():
    planned = plan_daily_jobs(moment(15, 30), regular(), settings())
    close = next(job for job in planned if job.job_name == "MARKET_CLOSE")
    assert close.scheduled_for.hour == 15 and close.scheduled_for.minute == 42
    assert close.metrics["final_deadline"].endswith("15:50:00+05:30")
    assert close.metrics["delayed_cutoff"].endswith("18:00:00+05:30")


def test_eod_delayed_catchup_before_cutoff_and_suppression_after_cutoff():
    before = next(
        job
        for job in plan_daily_jobs(moment(17, 59), regular(), settings())
        if job.job_name == "MARKET_CLOSE"
    )
    after = next(
        job
        for job in plan_daily_jobs(moment(18, 0, 1), regular(), settings())
        if job.job_name == "MARKET_CLOSE"
    )
    assert before.status == "PENDING"
    assert after.status == "SUPPRESSED" and after.reason == "EOD_NOT_FINAL"


def test_special_session_uses_overrides():
    calendar = regular()
    calendar.update(
        special_session=True,
        open_send_time=time(18, 16, 5),
        open_retry_deadline=time(18, 18),
        movers_send_time=time(18, 20, 5),
        movers_retry_deadline=time(18, 22),
        regular_close_trigger_time=time(20, 30),
        finalisation_not_before_time=time(20, 42),
        finalisation_cutoff_time=time(20, 50),
        delayed_cutoff_time=time(21),
    )
    planned = plan_daily_jobs(moment(18, 20, 5), calendar, settings())
    assert [(job.job_name, job.status) for job in planned] == [
        ("MARKET_OPEN", "SUPPRESSED"),
        ("MARKET_MOVERS", "PENDING"),
    ]


def test_special_session_without_times_suppresses_all_jobs():
    calendar = regular()
    calendar.update(special_session=True, movers_send_time=None)
    planned = plan_daily_jobs(moment(9, 0), calendar, settings())
    assert len(planned) == 3
    assert all(job.reason == "SPECIAL_SESSION_TIME_UNAVAILABLE" for job in planned)
