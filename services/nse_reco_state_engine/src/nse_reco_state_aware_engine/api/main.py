from __future__ import annotations

import logging
from time import perf_counter

from fastapi import FastAPI
from fastapi import Request

from nse_reco_state_aware_engine.api.router import router
from nse_reco_state_aware_engine.core.config import settings
from nse_reco_state_aware_engine.core.logging import configure_logging
from nse_reco_state_aware_engine.db.conn import db_conn, ping

configure_logging(settings.LOG_LEVEL)
logger = logging.getLogger(__name__)

app = FastAPI(title="NSE Reco Engine", version="1.0.0")
app.include_router(router)


@app.get("/health")
def health() -> dict:
    with db_conn() as conn:
        ping(conn)
    return {
        "status": "ok",
        "db": {
            "pool": {
                "size": settings.DB_POOL_SIZE,
                "maxOverflow": settings.DB_POOL_MAX_OVERFLOW,
                "timeoutSeconds": settings.DB_POOL_TIMEOUT_SECONDS,
                "recycleSeconds": settings.DB_POOL_RECYCLE_SECONDS,
            },
        },
        "retention": {
            "days": settings.RETENTION_DAYS,
        },
    }


@app.middleware("http")
async def log_requests(request: Request, call_next):
    started_at = perf_counter()
    try:
        response = await call_next(request)
    except Exception:
        logger.exception(
            "api_request_failed method=%s path=%s duration_ms=%.2f",
            request.method,
            request.url.path,
            (perf_counter() - started_at) * 1000.0,
        )
        raise

    logger.info(
        "api_request_completed method=%s path=%s status=%s duration_ms=%.2f",
        request.method,
        request.url.path,
        response.status_code,
        (perf_counter() - started_at) * 1000.0,
    )
    return response
