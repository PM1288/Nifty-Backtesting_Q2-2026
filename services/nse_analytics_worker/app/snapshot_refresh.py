from __future__ import annotations

import json
import logging
from typing import Any
from urllib import error, request

from .config import Settings

logger = logging.getLogger(__name__)


def trigger_snapshot_refresh(settings: Settings, keys: list[str] | None = None) -> dict[str, Any]:
    refresh_url = (settings.snapshot_refresh_url or "").strip()
    refresh_token = (settings.snapshot_refresh_token or "").strip()

    if not refresh_url or not refresh_token:
        return {
            "snapshot_refresh_status": "skipped",
            "snapshot_refresh_reason": "missing_configuration",
        }

    payload = json.dumps({"keys": keys or []}).encode("utf-8")
    req = request.Request(
        refresh_url,
        data=payload,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            "X-Snapshot-Refresh-Token": refresh_token,
        },
    )

    try:
        with request.urlopen(req, timeout=settings.snapshot_refresh_timeout_seconds) as response:
            raw_body = response.read().decode("utf-8")
            body = json.loads(raw_body) if raw_body else {}
            return {
                "snapshot_refresh_status": "ok",
                "snapshot_refresh_http_status": response.status,
                "snapshot_refresh_elapsed_ms": body.get("elapsedMs"),
                "snapshot_refresh_keys": body.get("refreshedKeys", []),
            }
    except error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")
        logger.warning("Snapshot refresh failed with HTTP %s: %s", exc.code, detail)
        return {
            "snapshot_refresh_status": "http_error",
            "snapshot_refresh_http_status": exc.code,
            "snapshot_refresh_error": detail[:400],
        }
    except Exception as exc:  # pragma: no cover - network failures are environment dependent
        logger.warning("Snapshot refresh request failed: %s", exc)
        return {
            "snapshot_refresh_status": "request_failed",
            "snapshot_refresh_error": str(exc)[:400],
        }
