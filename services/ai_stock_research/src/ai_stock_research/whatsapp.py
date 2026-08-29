from __future__ import annotations

import time
from typing import Any

import httpx


def send_message(
    url: str,
    token: str,
    row: dict[str, Any],
    timeout_seconds: int = 20,
    client: httpx.Client | None = None,
) -> tuple[int | None, str, str | None, int]:
    started = time.monotonic()
    status_code: int | None = None
    excerpt = ""
    error_class: str | None = None
    owned = client is None
    http = client or httpx.Client(timeout=httpx.Timeout(timeout_seconds, connect=10))
    try:
        response = http.post(
            url,
            json={"chatId": row["chat_id"], "message": row["message"]},
            headers={
                "Content-Type": "application/json; charset=utf-8",
                "X-API-Token": token,
                "Idempotency-Key": str(row["provider_evaluation_id"]),
                "X-AI-Research-Delivery-Id": str(row["delivery_id"]),
            },
        )
        status_code = response.status_code
        excerpt = response.text[:500]
        if not 200 <= response.status_code < 300:
            error_class = f"HTTP_{response.status_code}"
    except httpx.HTTPError as exc:
        error_class = type(exc).__name__
    finally:
        if owned:
            http.close()
    return status_code, excerpt, error_class, int((time.monotonic() - started) * 1000)
