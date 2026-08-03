# Analytics Integration QA

## Validation Areas

### Routes

- Validated `GET /v1/analytics/dashboard` from inside the running `n50-dashboard` container.
- Validated `GET /v1/analytics/flows` from inside the running `n50-dashboard` container.
- Validated `GET /v1/analytics/quality` from inside the running `n50-dashboard` container.
- Validated browser routes through `n50-nginx`:
  - `/analytics`
  - `/analytics/flows`
  - `/analytics/quality`

### Data

- `nse_app` schema exists and is populated.
- Worker migration and refresh completed successfully.
- Latest analytics trade date is `2026-03-06`.
- Latest analytics refresh checks all passed.

### Theming

- New pages use the existing `AppShell`.
- New pages use only repo token variables from `apps/web/src/styles/tokens.css`.
- Forbidden-color grep against the new analytics page files returned no hard-coded color values.
- Header/footer remained unchanged except for a single new `Analytics` action button.

### Runtime behavior

- `nse-analytics-worker` container starts, migrates, refreshes, and stays healthy.
- `n50-dashboard` rebuild succeeded after route integration.
- `n50-nginx` served the new routes without requiring a second dashboard service.

## Concrete Validation Results

### Worker

- `docker compose logs nse-analytics-worker` showed:
  - migrations for `001_control.sql`, `010_views.sql`, `020_analysis_queries.sql`
  - `refresh-all` execution
  - all DQ checks passing

### API payload checks

- `/v1/analytics/dashboard`
  - returned `tradeDate = 2026-03-06`
  - returned market summary, regime history, watchlist, grouped signals, and learner table data
- `/v1/analytics/flows`
  - returned `tradeDate = 2026-03-06`
  - returned flow leaders and announcement data
  - returned truthful empty arrays for bulk and block deals
- `/v1/analytics/quality`
  - returned freshness data for raw, feature, signal, and summary layers
  - returned latest job run, quality checks, and pipeline audit rows

### UI checks via Playwright

- `/analytics`
  - rendered market regime hero, breadth metrics, watchlist table, signal explorer, and historical learner table
- `/analytics/flows`
  - rendered flow leaders, latest announcements, and empty-state deal panels
- `/analytics/quality`
  - rendered freshness metrics, recent jobs, quality checks, and pipeline audit

## Known Validation Caveats

- `corepack pnpm --filter @app/web build` succeeded locally.
- `corepack pnpm --filter @app/api build` in the local shell reported broad pre-existing TypeScript issues unrelated to this integration path.
- The actual deployment build used by Docker succeeded for both API and web inside the `n50-dashboard` image, which is the authoritative runtime validation for this stack.
- Local lint is not a useful gate at the moment because the repo currently lints generated `dist` artifacts and already has unrelated baseline failures.
