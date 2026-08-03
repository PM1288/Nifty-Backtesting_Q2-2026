# Integration guide for the coding agent

This package is intentionally conservative. Do not redesign existing screens, token systems, or application routing.
Treat the application shell as the source of truth for branding and motion.

## Step 1: Merge the package

Copy the following directories into the application repository:

- `src/nse_orchestration_exports`
- `sql`
- `contracts`
- `agent.d`
- `scripts`
- selected docs from `docs`

Add Python dependencies from `requirements.txt`.

## Step 2: Install SQL

Apply `sql/*.sql` in numeric order.
Prefer using:
```bash
python scripts/install_sql.py
```

## Step 3: Wire commands

Update `.env` so the scheduler knows how to call existing pipeline steps:
- `JOB_CMD_INGEST_RECENT`
- `JOB_CMD_REFRESH_FEATURES`
- `JOB_CMD_REFRESH_SUMMARIES`
- `JOB_CMD_RETENTION`
- `JOB_CMD_WEEKLY_HISTORY`

If your app already exposes Python functions for these, you may replace shell commands with direct adapter calls in `src/nse_orchestration_exports/job_adapter.py`.

## Step 4: Mount API

Option A:
- run `nse-export-api` as a separate sidecar service

Option B:
- import and include the routers into the main app

```python
from nse_orchestration_exports.routers.dashboard import router as dashboard_router
from nse_orchestration_exports.routers.watchlists import router as watchlists_router
from nse_orchestration_exports.routers.exports import router as exports_router
from nse_orchestration_exports.routers.ops import router as ops_router

app.include_router(dashboard_router)
app.include_router(watchlists_router)
app.include_router(exports_router)
app.include_router(ops_router)
```

## Step 5: Frontend bindings

The frontend should consume:
- `/api/v1/dashboard/summary`
- `/api/v1/dashboard/sections/{section_slug}`
- `/api/v1/watchlists`
- `/api/v1/watchlists/{slug}`

Do not invent color decisions in the frontend.
Use:
- `direction`
- `accent_token`
- `arrow`
from the payloads and map them to the existing token system.

## Step 6: Acceptance checks

The integration is complete only if all are true:

1. SQL bootstrap succeeds.
2. `/health` returns `ok`.
3. `/api/v1/dashboard/summary` returns a payload for the latest trade date.
4. `/api/v1/watchlists` returns at least the seeded system watchlists.
5. Triggering `POST /api/v1/ops/run/refresh_summaries` creates a `job_run`.
6. `GET /api/v1/exports/manifest` lists generated files after the export job runs.
7. The frontend renders the summary without adding any non-approved colors.

## Step 7: Non-negotiable constraints

- Do not add blue, yellow, purple, or gray hex colors anywhere.
- Do not change footer disclaimer semantics.
- Do not turn learning summaries into trade instructions.
- Do not use same-day surveillance flags as predictive input if they were published after the session close.
