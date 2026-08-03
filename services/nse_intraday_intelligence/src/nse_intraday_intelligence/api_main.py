from __future__ import annotations

from fastapi import FastAPI

from .config import get_settings
from .db import fetch_val
from .logging_utils import configure_logging
from .routers.exports import router as exports_router
from .routers.intraday import router as intraday_router
from .routers.ops import router as ops_router
from .sql_loader import install_sql


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging(settings.log_level)

    app = FastAPI(
        title="NSE Intraday Intelligence API",
        version="0.1.0",
        docs_url="/docs",
        redoc_url="/redoc",
    )

    if settings.install_sql_on_start:
        @app.on_event("startup")
        def _startup_install_sql() -> None:
            install_sql()

    @app.get("/health")
    def health() -> dict:
        db_ok = fetch_val("select 1 as ok") == 1
        return {
            "status": "ok" if db_ok else "degraded",
            "db": {
                "connected": db_ok,
                "pool": {
                    "minSize": settings.db_pool_min_size,
                    "maxSize": settings.db_pool_max_size,
                    "timeoutSeconds": settings.db_pool_timeout_seconds,
                    "maxIdleSeconds": settings.db_pool_max_idle_seconds,
                },
            },
            "retention": {
                "rawDays": settings.raw_retention_days,
                "minuteDays": settings.minute_retention_days,
                "featureDays": settings.feature_retention_days,
                "snapshotDays": settings.snapshot_retention_days,
                "opsRunDays": settings.ops_run_retention_days,
            },
        }

    app.include_router(intraday_router)
    app.include_router(exports_router)
    app.include_router(ops_router)
    return app


app = create_app()


def main() -> None:
    import uvicorn

    settings = get_settings()
    uvicorn.run("nse_intraday_intelligence.api_main:app", host=settings.api_host, port=settings.api_port, reload=False)


if __name__ == "__main__":
    main()
