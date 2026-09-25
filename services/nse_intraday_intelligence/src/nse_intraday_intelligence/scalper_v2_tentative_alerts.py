from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo

from .config import get_settings
from .db import get_conn
from .scalper_signals import _send_whatsapp

IST = ZoneInfo("Asia/Kolkata")
MAX_AGE = timedelta(minutes=10)


def _number(value: Any, digits: int = 2) -> str:
    if value is None:
        return "unavailable"
    try:
        return f"{float(value):,.{digits}f}"
    except (TypeError, ValueError):
        return "unavailable"


def render_tentative_whatsapp(event: dict[str, Any]) -> str:
    payload = event["payload"]
    by_instrument = {leg["instrument"]: leg for leg in payload["legs"]}
    underlying = by_instrument["UNDERLYING"]
    ce = by_instrument["CE"]
    pe = by_instrument["PE"]
    snapshot = event["snapshot_time"]
    if isinstance(snapshot, str):
        snapshot = datetime.fromisoformat(snapshot.replace("Z", "+00:00"))
    at = snapshot.astimezone(IST).strftime("%d %b %Y · %H:%M IST")
    side = "above" if event["direction"] == "CALL" else "below"

    def leg_line(label: str, leg: dict[str, Any]) -> str:
        ratio = leg.get("volumeToEmaRatio")
        volume = "volume unavailable" if ratio is None else f"volume {float(ratio):.2f}× EMA20"
        return f"{label} {leg['symbol']}: ₹{_number(leg.get('close'))} / EMA9 ₹{_number(leg.get('ema9'))} · {volume}"

    def ist_time(value: str) -> str:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(IST).strftime("%H:%M IST")

    return "\n".join([
        f"TENTATIVE {event['direction']} ENTRY REFERENCE · {event['underlying_symbol']} · 5m",
        f"Snapshot: {at} (completed candle)",
        f"Expiry: {event['expiry']}",
        f"Underlying {side} EMA9: ₹{_number(underlying.get('close'))} / ₹{_number(underlying.get('ema9'))}",
        leg_line("CE", ce),
        leg_line("PE", pe),
        f"Cross times: underlying {ist_time(underlying['crossTime'])} · CE {ist_time(ce['crossTime'])} · PE {ist_time(pe['crossTime'])}",
        "Tentative chart reference only — not an order, trade, fill, target or exit.",
    ])


def _claim_one(now: datetime) -> dict[str, Any] | None:
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("""
          UPDATE nse_ops.scalper_v2_tentative_alert_outbox AS q
             SET status='PROCESSING',attempt_count=q.attempt_count+1,
                 lease_expires_at=%(lease)s,updated_at=now()
           WHERE q.event_key=(
             SELECT event_key
               FROM nse_ops.scalper_v2_tentative_alert_outbox
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
          UPDATE nse_ops.scalper_v2_tentative_alert_outbox
             SET status='SUPPRESSED_STALE',lease_expires_at=NULL,
                 last_error='SNAPSHOT_OLDER_THAN_10_MINUTES',updated_at=now()
           WHERE status IN ('PENDING','RETRY','PROCESSING')
             AND snapshot_time < now() - interval '10 minutes'
        """)
        changed = cur.rowcount
        conn.commit()
        return changed


def _finish(event_key: str, status: str, error: str | None, http_status: int | None, retry_at: datetime | None = None) -> None:
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("""
          UPDATE nse_ops.scalper_v2_tentative_alert_outbox
             SET status=%(status)s,available_at=coalesce(%(retry)s,available_at),
                 lease_expires_at=NULL,delivered_at=CASE WHEN %(status)s='DELIVERED' THEN now() ELSE delivered_at END,
                 last_http_status=%(http)s,last_error=%(error)s,updated_at=now()
           WHERE event_key=%(key)s
        """, {"status": status, "retry": retry_at, "http": http_status, "error": error, "key": event_key})
        conn.commit()


def deliver_scalper_v2_tentative_alerts(limit: int = 25, now: datetime | None = None) -> dict[str, int | str]:
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
            ok, status, error = _send_whatsapp(event["event_key"], render_tentative_whatsapp(event))
        except Exception as exc:  # fail closed and retain a bounded retry record
            ok, status, error = False, None, type(exc).__name__
        if ok:
            _finish(event["event_key"], "DELIVERED", None, status)
            delivered += 1
        else:
            attempts = int(event["attempt_count"])
            terminal = attempts >= 4
            wait_seconds = min(60 * (2 ** max(attempts - 1, 0)), 300)
            _finish(event["event_key"], "DEAD" if terminal else "RETRY", error or "DELIVERY_FAILED", status,
                    None if terminal else now + timedelta(seconds=wait_seconds))
            failed += 1
    return {"state": "COMPLETE", "delivered": delivered, "failed": failed, "suppressed_stale": stale + suppressed}
