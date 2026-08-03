from __future__ import annotations

import json
import subprocess
from urllib import error, request

from .logging_utils import get_logger

log = get_logger(__name__)


def _is_discord_webhook(url: str) -> bool:
    return "discord.com/api/webhooks/" in url or "discordapp.com/api/webhooks/" in url


def _discord_content(payload: dict) -> str:
    event_type = str(payload.get("event_type") or "state").upper()
    market_open = "yes" if payload.get("market_open") else "no"
    metrics = payload.get("metrics") or {}
    lines = [
        f"[{event_type}] {payload.get('alert_key')}",
        f"status={payload.get('status')} severity={payload.get('severity')}",
        str(payload.get("message") or "").strip(),
        f"observed={payload.get('observed')} threshold={payload.get('threshold')}",
        f"trade_date={payload.get('trade_date')} index_code={payload.get('index_code')} market_open={market_open}",
        f"checked_at={payload.get('checked_at')}",
        (
            "source_minute={source} raw_minute={raw} snapshot={snapshot}".format(
                source=metrics.get("latest_source_minute"),
                raw=metrics.get("latest_raw_security_minute"),
                snapshot=metrics.get("latest_snapshot"),
            )
        ),
        (
            "source_age_seconds={source_age} raw_lag_minutes={raw_lag} snapshot_lag_minutes={snapshot_lag} live_stock_count={live_count}".format(
                source_age=metrics.get("source_age_seconds"),
                raw_lag=metrics.get("raw_lag_minutes"),
                snapshot_lag=metrics.get("snapshot_lag_minutes"),
                live_count=metrics.get("live_stock_count"),
            )
        ),
    ]
    return "\n".join(line for line in lines if line).strip()[:1900]


def _request_body(webhook_url: str, payload: dict) -> bytes:
    if _is_discord_webhook(webhook_url):
        return json.dumps({"content": _discord_content(payload)}, default=str).encode("utf-8")
    return json.dumps(payload, default=str).encode("utf-8")


def _send_discord_webhook(*, webhook_url: str, payload: dict) -> bool:
    body = json.dumps({"content": _discord_content(payload)}, default=str)
    result = subprocess.run(
        [
            "curl",
            "-sS",
            "-o",
            "/tmp/intraday_discord_webhook.out",
            "-w",
            "%{http_code}",
            "-H",
            "Content-Type: application/json",
            "-H",
            "Accept: application/json",
            "-A",
            "Mozilla/5.0",
            "-d",
            body,
            webhook_url,
        ],
        text=True,
        capture_output=True,
        check=False,
    )
    status_text = (result.stdout or "").strip()
    try:
        status_code = int(status_text)
    except ValueError:
        status_code = None
    response_body = ""
    try:
        with open("/tmp/intraday_discord_webhook.out", "r", encoding="utf-8", errors="replace") as handle:
            response_body = handle.read()
    except FileNotFoundError:
        response_body = ""

    if result.returncode == 0 and status_code is not None and 200 <= status_code < 300:
        log.info("intraday discord webhook delivered status=%s alert_key=%s", status_code, payload.get("alert_key"))
        return True

    log.error(
        "intraday discord webhook failed returncode=%s status=%s stderr=%s body=%s",
        result.returncode,
        status_code,
        (result.stderr or "").strip(),
        response_body,
    )
    return False


def send_webhook_alert(
    *,
    enabled: bool,
    webhook_url: str,
    timeout_seconds: int,
    headers: dict[str, str],
    payload: dict,
) -> bool:
    if not enabled or not webhook_url:
        return False
    if _is_discord_webhook(webhook_url):
        return _send_discord_webhook(webhook_url=webhook_url, payload=payload)

    body = _request_body(webhook_url, payload)
    req = request.Request(
        webhook_url,
        data=body,
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "trading-stack-intraday-alerts/1.0",
            **headers,
        },
        method="POST",
    )
    try:
        with request.urlopen(req, timeout=timeout_seconds) as resp:
            status_code = getattr(resp, "status", None) or resp.getcode()
            log.info("intraday alert webhook delivered status=%s alert_key=%s", status_code, payload.get("alert_key"))
            return True
    except error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        log.error("intraday alert webhook HTTP error status=%s body=%s", exc.code, detail)
    except error.URLError as exc:
        log.error("intraday alert webhook URL error: %s", exc)
    except Exception:
        log.exception("intraday alert webhook delivery failed")
    return False
