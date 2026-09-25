from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo

from .config import get_settings
from .db import get_conn
from .scalper_signals import _send_whatsapp

IST = ZoneInfo("Asia/Kolkata")
MAX_AGE = timedelta(minutes=10)


def _price(value: Any) -> str:
    if value is None:
        return "unavailable"
    try:
        return f"{float(value):,.2f}"
    except (TypeError, ValueError):
        return "unavailable"


def render_home_mw5_whatsapp(event: dict[str, Any]) -> str:
    payload = event["payload"]
    detected = event["snapshot_time"]
    bar_started = event["five_minute_bar_started_at"]
    if isinstance(detected, str):
        detected = datetime.fromisoformat(detected.replace("Z", "+00:00"))
    if isinstance(bar_started, str):
        bar_started = datetime.fromisoformat(bar_started.replace("Z", "+00:00"))
    lines = [
        f"HOME MWHD {event['direction']} · {event['symbol']} · 5m qualified",
        f"Detected: {detected.astimezone(IST).strftime('%d %b %Y · %H:%M:%S IST')}",
        f"5-minute candle start: {bar_started.astimezone(IST).strftime('%H:%M IST')} · Route: {event['route']}",
        f"Current value: ₹{_price(payload.get('currentValue'))}",
        "Passed conditions:",
    ]
    for gate in payload.get("gates", []):
        lines.append(
            f"✓ {gate['id']} · {gate['label']}: "
            f"{_price(gate.get('left'))} {gate.get('operator', '')} {_price(gate.get('right'))}"
        )
    lines.append("Screener qualification only — not an order, trade or execution.")
    return "\n".join(lines)


def _claim_one(now: datetime) -> dict[str, Any] | None:
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("""
          UPDATE nse_ops.home_mw5_qualification_outbox AS q
             SET status='PROCESSING',attempt_count=q.attempt_count+1,
                 lease_expires_at=%(lease)s,updated_at=now()
           WHERE q.event_key=(
             SELECT event_key
               FROM nse_ops.home_mw5_qualification_outbox
              WHERE ((status IN ('PENDING','RETRY') AND available_at<=now())
                     OR (status='PROCESSING' AND lease_expires_at<now()))
                AND snapshot_time >= now() - interval '10 minutes'
                AND trade_date=(now() AT TIME ZONE 'Asia/Kolkata')::date
              ORDER BY snapshot_time,created_at
              FOR UPDATE SKIP LOCKED LIMIT 1
           )
          RETURNING q.*
        """, {"lease": now + timedelta(seconds=45)})
        row = cur.fetchone()
        conn.commit()
        return dict(row) if row else None


def _mark_stale() -> int:
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("""
          UPDATE nse_ops.home_mw5_qualification_outbox
             SET status='SUPPRESSED_STALE',lease_expires_at=NULL,
                 last_error='SNAPSHOT_OLDER_THAN_10_MINUTES',updated_at=now()
           WHERE status IN ('PENDING','RETRY','PROCESSING')
             AND snapshot_time < now() - interval '10 minutes'
        """)
        count = cur.rowcount
        conn.commit()
        return count


def _finish(event_key: str, status: str, error: str | None, http_status: int | None,
            retry_at: datetime | None = None) -> None:
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("""
          UPDATE nse_ops.home_mw5_qualification_outbox
             SET status=%(status)s,available_at=coalesce(%(retry)s,available_at),
                 lease_expires_at=NULL,
                 delivered_at=CASE WHEN %(status)s='DELIVERED' THEN now() ELSE delivered_at END,
                 last_http_status=%(http)s,last_error=%(error)s,updated_at=now()
           WHERE event_key=%(key)s
        """, {"status": status, "retry": retry_at, "http": http_status,
              "error": error, "key": event_key})
        conn.commit()


def deliver_home_mw5_alerts(limit: int = 25, now: datetime | None = None) -> dict[str, int | str]:
    settings = get_settings()
    now = now or datetime.now(timezone.utc)
    stale = _mark_stale()
    delivered = failed = suppressed = 0
    if not settings.scalper_whatsapp_enabled:
        return {"state": "DISABLED", "delivered": 0, "failed": 0, "suppressed_stale": stale}
    for _ in range(max(0, min(limit, 100))):
        event = _claim_one(now)
        if event is None:
            break
        age = now - event["snapshot_time"].astimezone(timezone.utc)
        if age < timedelta(0) or age > MAX_AGE:
            _finish(event["event_key"], "SUPPRESSED_STALE", "SNAPSHOT_OUTSIDE_10_MINUTE_WINDOW", None)
            suppressed += 1
            continue
        try:
            ok, status, error = _send_whatsapp(event["event_key"], render_home_mw5_whatsapp(event))
        except Exception as exc:
            ok, status, error = False, None, type(exc).__name__
        if ok:
            _finish(event["event_key"], "DELIVERED", None, status)
            delivered += 1
        else:
            attempts = int(event["attempt_count"])
            terminal = attempts >= 4
            wait_seconds = min(60 * (2 ** max(attempts - 1, 0)), 300)
            _finish(event["event_key"], "DEAD" if terminal else "RETRY",
                    error or "DELIVERY_FAILED", status,
                    None if terminal else now + timedelta(seconds=wait_seconds))
            failed += 1
    return {"state": "COMPLETE", "delivered": delivered, "failed": failed,
            "suppressed_stale": stale + suppressed}
