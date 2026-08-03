# Orchestration Exports Integration Decisions

## Goal

Integrate `nse_orchestration_exports_suite.zip` into the existing trading stack without introducing a second frontend, a second design system, or a conflicting API origin.

## Decisions

### 1. Keep the frontend inside the existing `n50` app

Decision:
- Reuse the current analytics routes in `neon-stock-terminal/apps/web`.

Reason:
- The repo already has an established shell, navigation model, auth behavior, and CSS token language.
- A separate UI would fragment the visual system and duplicate session handling.

Result:
- `AnalyticsOverviewPage.tsx`, `AnalyticsFlowsPage.tsx`, and `AnalyticsQualityPage.tsx` were adapted to consume the new orchestration payloads while preserving the existing shell and `AnalyticsPage.module.css`.

### 2. Run orchestration and export delivery as Python sidecars

Decision:
- Add two Compose services:
- `nse-orchestrator`
- `nse-export-api`

Reason:
- The repo does not already contain a FastAPI or Starlette host suitable for direct router mounting.
- The package already ships a scheduler and API boundary that fit naturally as Python sidecars.
- This avoids forcing the Node API to re-implement orchestration logic.

Result:
- The package was merged under `services/nse_orchestration_exports`.
- `nse-export-api` serves `/api/v1/*`.
- `nse-orchestrator` owns scheduled job execution and ops tables.

### 3. Preserve a single browser-facing API origin

Decision:
- Proxy `/api/v1/*` through the existing `n50-nginx` service.

Reason:
- The web app already expects one origin and one credential boundary.
- Keeping same-origin routing avoids CORS drift, duplicate environment handling, and frontend URL branching.

Result:
- `compose/n50-nginx/nginx.conf` now proxies `/api/v1/` to `nse-export-api:8091`.
- Existing `/v1/` Node API routes remain unchanged.

### 4. Adapt payload generation to the live database instead of forcing compatibility views

Decision:
- Rewrite the orchestration pipeline to read the current `nse_app` schema directly.

Reason:
- The packaged assumptions did not match the live schema.
- The current repo already has trusted analytics tables populated by the integrated ingestor and analytics worker.
- Compatibility views would add another maintenance layer and hide schema drift.

Examples:
- `nse_app.market_summary_daily` uses `nifty_close`, `nifty_return`, `advancers`, `decliners`.
- `nse_app.security_daily_features` uses `daily_return`, `deliverable_pct`, `total_traded_qty`, `turnover_lacs`.
- `nse_app.stock_analysis_signals_daily` uses `analysis_type`, `signal_name`, `signal_direction`, `signal_strength`, `rationale`.

Result:
- `services/nse_orchestration_exports/src/nse_orchestration_exports/pipeline.py` now maps live signal families into the requested sections:
- `regime-breadth`
- `momentum-breakouts`
- `mean-reversion`
- `delivery-conviction`
- `events-flows`
- `anomalies-risk`
- `historical-learner`

### 5. Reuse the existing ingestor and analytics jobs instead of introducing duplicate job code

Decision:
- Wire `JOB_CMD_*` variables to the already integrated ingestor and analytics worker commands.

Reason:
- The stack already has working job entrypoints.
- Duplicating ingest or analytics logic inside orchestration would create two sources of truth.

Result:
- The orchestration `.env` template and root `.env` point scheduler jobs at:
- vendored `nse_ingestor`
- vendored `nse_analytics_worker`
- local orchestration manual jobs for summaries, watchlists, exports, and quality

### 6. Keep theming semantic and payload-driven

Decision:
- Use `direction`, `accent_token`, and `arrow` exactly as the package requires.

Reason:
- The repo already enforces constrained theming.
- The user explicitly required no extra hues and no color-only signaling drift.

Result:
- The frontend pages read `accent_token` and `direction` from payloads and do not introduce new color logic beyond green/red/white semantic mapping.

### 7. Keep SQL bootstrap owned by the sidecar package

Decision:
- Retain numeric SQL installation order through the orchestration package loader.

Reason:
- The package schema is operational and self-contained under `nse_ops`.
- Keeping bootstrap local to the package reduces coupling and makes service startup reproducible.

Result:
- `services/nse_orchestration_exports/sql/*.sql` is installed on startup when `INSTALL_SQL_ON_START=true`.
- `sql_loader.py` was corrected to resolve the local `sql/` directory in the merged repo layout.
