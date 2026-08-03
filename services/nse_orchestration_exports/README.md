# NSE Orchestration + Export API Package

This package is the third layer in the stack. It assumes the following are already integrated into your application:

1. **Daily ingestor** for NSE report files into PostgreSQL.
2. **Analytics / dashboard feature layer** that produces `nse_app.market_summary_daily`, `nse_app.security_daily_features`, `nse_app.stock_analysis_signals_daily`, and `nse_app.signal_performance_summary`.
3. **Existing branded UI shell** that will consume API payloads from this package.

## What this package adds

- Scheduled refresh orchestration
- Job/run/quality logging in PostgreSQL
- Watchlist definitions and daily watchlist snapshots
- Dashboard snapshot tables for fast UI reads
- Export APIs for dashboard summaries, sections, and watchlists
- Export file manifest + cleanup
- Integration contracts for code agents and frontend agents

## Assumed schemas from previous layers

The package expects the analytics layer to expose:

- `nse_app.market_summary_daily`
- `nse_app.security_daily_features`
- `nse_app.stock_analysis_signals_daily`
- `nse_app.signal_performance_summary`

See `docs/DATA_CONTRACT.md`.

## Integration modes

### Mode A: Sidecar services
Use `docker-compose.overlay.yml` to run:
- `nse-orchestrator`
- `nse-export-api`

The services talk directly to PostgreSQL and invoke existing app CLI commands via the `JOB_CMD_*` environment variables.

### Mode B: In-process integration
If you already have a FastAPI / Starlette app:
- import routers from `nse_orchestration_exports.routers.*`
- include them under your existing API prefix
- keep the scheduler as a separate service or run it as a management container

## Installation

```bash
cp .env.example .env
# edit JOB_CMD_* values to point to your integrated application CLI
docker compose -f docker-compose.yml -f docker-compose.overlay.yml up -d --build
```

## SQL bootstrap

`INSTALL_SQL_ON_START` is now a transitional, explicit opt-in and defaults to off in the main stack.
Use the central runner or the manual install command instead of relying on startup SQL in production.
You can also install manually:

```bash
docker compose exec nse-export-api python scripts/install_sql.py
```

## DB pool controls

- `NSE_EXPORT_DB_POOL_MIN_SIZE`
- `NSE_EXPORT_DB_POOL_MAX_SIZE`
- `NSE_EXPORT_DB_POOL_TIMEOUT_SECONDS`
- `NSE_EXPORT_DB_POOL_MAX_IDLE_SECONDS`

The main stack defaults to a small bounded pool and exposes the effective values on `GET /health`.

## Key tables added by this package

- `nse_ops.job_definition`
- `nse_ops.job_run`
- `nse_ops.job_step_log`
- `nse_ops.quality_check_result`
- `nse_ops.export_manifest`
- `nse_ops.dashboard_snapshot_daily`
- `nse_ops.dashboard_section_daily`
- `nse_ops.watchlist`
- `nse_ops.watchlist_item`
- `nse_ops.watchlist_snapshot_daily`

## Key endpoints

- `GET /health`
- `GET /api/v1/dashboard/summary`
- `GET /api/v1/dashboard/sections/{section_slug}`
- `GET /api/v1/dashboard/ticker-tape`
- `GET /api/v1/watchlists`
- `GET /api/v1/watchlists/{slug}`
- `GET /api/v1/watchlists/{slug}/history`
- `GET /api/v1/exports/dashboard/summary?format=json|csv`
- `GET /api/v1/exports/dashboard/sections/{section_slug}?format=json|csv`
- `GET /api/v1/exports/watchlists/{slug}?format=json|csv`
- `GET /api/v1/exports/manifest`
- `GET /api/v1/ops/jobs`
- `GET /api/v1/ops/runs`
- `POST /api/v1/ops/run/{job_key}`

## Refresh pipeline order

1. Ingest recent daily reports
2. Refresh compact features
3. Refresh market / stock summaries
4. Refresh system watchlists
5. Build export cache
6. Run quality checks
7. Purge old exports and old run logs

## Why this structure works

The UI should read from compact snapshot tables, not rebuild analytics on every page view.
Historical tables still remain available for deep analysis, but the dashboard and exports get low-latency reads from:
- `nse_ops.dashboard_snapshot_daily`
- `nse_ops.dashboard_section_daily`
- `nse_ops.watchlist_snapshot_daily`

## Historical data benefit

Several sections get substantially better once the warehouse has meaningful history:
- breakout reliability
- mean reversion hit rate
- anomaly baselines
- event drift studies
- watchlist stability / churn
- rolling signal performance

See `docs/ANALYSIS_USING_HISTORY.md` and `agent.d/60-rollout-plan.d`.
