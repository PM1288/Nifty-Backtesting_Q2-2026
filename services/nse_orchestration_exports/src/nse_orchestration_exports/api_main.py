from __future__ import annotations

from fastapi import FastAPI

from .config import get_settings
from .db import fetch_val
from .logging_utils import configure_logging
from .routers.dashboard import router as dashboard_router
from .routers.watchlists import router as watchlists_router
from .routers.exports import router as exports_router
from .routers.ops import router as ops_router
from .sql_loader import install_sql


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging(settings.log_level)

    app = FastAPI(
        title="NSE Orchestration Export API",
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
                "exportDays": settings.export_retention_days,
                "opsRunDays": settings.ops_run_retention_days,
                "dataStaleDaysMax": settings.data_stale_days_max,
            },
        }

    app.include_router(dashboard_router)
    app.include_router(watchlists_router)
    app.include_router(exports_router)
    app.include_router(ops_router)
    return app


app = create_app()


def main() -> None:
    import uvicorn
    settings = get_settings()
    uvicorn.run("nse_orchestration_exports.api_main:app", host=settings.api_host, port=settings.api_port, reload=False)


if __name__ == "__main__":
    main()
