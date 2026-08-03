# Analytics Integration Decisions

## Scope

- Reviewed the instruction bundle in `tmp/review/trading_stack_n50_docs/trading-stack-n50-dashboard-1_docs_bundle`.
- Unzipped the analytics overlay into `tmp/review/nse_analytics_dashboard_suite`.
- Inspected the existing stack first and treated `neon-stock-terminal` as the integration target.

## Existing Stack Findings

- The current dashboard stack already has a React/Vite web app in `apps/web`.
- The current dashboard stack already has an Express/Prisma API in `apps/api`.
- The current visual language is already defined by `apps/web/src/styles/tokens.css` and the `AppShell`.
- The current routing model is flat registrar-based API files and sibling React routes, not nested feature sub-apps.
- The repo already has Docker Compose wiring for `n50-dashboard`; a second dashboard app would have duplicated both UI and deployment surface.

## Decision Log

### 1. Do not bolt on the Streamlit dashboard

- Decision: `CONVERT_TO_STACK_EQUIVALENT`
- Reason: the repo already has a production-facing web shell and route system.
- Outcome: the overlay Streamlit pages were translated into native `apps/web` routes and native `apps/api` JSON endpoints.

### 2. Keep the analytics compute layer as a dedicated worker

- Decision: `ADAPT_TO_STACK`
- Reason: the repo did not already have a general-purpose analytics job runner, but the overlay compute logic is useful and independent from the web runtime.
- Outcome: created `services/nse_analytics_worker` to own migrations, refreshes, DQ checks, and periodic materialization into `nse_app`.

### 3. Keep analytics data separate from raw ingest schema

- Decision: `KEEP_AS_IS`
- Reason: the overlay only writes derived analytics tables and operational tables under `nse_app`, while raw ingest continues to belong to `nse`.
- Outcome: preserved `nse` for raw ingest and `nse_app` for derived analytics.

### 4. Reuse the existing shell and theme everywhere

- Decision: `KEEP_AS_IS`
- Reason: the current stack already satisfies the black/white/neon red/neon green contract.
- Outcome: analytics pages live under the same `AppShell`, use the same CSS variables, and expose a single new header action for `Analytics`.

### 5. Expose analytics as `/v1/analytics/*`

- Decision: `ADAPT_TO_STACK`
- Reason: existing API structure uses one registrar per feature area, and analytics needs multiple related read-only endpoints.
- Outcome: added a dedicated registrar `apps/api/src/routes/analytics.ts` with:
  - `GET /v1/analytics/dashboard`
  - `GET /v1/analytics/flows`
  - `GET /v1/analytics/quality`

### 6. Keep analytics reads guest-accessible

- Decision: `ADAPT_TO_STACK`
- Reason: current market reads such as overview and RSI surface are guest-readable, and analytics is read-only.
- Outcome: extended the guest allowlist in `apps/api/src/auth/guard.ts` for `/analytics` and `/v1/analytics`.

### 7. Collapse the overlay's many pages into three stack-native surfaces

- Decision: `CONVERT_TO_STACK_EQUIVALENT`
- Reason: the existing app is compact and route-driven; a one-to-one page port would have added route noise without increasing data coverage.
- Outcome:
  - `/analytics` covers overview, regime/breadth, signal explorer, and historical learner
  - `/analytics/flows` covers events and flows
  - `/analytics/quality` covers data quality, freshness, jobs, and pipeline audit

### 8. Preserve truthful empty states

- Decision: `KEEP_AS_IS`
- Reason: raw bulk/block deal tables are currently empty in retained data, and the UI must not fabricate records.
- Outcome: flows page renders explicit empty states for those sections.

### 9. Prefer runtime validation over local lint noise

- Decision: `ADAPT_TO_STACK`
- Reason: local repo lint is already noisy because generated `dist` files are included and several pre-existing source files fail current rules.
- Outcome: validation relied on:
  - successful Docker image build for `n50-dashboard`
  - live API responses from the running container
  - Playwright route and rendering checks through `n50-nginx`

### 10. Keep docs inside the repo, not beside it

- Decision: `KEEP_AS_IS`
- Reason: instruction bundle requires repo-local integration records.
- Outcome: integration decisions, merge register, QA notes, and final summary were written under `neon-stock-terminal/docs`.
