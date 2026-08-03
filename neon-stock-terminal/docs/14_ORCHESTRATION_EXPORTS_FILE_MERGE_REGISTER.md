# Orchestration Exports File Merge Register

## Package intake

Source archive:
- `nse_orchestration_exports_suite.zip`

Temp inspection area:
- `tmp/review/nse_orchestration_exports/nse_orchestration_exports_suite`

## Copied into repo

Copied with minimal structural change:
- `services/nse_orchestration_exports/src/nse_orchestration_exports/*`
- `services/nse_orchestration_exports/sql/*`
- `services/nse_orchestration_exports/contracts/frontend-types.ts`
- `services/nse_orchestration_exports/agent.d/*`
- `services/nse_orchestration_exports/docs/*`
- `services/nse_orchestration_exports/scripts/*`
- `services/nse_orchestration_exports/requirements.txt`
- `services/nse_orchestration_exports/pyproject.toml`
- `services/nse_orchestration_exports/README.md`
- `services/nse_orchestration_exports/.env.example`
- `services/nse_orchestration_exports/docker/Dockerfile`

## Adapted after copy

### Runtime and packaging

- `services/nse_orchestration_exports/docker/Dockerfile`
  - Rebuilt to install orchestration dependencies plus vendored ingestor and analytics worker dependencies.
  - Copies current repo components into one Python image so scheduler commands can call existing stack logic.

- `services/nse_orchestration_exports/src/nse_orchestration_exports/sql_loader.py`
  - Fixed SQL path resolution for the merged repo layout.

- `.env`
  - Added orchestration/export runtime variables and `JOB_CMD_*` bindings.

- `.gitignore`
  - Added ignore rule for generated export files under `services/nse_orchestration_exports/runtime/exports`.

### Compose and networking

- `docker-compose.yml`
  - Added `nse-orchestrator`.
  - Added `nse-export-api`.
  - Wired both to existing Postgres.
  - Mounted export storage.
  - Added `n50-nginx` dependency on `nse-export-api`.

- `compose/n50-nginx/nginx.conf`
  - Added `/api/v1/` proxy to `nse-export-api`.

### Data shaping

- `services/nse_orchestration_exports/src/nse_orchestration_exports/pipeline.py`
  - Reworked to use the live `nse_app` schema from the current stack rather than the package’s assumed schema.
  - Added section mapping from live `analysis_type` values.
  - Added watchlist builders from current signal and feature tables.
  - Added export generation against the merged ops schema.

### Frontend contracts and data hooks

- `neon-stock-terminal/apps/web/src/lib/types.ts`
  - Added orchestration summary, section, watchlist, ops, and export payload types.

- `neon-stock-terminal/apps/web/src/lib/api.ts`
  - Added fetchers for:
  - `/api/v1/dashboard/summary`
  - `/api/v1/dashboard/sections/{section_slug}`
  - `/api/v1/watchlists`
  - `/api/v1/watchlists/{slug}`
  - `/api/v1/watchlists/{slug}/history`
  - `/api/v1/ops/runs`
  - `/api/v1/ops/quality`
  - `/api/v1/exports/manifest`

- `neon-stock-terminal/apps/web/src/lib/hooks.ts`
  - Added React Query hooks for the new orchestration endpoints.

### Frontend pages

- `neon-stock-terminal/apps/web/src/pages/AnalyticsOverviewPage.tsx`
  - Replaced old analytics overview data source with orchestration dashboard summary, sections, and watchlists.

- `neon-stock-terminal/apps/web/src/pages/AnalyticsFlowsPage.tsx`
  - Replaced old flows source with `events-flows` section plus watchlist snapshot/history.

- `neon-stock-terminal/apps/web/src/pages/AnalyticsQualityPage.tsx`
  - Replaced old analytics quality dependency with ops runs, ops quality, export manifest, and `anomalies-risk` section data.

## Intentionally not merged

- A second standalone frontend application from the package.
  - Rejected to preserve one UI shell and one route system.

- Direct router mounting into the Node API.
  - Rejected because the current repo does not already host a Python web app where FastAPI routers could be mounted naturally.

- Compatibility SQL views to emulate the package’s assumed analytics schema.
  - Rejected in favor of adapting the pipeline to the live tables already present in the stack.
