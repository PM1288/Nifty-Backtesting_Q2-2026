from __future__ import annotations

import json
import time
from datetime import date, datetime
from typing import Any

import typer
import uvicorn

from .config import Settings, get_settings
from .db import Database
from .logging import configure_logging
from .monitor import Monitor
from .scheduler import Scheduler
from .webhook import WebhookWorker

app = typer.Typer(no_args_is_help=True)


def opened() -> tuple[Settings, Database]:
    settings = get_settings()
    configure_logging(settings.LOG_LEVEL)
    db = Database(settings)
    db.open()
    return settings, db


@app.command()
def migrate() -> None:
    _, db = opened()
    db.migrate()
    db.close()
    typer.echo("paper_trading migration complete")


@app.command("verify-config")
def verify_config() -> None:
    settings = get_settings()
    typer.echo(
        json.dumps(
            {
                "status": "PASS",
                "paper_only": settings.PAPER_TRADING_ONLY,
                "schema": settings.PAPER_TRADING_SCHEMA,
                "webhook_host": settings.N8N_WEBHOOK_URL.host,
            }
        )
    )


@app.command("health")
def health() -> None:
    _, db = opened()
    ok = db.ping()
    db.close()
    typer.echo(json.dumps({"database": ok, "environment": "PAPER"}))
    raise typer.Exit(0 if ok else 1)


@app.command("monitor-once")
def monitor_once() -> None:
    settings, db = opened()
    typer.echo(json.dumps(Monitor(db, settings).once()))
    db.close()


@app.command("monitor-worker")
def monitor_worker() -> None:
    settings, db = opened()
    monitor = Monitor(db, settings)
    try:
        while True:
            monitor.once()
            time.sleep(float(settings.POLL_INTERVAL_SECONDS))
    finally:
        db.close()


@app.command("webhook-once")
def webhook_once(limit: int = 100) -> None:
    settings, db = opened()
    typer.echo(json.dumps({"delivered": WebhookWorker(db, settings).drain(limit)}))
    db.close()


@app.command("webhook-worker")
def webhook_worker() -> None:
    settings, db = opened()
    worker = WebhookWorker(db, settings)
    try:
        while True:
            if not worker.deliver_one():
                time.sleep(1)
    finally:
        db.close()


@app.command("generate-daily-summary")
def daily_summary(session_date: str = typer.Option(..., "--date"), revision: int = 1) -> None:
    settings, db = opened()
    parsed_date = date.fromisoformat(session_date)
    typer.echo(json.dumps(Scheduler(db, settings).daily(parsed_date, revision), default=str))
    db.close()


@app.command("generate-weekly-summary")
def weekly_summary(week_end: str = typer.Option(..., "--week-end"), revision: int = 1) -> None:
    settings, db = opened()
    parsed_end = date.fromisoformat(week_end)
    typer.echo(json.dumps(Scheduler(db, settings).weekly(parsed_end, revision), default=str))
    db.close()


@app.command("scheduler")
def scheduler() -> None:
    settings, db = opened()
    runner = Scheduler(db, settings)
    try:
        while True:
            now = datetime.now(__import__("zoneinfo").ZoneInfo(settings.EXCHANGE_TIMEZONE))
            if now.strftime("%H:%M") == settings.DAILY_SUMMARY_TIME:
                runner.daily(now.date())
            if (
                now.weekday() == settings.WEEKLY_SUMMARY_DAY
                and now.strftime("%H:%M") == settings.WEEKLY_SUMMARY_TIME
            ):
                runner.weekly(now.date())
            time.sleep(60)
    finally:
        db.close()


@app.command("replay-dead-letters")
def replay_dead_letters() -> None:
    settings, db = opened()
    with db.connection() as conn:
        rows = conn.execute(
            f"""
            WITH replayed AS (
                UPDATE {settings.PAPER_TRADING_SCHEMA}.webhook_outbox
                   SET status='RETRY', available_at=now(), attempt_count=0,
                       lease_owner=NULL, lease_expires_at=NULL, last_error=NULL
                 WHERE status='DEAD'
             RETURNING outbox_id
            )
            UPDATE {settings.PAPER_TRADING_SCHEMA}.webhook_dead_letters d
               SET replay_count=d.replay_count+1, last_replayed_at=now()
              FROM replayed r
             WHERE d.outbox_id=r.outbox_id
         RETURNING d.outbox_id
            """
        ).fetchall()
        count = len(rows)
    db.close()
    typer.echo(json.dumps({"replayed": count}))


@app.command("reconcile")
def reconcile(account: str | None = None) -> None:
    settings, db = opened()
    with db.connection() as conn:
        row: Any = conn.execute(
            f"SELECT count(*) n FROM {settings.PAPER_TRADING_SCHEMA}.trade_groups g WHERE fully_closed AND EXISTS(SELECT 1 FROM {settings.PAPER_TRADING_SCHEMA}.trade_legs l WHERE l.trade_group_id=g.trade_group_id AND l.remaining_quantity<>0)"
        ).fetchone()
        invalid = row["n"]
    db.close()
    typer.echo(
        json.dumps(
            {
                "status": "PASS" if invalid == 0 else "FAIL",
                "invalid_closed_groups": invalid,
                "account": account,
            }
        )
    )
    raise typer.Exit(0 if invalid == 0 else 2)


@app.command("api")
def api(host: str = "0.0.0.0", port: int = 8088) -> None:
    uvicorn.run("papertrade.api:app", host=host, port=port)


if __name__ == "__main__":
    app()
