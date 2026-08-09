from __future__ import annotations

import hashlib
import hmac
import json
import time
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Annotated, Any, cast

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from prometheus_client import CONTENT_TYPE_LATEST, Counter, Gauge, Histogram, generate_latest

from .config import get_settings
from .contracts import BuildingGroupRequest, CloseIntent, Leg, Problem, TradeIntent
from .db import Database
from .events import append_event
from .logging import configure_logging
from .service import IdempotencyConflict, NotFound, PaperService

REQUESTS = Counter("paper_api_requests_total", "Paper API requests", ["method", "path", "status"])
LATENCY = Histogram("paper_api_request_duration_seconds", "Paper API latency", ["path"])
OPEN_GROUPS = Gauge("paper_open_trade_groups", "Open paper trade groups")
OUTBOX_DEPTH = Gauge("paper_webhook_outbox_depth", "Undelivered webhook outbox rows")
STALE_INSTRUMENTS = Gauge("paper_stale_instruments", "Open stale market-data incidents")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    configure_logging(settings.LOG_LEVEL)
    db = Database(settings)
    db.open()
    app.state.settings = settings
    app.state.db = db
    app.state.service = PaperService(db, settings.PAPER_TRADING_SCHEMA)
    yield
    db.close()


app = FastAPI(
    title="Universal Paper Trading API",
    version="1.0.0",
    description="PAPER ONLY. No broker or live-order capability exists.",
    lifespan=lifespan,
)


@app.middleware("http")
async def metrics_middleware(request: Request, call_next: Any) -> Response:
    started = time.monotonic()
    response = cast(Response, await call_next(request))
    REQUESTS.labels(request.method, request.url.path, str(response.status_code)).inc()
    LATENCY.labels(request.url.path).observe(time.monotonic() - started)
    response.headers["X-Trading-Environment"] = "PAPER"
    return response


def auth(request: Request, authorization: Annotated[str | None, Header()] = None) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Bearer service token required")
    digest = hashlib.sha256(authorization[7:].encode()).hexdigest()
    if not any(
        hmac.compare_digest(digest, expected) for expected in request.app.state.settings.token_hashes()
    ):
        raise HTTPException(401, "invalid service token")
    return digest


def service(request: Request) -> PaperService:
    return cast(PaperService, request.app.state.service)


@app.exception_handler(IdempotencyConflict)
async def conflict(_: Request, exc: IdempotencyConflict) -> JSONResponse:
    return JSONResponse(
        status_code=409,
        content=Problem(
            type="urn:papertrading:problem:idempotency-conflict",
            title="Idempotency conflict",
            status=409,
            detail=str(exc),
        ).model_dump(),
    )


@app.exception_handler(NotFound)
async def missing(_: Request, exc: NotFound) -> JSONResponse:
    return JSONResponse(
        status_code=404,
        content=Problem(
            type="urn:papertrading:problem:not-found", title="Not found", status=404, detail=str(exc)
        ).model_dump(),
    )


async def record_trade_rejection(request: Request, detail: str) -> None:
    if request.url.path != "/api/v1/trade-intents" or not hasattr(request.app.state, "db"):
        return
    authorization = request.headers.get("Authorization", "")
    if not authorization.startswith("Bearer "):
        return
    digest = hashlib.sha256(authorization[7:].encode()).hexdigest()
    if not any(
        hmac.compare_digest(digest, expected) for expected in request.app.state.settings.token_hashes()
    ):
        return
    try:
        payload = json.loads((await request.body()).decode() or "{}")
    except (UnicodeDecodeError, json.JSONDecodeError):
        payload = {"unparseable": True}
    source = payload.get("source", {}).get("service", "UNKNOWN")
    aggregate, correlation = str(uuid.uuid4()), str(uuid.uuid4())
    with request.app.state.db.connection() as conn:
        conn.execute(
            f"INSERT INTO {request.app.state.settings.PAPER_TRADING_SCHEMA}.request_audit(source_service,correlation_id,authentication_result,operation,result,detail) VALUES (%s,%s,'PASS','CREATE_TRADE_INTENT','REJECTED',%s::jsonb)",
            (source, correlation, json.dumps({"error": detail, "request": payload}, default=str)),
        )
        append_event(
            conn,
            request.app.state.settings.PAPER_TRADING_SCHEMA,
            "trade_intent",
            aggregate,
            "com.papertrading.trade_intent.rejected.v1",
            correlation,
            {"event_name": "trade_intent.rejected", "reason": detail, "source_service": source},
        )


@app.exception_handler(RequestValidationError)
async def request_invalid(request: Request, exc: RequestValidationError) -> JSONResponse:
    await record_trade_rejection(request, str(exc))
    return JSONResponse(
        status_code=422,
        content=Problem(
            type="urn:papertrading:problem:contract-validation",
            title="Contract validation failed",
            status=422,
            detail="request does not match the PAPER trade contract",
        ).model_dump(),
    )


@app.exception_handler(ValueError)
async def invalid(request: Request, exc: ValueError) -> JSONResponse:
    await record_trade_rejection(request, str(exc))
    return JSONResponse(
        status_code=422,
        content=Problem(
            type="urn:papertrading:problem:validation", title="Validation failed", status=422, detail=str(exc)
        ).model_dump(),
    )


@app.post("/api/v1/trade-intents", status_code=202)
def create_trade(
    intent: TradeIntent,
    response: Response,
    request: Request,
    _: Annotated[str, Depends(auth)],
    idempotency_key: Annotated[str, Header(alias="Idempotency-Key", min_length=8, max_length=200)],
    s: Annotated[PaperService, Depends(service)],
    x_correlation_id: Annotated[str | None, Header(alias="X-Correlation-Id")] = None,
) -> dict[str, Any]:
    result, status = s.create_trade(intent, idempotency_key, x_correlation_id)
    response.status_code = status
    return result


@app.get("/api/v1/trade-intents/{intent_id}")
def get_intent(intent_id: str, request: Request, _: Annotated[str, Depends(auth)]) -> dict[str, Any]:
    with request.app.state.db.connection() as conn:
        row = conn.execute(
            f"SELECT * FROM {request.app.state.settings.PAPER_TRADING_SCHEMA}.trade_intents WHERE trade_intent_id=%s",
            (intent_id,),
        ).fetchone()
        if not row:
            raise NotFound("trade intent not found")
        return {"environment": "PAPER", **dict(row)}


@app.get("/api/v1/trade-groups/{group_id}")
def get_group(
    group_id: str, _: Annotated[str, Depends(auth)], s: Annotated[PaperService, Depends(service)]
) -> dict[str, Any]:
    return s.get_group(group_id)


@app.get("/api/v1/trade-groups")
def list_groups(
    _: Annotated[str, Depends(auth)],
    s: Annotated[PaperService, Depends(service)],
    account_id: str | None = None,
    status: str | None = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
) -> dict[str, Any]:
    return {"environment": "PAPER", "items": s.list_groups(account_id, status, limit)}


@app.post("/api/v1/trade-groups/building", status_code=201)
def create_building_group(
    body: BuildingGroupRequest,
    response: Response,
    _: Annotated[str, Depends(auth)],
    idempotency_key: Annotated[str, Header(alias="Idempotency-Key", min_length=8)],
    s: Annotated[PaperService, Depends(service)],
) -> dict[str, Any]:
    result, status = s.create_building_group(body, idempotency_key)
    response.status_code = status
    return result


@app.post("/api/v1/trade-groups/{group_id}/close-intents", status_code=202)
def close_group(
    group_id: str,
    body: CloseIntent,
    response: Response,
    _: Annotated[str, Depends(auth)],
    idempotency_key: Annotated[str, Header(alias="Idempotency-Key", min_length=8)],
    s: Annotated[PaperService, Depends(service)],
) -> dict[str, Any]:
    result, status = s.close_trade(group_id, body, idempotency_key)
    response.status_code = status
    return result


@app.post("/api/v1/trade-groups/{group_id}/cancel")
def cancel(
    group_id: str,
    request: Request,
    _: Annotated[str, Depends(auth)],
    idempotency_key: Annotated[str, Header(alias="Idempotency-Key", min_length=8)],
) -> dict[str, Any]:
    schema = request.app.state.settings.PAPER_TRADING_SCHEMA
    with request.app.state.db.connection() as conn:
        group = conn.execute(
            f"SELECT status FROM {schema}.trade_groups WHERE trade_group_id=%s FOR UPDATE", (group_id,)
        ).fetchone()
        if not group:
            raise NotFound("trade group not found")
        if group["status"] not in {"BUILDING", "PENDING_ENTRY"}:
            raise ValueError("only unfilled groups can be cancelled")
        conn.execute(
            f"UPDATE {schema}.paper_orders SET status='CANCELLED' WHERE trade_group_id=%s AND status IN ('NEW','ACCEPTED')",
            (group_id,),
        )
        conn.execute(
            f"UPDATE {schema}.trade_groups SET status='CANCELLED',fully_closed=false WHERE trade_group_id=%s",
            (group_id,),
        )
        return {
            "environment": "PAPER",
            "trade_group_id": group_id,
            "status": "CANCELLED",
            "idempotency_key": idempotency_key,
        }


@app.post("/api/v1/trade-groups/{group_id}/legs", status_code=201)
def add_leg(
    group_id: str,
    body: Leg,
    _: Annotated[str, Depends(auth)],
    s: Annotated[PaperService, Depends(service)],
) -> dict[str, Any]:
    return s.add_building_leg(group_id, body)


@app.post("/api/v1/trade-groups/{group_id}/commit")
def commit(group_id: str, request: Request, _: Annotated[str, Depends(auth)]) -> dict[str, Any]:
    return request.app.state.service.commit_building_group(group_id)


@app.get("/api/v1/accounts/{account_id}/summary")
def account_summary(account_id: str, request: Request, _: Annotated[str, Depends(auth)]) -> dict[str, Any]:
    schema = request.app.state.settings.PAPER_TRADING_SCHEMA
    with request.app.state.db.connection() as conn:
        account = conn.execute(
            f"SELECT * FROM {schema}.accounts WHERE account_id=%s", (account_id,)
        ).fetchone()
        if not account:
            raise NotFound("account not found")
        perf = conn.execute(
            f"SELECT count(*) filter(where status='OPEN') open_groups,count(*) filter(where fully_closed) closed_groups FROM {schema}.trade_groups WHERE account_id=%s",
            (account_id,),
        ).fetchone()
        return {"environment": "PAPER", "account": dict(account), "performance": dict(perf)}


@app.get("/api/v1/strategies/{strategy_id}/performance")
def strategy_performance(
    strategy_id: str, request: Request, _: Annotated[str, Depends(auth)]
) -> dict[str, Any]:
    schema = request.app.state.settings.PAPER_TRADING_SCHEMA
    with request.app.state.db.connection() as conn:
        return {
            "environment": "PAPER",
            "strategy_id": strategy_id,
            "daily": [
                dict(x)
                for x in conn.execute(
                    f"SELECT * FROM {schema}.v_strategy_daily_performance WHERE strategy_id=%s ORDER BY session_date DESC LIMIT 365",
                    (strategy_id,),
                ).fetchall()
            ],
        }


@app.get("/health/live")
def live() -> dict[str, str]:
    return {"status": "live", "environment": "PAPER"}


@app.get("/health/ready")
def ready(request: Request) -> dict[str, Any]:
    try:
        with request.app.state.db.connection() as conn:
            version = conn.execute(
                f"SELECT max(version) version FROM {request.app.state.settings.PAPER_TRADING_SCHEMA}.schema_migrations"
            ).fetchone()["version"]
            conn.execute("SELECT 1")
        return {
            "status": "ready",
            "environment": "PAPER",
            "migration": version,
            "notification_health": "DEGRADED_ALLOWED",
        }
    except Exception as exc:
        raise HTTPException(503, f"database or migration unavailable: {type(exc).__name__}") from exc


@app.get("/metrics")
def metrics(request: Request) -> Response:
    schema = request.app.state.settings.PAPER_TRADING_SCHEMA
    with request.app.state.db.connection() as conn:
        OPEN_GROUPS.set(conn.execute(f"SELECT count(*) n FROM {schema}.v_open_trade_groups").fetchone()["n"])
        OUTBOX_DEPTH.set(
            conn.execute(
                f"SELECT count(*) n FROM {schema}.webhook_outbox WHERE status IN ('PENDING','RETRY','PROCESSING')"
            ).fetchone()["n"]
        )
        STALE_INSTRUMENTS.set(
            conn.execute(
                f"SELECT count(*) n FROM {schema}.data_quality_incidents WHERE incident_type='STALE' AND status='OPEN'"
            ).fetchone()["n"]
        )
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)
