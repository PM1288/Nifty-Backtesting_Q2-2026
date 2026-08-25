"""Durable, new-record-only webhook delivery."""
from __future__ import annotations

import hashlib
from pathlib import Path

import requests

from config import SETTINGS
from incremental_storage import mark_outbox_delivered, mark_outbox_failed, pending_outbox
from utils import LOGGER


def _read_token() -> str | None:
    if not SETTINGS.webhook_token_file:
        return None
    path = Path(SETTINGS.webhook_token_file)
    if not path.is_file():
        return None
    value = path.read_text(encoding="utf-8").strip()
    return value or None


def _money(value) -> str | None:
    if value in (None, ""):
        return None
    try:
        return f"₹{float(value):,.2f}"
    except (TypeError, ValueError):
        return str(value)


def _percent(value) -> str | None:
    if value in (None, ""):
        return None
    try:
        return f"{float(value):+.2f}%"
    except (TypeError, ValueError):
        return str(value)


def build_message(rows: list[dict]) -> str:
    symbols = sorted({str(row["payload"].get("nse_symbol") or "UNKNOWN") for row in rows})
    lines = [
        f"*TRENDLYNE — {len(rows)} NEW RESEARCH REPORT{'S' if len(rows) != 1 else ''}*",
        f"{len(symbols)} symbol{'s' if len(symbols) != 1 else ''} · PostgreSQL updated",
        "",
    ]
    for row in rows[:20]:
        item = row["payload"]
        symbol = str(item.get("nse_symbol") or item.get("stock_name") or "UNKNOWN").upper()
        company_name = str(item.get("stock_name") or item.get("company_name") or symbol).strip()
        identity = f"{company_name} ({symbol})" if company_name.upper() != symbol else symbol
        recommendation = str(item.get("recommendation") or item.get("report_type") or "REPORT").upper()
        details = [str(item.get("report_date") or "date unavailable"), str(item.get("broker_name") or "broker unavailable")]
        if _money(item.get("target_price")):
            details.append(f"Target {_money(item.get('target_price'))}")
        if _percent(item.get("upside_pct")):
            details.append(f"Upside {_percent(item.get('upside_pct'))}")
        lines.append(f"*{identity}* · {recommendation}")
        lines.append(" · ".join(details))
    if len(rows) > 20:
        lines.append("")
        lines.append(f"+{len(rows) - 20} additional new reports stored in the database")
    lines.extend(["", "Only newly inserted report IDs are included; existing rows are suppressed."])
    return "\n".join(lines)


def dispatch_pending() -> dict:
    if not SETTINGS.webhook_enabled:
        return {"enabled": False, "pending": 0, "delivered": 0}
    if not SETTINGS.webhook_url:
        raise RuntimeError("WEBHOOK_ENABLED=true but WEBHOOK_URL is empty")

    rows = pending_outbox(max(1, SETTINGS.webhook_batch_size))
    if not rows:
        return {"enabled": True, "pending": 0, "delivered": 0}

    report_ids = [str(row["report_id"]) for row in rows]
    idempotency_key = "trendlyne:" + hashlib.sha256("|".join(report_ids).encode()).hexdigest()
    message = build_message(rows)
    payload = (
        {"chatId": SETTINGS.webhook_chat_id, "message": message}
        if SETTINGS.webhook_chat_id
        else {
            "event_type": "trendlyne.research_reports.inserted.v1",
            "event_id": idempotency_key,
            "new_report_count": len(rows),
            "report_ids": report_ids,
            "message": message,
        }
    )
    headers = {"Idempotency-Key": idempotency_key, "Content-Type": "application/json"}
    token = _read_token()
    if token:
        headers["X-API-Token"] = token

    try:
        response = requests.post(
            SETTINGS.webhook_url,
            json=payload,
            headers=headers,
            timeout=SETTINGS.webhook_timeout_sec,
        )
        response.raise_for_status()
    except Exception as exc:
        mark_outbox_failed(report_ids, f"{type(exc).__name__}: {exc}")
        LOGGER.error("New-report webhook failed for %d reports: %s", len(report_ids), exc)
        return {"enabled": True, "pending": len(rows), "delivered": 0, "error": str(exc)}

    mark_outbox_delivered(report_ids)
    LOGGER.info("New-report webhook delivered for %d reports", len(report_ids))
    return {"enabled": True, "pending": len(rows), "delivered": len(rows)}


def drain_pending(max_batches: int = 100) -> dict:
    """Deliver every pending outbox row in bounded, idempotent batches."""
    total_delivered = 0
    batches = 0
    last_result: dict = {"enabled": SETTINGS.webhook_enabled, "pending": 0, "delivered": 0}
    while batches < max_batches:
        last_result = dispatch_pending()
        batches += 1
        delivered = int(last_result.get("delivered", 0))
        total_delivered += delivered
        if delivered == 0 or delivered < max(1, SETTINGS.webhook_batch_size):
            break
    return {
        **last_result,
        "batches": batches,
        "delivered": total_delivered,
        "batch_limit_reached": batches >= max_batches,
    }
